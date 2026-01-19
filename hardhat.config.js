require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
  networks: {
    arbitrum: {
      url: process.env.ARB_RPC_URL, // e.g., https://arb1.arbitrum.io/rpc
      chainId: 42161,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};