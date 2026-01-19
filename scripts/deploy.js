const hre = require("hardhat");

async function main() {
  const Bot = await hre.ethers.getContractFactory("ArbProfitBot");
  const bot = await Bot.deploy();

  await bot.waitForDeployment();

  console.log("ArbProfitBot deployed to:", await bot.getAddress());
  console.log("REMINDER: Copy this address into bot/config.js");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});