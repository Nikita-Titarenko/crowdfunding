import { verifyOnEtherscan } from "./verify-utils.js";

const rawArgs = process.argv.slice(2);
const address = process.env.VERIFICATION_ADDRESS ?? rawArgs[0];
const registry = process.env.VERIFICATION_REGISTRY ?? rawArgs[1];
const token = process.env.VERIFICATION_TOKEN ?? rawArgs[2];
const priceFeed = process.env.VERIFICATION_PRICE_FEED ?? rawArgs[3];
const title = process.env.VERIFICATION_TITLE ?? rawArgs[4];
const goalUsd = process.env.VERIFICATION_GOAL_USD ?? rawArgs[5];
const duration = process.env.VERIFICATION_DURATION ?? rawArgs[6];
const beneficiary = process.env.VERIFICATION_BENEFICIARY ?? rawArgs[7];

if (!address || !registry || !token || !priceFeed || !title || !goalUsd || !duration || !beneficiary) {
  throw new Error(
    "Usage: set VERIFICATION_ADDRESS, VERIFICATION_REGISTRY, VERIFICATION_TOKEN, VERIFICATION_PRICE_FEED, VERIFICATION_TITLE, VERIFICATION_GOAL_USD, VERIFICATION_DURATION, VERIFICATION_BENEFICIARY or pass them as CLI args.",
  );
}

await verifyOnEtherscan({
  address,
  constructorArgs: [registry, token, priceFeed, title, BigInt(goalUsd), BigInt(duration), beneficiary],
  label: "CrowdfundingCampaign",
  contract: "contracts/contracts/CrowdfundingCampaign.sol:CrowdfundingCampaign",
});