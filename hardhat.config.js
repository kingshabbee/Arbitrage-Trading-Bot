require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  // --- REPLACE THE OLD solidity LINE WITH THIS BLOCK ---
  solidity: {
    compilers: [
      { version: "0.8.19" }, // For your Bot
      { version: "0.7.6" }   // For Balancer interfaces
    ]
  },
  // ----------------------------------------------------

  networks: {
    arbitrum: {
      url: process.env.ARB_RPC_URL,
      chainId: 42161,
      accounts: [process.env.PRIVATE_KEY]
    },
    tenderly: {
      url: process.env.TENDERLY_RPC_URL,
      chainId: 42161,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};