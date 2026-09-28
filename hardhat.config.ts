import "dotenv/config";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

const sepoliaRpcUrl = process.env.SEPOLIA_RPC_URL ?? configVariable("SEPOLIA_RPC_URL");
const rawSepoliaPrivateKey = process.env.SEPOLIA_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
const sepoliaPrivateKey =
  rawSepoliaPrivateKey === undefined
    ? configVariable("SEPOLIA_PRIVATE_KEY")
    : rawSepoliaPrivateKey.startsWith("0x")
      ? rawSepoliaPrivateKey
      : `0x${rawSepoliaPrivateKey}`;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin, hardhatVerify],
  coverage: {
    skipFiles: ["contracts/experiments/*.sol"],
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: sepoliaRpcUrl,
      accounts: [sepoliaPrivateKey],
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY ?? configVariable("ETHERSCAN_API_KEY"),
    },
    blockscout: {
      enabled: false,
    },
  },
});
