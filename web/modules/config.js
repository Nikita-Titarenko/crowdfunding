import { ethers } from "../ethers.js";

export const requiredNetwork = {
  chainId: "0xaa36a7",
  name: "Sepolia",
  contracts: {
    registry: "0xd43D5436F35DC34c9338AfA61398862753BeA6F2",
    token: "0x777289D74D53aD98CcE3303f2f922c28640da20f",
    priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  },
};

export const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
export const STORAGE_KEY = "crowdfunding:lastCampaignAddress";