import "dotenv/config";

import { network } from "hardhat";
import { verifyOnEtherscan } from "./verify-utils.js";

const existingRegistryAddress = process.env.AUTHOR_REGISTRY_ADDRESS;
const existingTokenAddress = process.env.REWARD_TOKEN_ADDRESS;

const { ethers } = await network.create({
  network: "sepolia",
  chainType: "l1",
});

const [deployer] = await ethers.getSigners();
const feeData = await ethers.provider.getFeeData();
let nextNonce = await ethers.provider.getTransactionCount(deployer.address, "pending");

function nextTxOverrides(gasLimit: bigint) {
  const overrides = {
    nonce: nextNonce,
    gasLimit,
    maxFeePerGas: feeData.maxFeePerGas ?? ethers.parseUnits("30", "gwei"),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei"),
  };

  nextNonce += 1;
  return overrides;
}

console.log("Deploying with account:", deployer.address);
console.log("Existing registry:", existingRegistryAddress ?? "none");
console.log("Existing token:", existingTokenAddress ?? "none");
console.log("Starting nonce:", nextNonce.toString());
console.log("Max fee per gas:", (feeData.maxFeePerGas ?? ethers.parseUnits("30", "gwei")).toString());
console.log("Max priority fee per gas:", (feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei")).toString());

const registry = existingRegistryAddress
  ? await ethers.getContractAt("AuthorRegistry", existingRegistryAddress, deployer)
  : await (async () => {
      const registryFactory = await ethers.getContractFactory("AuthorRegistry", deployer);
      const deployedRegistry = await registryFactory.deploy(nextTxOverrides(3_000_000n));
      await deployedRegistry.waitForDeployment();
      console.log("AuthorRegistry deployed:", await deployedRegistry.getAddress());
      return deployedRegistry;
    })();

if (existingRegistryAddress) {
  console.log("AuthorRegistry reused:", await registry.getAddress());
}

const token = existingTokenAddress
  ? await ethers.getContractAt("RewardToken", existingTokenAddress, deployer)
  : await (async () => {
      const tokenFactory = await ethers.getContractFactory("RewardToken", deployer);
      const deployedToken = await tokenFactory.deploy(nextTxOverrides(3_000_000n));
      await deployedToken.waitForDeployment();
      console.log("RewardToken deployed:", await deployedToken.getAddress());
      return deployedToken;
    })();

if (existingTokenAddress) {
  console.log("RewardToken reused:", await token.getAddress());
}

await verifyOnEtherscan({
  address: await registry.getAddress(),
  constructorArgs: [],
  label: "AuthorRegistry",
  contract: "contracts/contracts/AuthorRegistry.sol:AuthorRegistry",
});

await verifyOnEtherscan({
  address: await token.getAddress(),
  constructorArgs: [],
  label: "RewardToken",
  contract: "contracts/contracts/RewardToken.sol:RewardToken",
});

console.log("Core deployment complete");
console.log("AuthorRegistry:", await registry.getAddress());
console.log("RewardToken:", await token.getAddress());