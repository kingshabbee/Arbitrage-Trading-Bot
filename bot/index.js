const { ethers } = require('ethers');
require('dotenv').config();
const config = require('./config');
const botAbi = require('./abi.json'); 

// V2 Router Interface for price checking (getAmountsOut)
const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
];

const provider = new ethers.JsonRpcProvider(process.env.ARB_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Contracts
const botContract = new ethers.Contract(config.BOT_CONTRACT_ADDRESS, botAbi, wallet);
const sushiRouter = new ethers.Contract(config.SUSHI_ROUTER, ROUTER_ABI, provider);
const camelotRouter = new ethers.Contract(config.CAMELOT_ROUTER, ROUTER_ABI, provider);

// Formatter Helpers
const toBigInt = (amount) => ethers.parseUnits(amount.toString(), 18);
const fromBigInt = (amount) => ethers.formatUnits(amount, 18);

console.log("Arbitrage Bot Started...");
console.log(`Wallet: ${wallet.address}`);
console.log(`Targeting $${config.MIN_PROFIT_USD} profit on ${config.BORROW_AMOUNT} ARB loan.`);

const runBot = async () => {
    
    // 1. Setup Amounts & Paths
    const amountIn = toBigInt(config.BORROW_AMOUNT);
    const pathForward = [config.ARB_TOKEN, config.USDC_TOKEN];
    const pathBackward = [config.USDC_TOKEN, config.ARB_TOKEN];

    // 2. Define our pair directions
    const pairs = [
        { name: "Sushi -> Camelot", routerIn: sushiRouter, routerOut: camelotRouter, addressIn: config.SUSHI_ROUTER, addressOut: config.CAMELOT_ROUTER },
        { name: "Camelot -> Sushi", routerIn: camelotRouter, routerOut: sushiRouter, addressIn: config.CAMELOT_ROUTER, addressOut: config.SUSHI_ROUTER }
    ];

    provider.on("block", async (blockNumber) => {
        try {
            console.log(`Scanning Block: ${blockNumber}...`);

            for (const pair of pairs) {
                // --- STEP A: Check Price on Router 1 (Sell ARB, Buy USDC) ---
                let amountsOutA;
                try {
                    amountsOutA = await pair.routerIn.getAmountsOut(amountIn, pathForward);
                } catch (e) {
                    // Sometimes pools don't have enough liquidity and revert reading price
                    continue; 
                }
                const amountUSDC = amountsOutA[1];

                // --- STEP B: Check Price on Router 2 (Sell USDC, Buy ARB) ---
                let amountsOutB;
                try {
                    amountsOutB = await pair.routerOut.getAmountsOut(amountUSDC, pathBackward);
                } catch (e) {
                    continue;
                }
                const amountFinal = amountsOutB[1];

                // --- STEP C: Calculate Profit ---
                const profitWei = amountFinal - amountIn; 
                
                if (profitWei > 0n) {
                    const profitArb = parseFloat(fromBigInt(profitWei));
                    // We assume 1 ARB ~= $1 USD for simplicity. 
                    const minProfitArb = config.MIN_PROFIT_USD; 

                    console.log(`[${pair.name}] Potential: +${profitArb.toFixed(4)} ARB`);

                    // --- STEP D: Execution Decision ---
                    if (profitArb >= minProfitArb) {
                        console.log("!!! PROFIT TARGET HIT - STARTING SIMULATION !!!");
                        
                        // 1. SIMULATE (staticCall)
                        // This checks if the transaction succeeds WITHOUT spending gas
                        try {
                            await botContract.executeArbitrage.staticCall(
                                amountIn,
                                pair.addressIn,
                                pair.addressOut,
                                config.USDC_TOKEN,
                                ethers.parseUnits(minProfitArb.toString(), 18)
                            );
                            
                            console.log(">>> SIMULATION PASSED! Sending Real Transaction...");

                            // 2. EXECUTE (Real Money)
                            const tx = await botContract.executeArbitrage(
                                amountIn,
                                pair.addressIn,
                                pair.addressOut,
                                config.USDC_TOKEN,
                                ethers.parseUnits(minProfitArb.toString(), 18),
                                { gasLimit: config.GAS_LIMIT }
                            );

                            console.log(`Tx Sent: ${tx.hash}`);
                            await tx.wait();
                            console.log("$$$ Transaction Confirmed! Profit Secured $$$");

                        } catch (simError) {
                            console.log("XXX SIMULATION FAILED: Transaction would revert. Skipping.");
                            // console.log(simError.reason); // Uncomment to see exact revert reason
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Scan loop error:", e.message);
        }
    });
};

runBot();