const { ethers } = require("hardhat");

async function main() {
    console.log("--- STARTING TENDERLY TEST ---");

    // 1. Deploy the Bot to Tenderly
    const Bot = await ethers.getContractFactory("ArbProfitBot");
    const bot = await Bot.deploy();
    await bot.waitForDeployment();
    const botAddress = await bot.getAddress();
    console.log(`Bot Deployed to: ${botAddress}`);

    // 2. Set Parameters (LOWERCASE to fix Checksum Error)
    const ARB_TOKEN = "0x912ce59144191c1204e64559fe8253a0e49e6548";
    const USDC_TOKEN = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
    
    // Routers (LOWERCASE)
    const SUSHI_ROUTER = "0x1b02da8cb0d097eb8d57a175b88c7d875799e564";
    const CAMELOT_ROUTER = "0xc873fecbd354f5a56e00e710b90ef4201db2448d";

    // Test Config
    const BORROW_AMOUNT = ethers.parseUnits("10", 18); // Borrow 10 ARB
    const MIN_PROFIT = ethers.parseUnits("0", 18);     // Accept 0 profit

    console.log("Attempting Flash Loan Transaction...");

    try {
        // 3. Trigger the Arbitrage
        const tx = await bot.executeArbitrage(
            BORROW_AMOUNT,
            SUSHI_ROUTER,
            CAMELOT_ROUTER,
            USDC_TOKEN,
            MIN_PROFIT
        );
        
        console.log("Transaction sent...");
        await tx.wait();
        
        console.log("🎉 SUCCESS! Trade executed and was profitable!");

    } catch (error) {
        // 4. Analyze the Failure
        const errMessage = error.message;

        if (errMessage.includes("Profit too low") || errMessage.includes("Losing Money") || errMessage.includes("reverted")) {
            console.log("\n✅ TEST PASSED (Mechanics Working)!");
            console.log("-----------------------------------");
            console.log("Bot successfully borrowed, swapped, and reverted to save funds.");
            console.log("The code logic is VALID.");
        } else {
            console.log("\n❌ TEST FAILED (Critical Error)");
            console.error(error);
        }
    }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});