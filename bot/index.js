const { ethers } = require('ethers');
require('dotenv').config();
const config = require('./config');
const botAbi = require('./abi.json'); 

const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
];

const provider = new ethers.JsonRpcProvider(process.env.TENDERLY_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const botContract = new ethers.Contract(config.BOT_CONTRACT_ADDRESS, botAbi, wallet);
const sushiRouter = new ethers.Contract(config.SUSHI_ROUTER, ROUTER_ABI, provider);
const camelotRouter = new ethers.Contract(config.CAMELOT_ROUTER, ROUTER_ABI, provider);

const toBigInt = (amount) => ethers.parseUnits(amount.toString(), 18);
const fromBigInt = (amount) => ethers.formatUnits(amount, 18);

console.log("--- DEBUGGING CONNECTIONS ---");
console.log(`Token A (Flash): ${config.FLASH_TOKEN}`);
console.log(`Token B (USDC):  ${config.USDC_TOKEN}`);
console.log(`Sushi Router:    ${config.SUSHI_ROUTER}`);

const runBot = async () => {
    const amountIn = toBigInt(config.BORROW_AMOUNT);
    const pathForward = [config.FLASH_TOKEN, config.USDC_TOKEN];
    const pathBackward = [config.USDC_TOKEN, config.FLASH_TOKEN];

    const pairs = [
        { name: "Sushi -> Camelot", routerIn: sushiRouter, routerOut: camelotRouter, addressIn: config.SUSHI_ROUTER, addressOut: config.CAMELOT_ROUTER },
        { name: "Camelot -> Sushi", routerIn: camelotRouter, routerOut: sushiRouter, addressIn: config.CAMELOT_ROUTER, addressOut: config.SUSHI_ROUTER }
    ];

    const scanMarket = async () => {
        try {
            console.log(`\nScanning Block: ${await provider.getBlockNumber()}...`);

            for (const pair of pairs) {
                // STEP A
                let amountsOutA;
                try {
                    // We try to call the router here
                    amountsOutA = await pair.routerIn.getAmountsOut(amountIn, pathForward);
                } catch (e) { 
                    // <--- THIS IS THE NEW DEBUG PART
                    console.log(`[CRITICAL ERROR] ${pair.name} Step A Failed!`);
                    console.log(`Reason: ${e.code || "Unknown Code"}`);
                    console.log(`Message: ${e.shortMessage || e.message}`);
                    continue; 
                }
                const amountUSDC = amountsOutA[1];

                // STEP B
                let amountsOutB;
                try {
                    amountsOutB = await pair.routerOut.getAmountsOut(amountUSDC, pathBackward);
                } catch (e) {
                    console.log(`[CRITICAL ERROR] ${pair.name} Step B Failed!`);
                    console.log(`Message: ${e.shortMessage || e.message}`);
                    continue;
                }
                const amountFinal = amountsOutB[1];

                // Profit Calc
                const profitWei = amountFinal - amountIn; 
                const profitEth = parseFloat(fromBigInt(profitWei));
                
                if (profitWei > 0n) {
                    console.log(`[${pair.name}] PROFIT: +${profitEth.toFixed(6)} WETH`);
                    if (profitEth >= 0) { 
                         console.log("!!! EXECUTING TRADE !!!");
                         try {
                            const tx = await botContract.executeArbitrage(
                                config.FLASH_TOKEN, 
                                amountIn,
                                pair.addressIn,
                                pair.addressOut,
                                config.USDC_TOKEN,
                                ethers.parseUnits("0", 18),
                                { gasLimit: config.GAS_LIMIT }
                            );
                            await tx.wait();
                            console.log("Trade Success!");
                         } catch (err) {
                             console.log("Reverted (Expected):", err.message);
                         }
                    }
                } else {
                    console.log(`[${pair.name}] Loss: ${profitEth.toFixed(6)} WETH`);
                }
            }
        } catch (e) {
            console.error("Global Error:", e.message);
        }
    };

    scanMarket();
    // Increase time to 10 seconds to avoid spamming errors
    setInterval(scanMarket, 10000); 
};

runBot();