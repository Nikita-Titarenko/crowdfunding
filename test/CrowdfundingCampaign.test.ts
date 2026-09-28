import { expect } from "chai";
import { network } from "hardhat";
import { deployAndTrack, trackGasUsage } from "./gas-report.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;
const ETH_USD_PRICE = 2_000n * 10n ** 8n;
const APPRECIATED_ETH_USD_PRICE = 2_500n * 10n ** 8n;
const GOAL_USD = ethers.parseUnits("20000", 18);

describe("CrowdfundingCampaign", function () {
  let deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let author: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let supporter: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let beneficiary: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let outsider: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let priceFeed: any;
  let registry: any;
  let token: any;
  let campaign: any;

  async function recordTrackedTx(contractName: string, fn: string, txPromise: Promise<any>) {
    await txPromise;
    await trackGasUsage(contractName, fn, txPromise);
  }

  async function deployCampaign(duration = 30n) {
    priceFeed = await deployAndTrack("MockPriceFeed", ethers.deployContract("MockPriceFeed", [8, ETH_USD_PRICE]));
    registry = await deployAndTrack("AuthorRegistry", ethers.deployContract("AuthorRegistry"));

    const registerAuthorTx = registry.registerAuthor(author.address, "Alice");
    await recordTrackedTx("AuthorRegistry", "registerAuthor", registerAuthorTx);

    token = await deployAndTrack("RewardToken", ethers.deployContract("RewardToken"));

    const campaignFactory = await ethers.getContractFactory("CrowdfundingCampaign");
    campaign = await deployAndTrack(
      "CrowdfundingCampaign",
      campaignFactory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        GOAL_USD,
        duration,
        beneficiary.address,
      ),
    );

    const grantRoleTx = token.grantRole(await token.MINTER_ROLE(), await campaign.getAddress());
    await recordTrackedTx("RewardToken", "grantRole", grantRoleTx);

    return { priceFeed, registry, token, campaign };
  }

  beforeEach(async function () {
    [deployer, author, supporter, beneficiary, outsider] = await ethers.getSigners();
    await deployCampaign();
  });

  it("reverts when registry is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        ethers.ZeroAddress,
        await token.getAddress(),
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        GOAL_USD,
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("reverts when token is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        ethers.ZeroAddress,
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        GOAL_USD,
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("reverts when price feed is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        ethers.ZeroAddress,
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        GOAL_USD,
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("reverts when beneficiary is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        GOAL_USD,
        30n,
        ethers.ZeroAddress,
      ),
    ).to.revert(ethers);
  });

  it("reverts when campaign goal is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        0n,
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("reverts for non-author campaign creation", async function () {
    const noAuthorRegistry = await deployAndTrack("AuthorRegistry", ethers.deployContract("AuthorRegistry"));
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await noAuthorRegistry.getAddress(),
        await token.getAddress(),
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        GOAL_USD,
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("deploys a valid campaign and exposes configuration", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");
    const campaign2: any = await deployAndTrack(
      "CrowdfundingCampaign",
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        await priceFeed.getAddress(),
        "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y",
        ethers.parseUnits("24000", 18),
        45n,
        beneficiary.address,
      ) as Promise<any>,
    );

    const grantRoleTx = token.grantRole(await token.MINTER_ROLE(), await campaign2.getAddress());
    await recordTrackedTx("RewardToken", "grantRole", grantRoleTx);

    expect(await campaign2.metadataCid()).to.equal("bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbz6y");
    expect(await campaign2.goalUsd()).to.equal(ethers.parseUnits("24000", 18));
    expect(await campaign2.deadline()).to.be.greaterThan(0n);
    expect(await campaign2.beneficiary()).to.equal(beneficiary.address);
    expect(await campaign2.priceFeed()).to.equal(await priceFeed.getAddress());
  });

  it("accepts a contribution before the deadline", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });

    await expect(contributeTx)
      .to.emit(campaign, "ContributionReceived")
      .withArgs(supporter.address, ethers.parseEther("3"));
    await trackGasUsage("CrowdfundingCampaign", "contribute", contributeTx);

    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("3"));
    expect(await campaign.contributions(supporter.address)).to.equal(ethers.parseEther("3"));
    expect(await campaign.totalRaisedUsd()).to.equal(ethers.parseUnits("6000", 18));
  });

  it("rejects zero contribution", async function () {
    await expect(campaign.connect(supporter).contribute({ value: 0n })).to.be.revertedWithCustomError(
      campaign,
      "InvalidAmount",
    );
  });

  it("rejects contributions after deadline", async function () {
    const deadline = await campaign.deadline();
    await networkHelpers.time.increaseTo(deadline + 1n);

    await expect(campaign.connect(supporter).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
      campaign,
      "CampaignClosed",
    );
  });

  it("rejects contributions after campaign is finalized", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const withdrawFundsTx = campaign.connect(beneficiary).withdrawFunds();
    await recordTrackedTx("CrowdfundingCampaign", "withdrawFunds", withdrawFundsTx);

    await expect(campaign.connect(supporter).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
      campaign,
      "CampaignClosed",
    );
  });

  it("rejects withdrawal from unauthorized caller", async function () {
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);
    await expect(campaign.connect(outsider).withdrawFunds()).to.be.revertedWithCustomError(campaign, "Unauthorized");
  });

  it("rejects withdraw before deadline", async function () {
    await expect(campaign.connect(beneficiary).withdrawFunds()).to.be.revertedWithCustomError(
      campaign,
      "CampaignStillOpen",
    );
  });

  it("rejects withdraw after deadline if USD goal is not reached", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(beneficiary).withdrawFunds()).to.be.revertedWithCustomError(
      campaign,
      "GoalNotReached",
    );
  });

  it("allows beneficiary to withdraw after USD goal is reached and emit event", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const withdrawFundsTx = campaign.connect(beneficiary).withdrawFunds();

    await expect(withdrawFundsTx)
      .to.emit(campaign, "BeneficiaryWithdrawn")
      .withArgs(beneficiary.address, ethers.parseEther("10"));
    await trackGasUsage("CrowdfundingCampaign", "withdrawFunds", withdrawFundsTx);

    expect(await campaign.finalized()).to.equal(true);
    expect(await ethers.provider.getBalance(await campaign.getAddress())).to.equal(0n);
  });

  it("rejects double withdrawal after finalization", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const withdrawFundsTx = campaign.connect(beneficiary).withdrawFunds();
    await recordTrackedTx("CrowdfundingCampaign", "withdrawFunds", withdrawFundsTx);

    await expect(campaign.connect(beneficiary).withdrawFunds()).to.be.revertedWithCustomError(
      campaign,
      "CampaignClosed",
    );
  });

  it("rejects refund before deadline", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await expect(campaign.connect(supporter).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "CampaignStillOpen",
    );
  });

  it("rejects refund when USD goal was reached", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(supporter).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "GoalReached",
    );
  });

  it("rejects refund for zero contribution", async function () {
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(outsider).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "NoContribution",
    );
  });

  it("refunds failed campaign contributor and zeroes the contribution record", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const beforeBalance = await ethers.provider.getBalance(supporter.address);
    const tx = await campaign.connect(supporter).claimRefund();
    const receipt = await tx.wait();
    const gasCost = BigInt(receipt!.gasUsed) * (receipt!.gasPrice ?? 0n);
    await trackGasUsage("CrowdfundingCampaign", "claimRefund", Promise.resolve(tx));

    await expect(tx).to.emit(campaign, "RefundIssued").withArgs(supporter.address, ethers.parseEther("3"));
    expect(await campaign.contributions(supporter.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(await campaign.getAddress())).to.equal(0n);

    const afterBalance = await ethers.provider.getBalance(supporter.address);
    expect(afterBalance).to.be.greaterThan(beforeBalance - gasCost);
  });

  it("rejects repeated refunds", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const claimRefundTx = campaign.connect(supporter).claimRefund();
    await recordTrackedTx("CrowdfundingCampaign", "claimRefund", claimRefundTx);

    await expect(campaign.connect(supporter).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "AlreadyRefunded",
    );
  });

  it("rejects reward claim before deadline", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await expect(campaign.connect(supporter).claimReward()).to.be.revertedWithCustomError(
      campaign,
      "CampaignStillOpen",
    );
  });

  it("rejects reward claim when USD goal is not reached", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(supporter).claimReward()).to.be.revertedWithCustomError(
      campaign,
      "GoalNotReached",
    );
  });

  it("rejects reward claim when the campaign missed its USD goal", async function () {
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(outsider).claimReward()).to.be.revertedWithCustomError(campaign, "GoalNotReached");
  });

  it("reverts with a clear custom error when the campaign lacks MINTER_ROLE", async function () {
    const revokeRoleTx = token.revokeRole(await token.MINTER_ROLE(), await campaign.getAddress());
    await recordTrackedTx("RewardToken", "revokeRole", revokeRoleTx);

    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(supporter).claimReward()).to.be.revertedWithCustomError(
      campaign,
      "MissingMinterRole",
    );
  });

  it("allows reward claim after USD goal is reached and mints reward tokens", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const claimRewardTx = campaign.connect(supporter).claimReward();

    await expect(claimRewardTx)
      .to.emit(campaign, "RewardClaimed")
      .withArgs(supporter.address, ethers.parseUnits("100", 18));
    await trackGasUsage("CrowdfundingCampaign", "claimReward", claimRewardTx);

    expect(await token.balanceOf(supporter.address)).to.equal(ethers.parseUnits("100", 18));
  });

  it("mints proportional fractional rewards for small ETH contributions", async function () {
    const smallGoal = ethers.parseUnits("1", 18);
    const campaignFactory = await ethers.getContractFactory("CrowdfundingCampaign");
    const smallGoalCampaign = await deployAndTrack(
      "CrowdfundingCampaign",
      campaignFactory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        await priceFeed.getAddress(),
        "Small Goal Campaign",
        smallGoal,
        30n,
        beneficiary.address,
      ),
    );

    const grantRoleTx = token.grantRole(await token.MINTER_ROLE(), await smallGoalCampaign.getAddress());
    await recordTrackedTx("RewardToken", "grantRole", grantRoleTx);

    const contributeTx = smallGoalCampaign.connect(supporter).contribute({ value: ethers.parseEther("0.002") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await smallGoalCampaign.deadline()) + 1n);

    const claimRewardTx = smallGoalCampaign.connect(supporter).claimReward();
    await recordTrackedTx("CrowdfundingCampaign", "claimReward", claimRewardTx);

    expect(await token.balanceOf(supporter.address)).to.equal(ethers.parseUnits("0.02", 18));
  });

  it("rejects repeated reward claims", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const claimRewardTx = campaign.connect(supporter).claimReward();
    await recordTrackedTx("CrowdfundingCampaign", "claimReward", claimRewardTx);

    await expect(campaign.connect(supporter).claimReward()).to.be.revertedWithCustomError(
      campaign,
      "AlreadyClaimed",
    );
  });

  it("returns isSuccessful false before deadline or under USD target", async function () {
    expect(await campaign.isSuccessful()).to.equal(false);

    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    expect(await campaign.isSuccessful()).to.equal(false);
  });

  it("returns isSuccessful true after deadline once USD goal is met", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    expect(await campaign.isSuccessful()).to.equal(true);
  });

  it("allows final contribution at exact last second before deadline", async function () {
    const deadline = await campaign.deadline();
    await networkHelpers.time.setNextBlockTimestamp(deadline - 1n);

    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("1") });

    await expect(contributeTx)
      .to.emit(campaign, "ContributionReceived")
      .withArgs(supporter.address, ethers.parseEther("1"));
    await trackGasUsage("CrowdfundingCampaign", "contribute", contributeTx);
  });

  it("rejects contribution at first second after deadline", async function () {
    const deadline = await campaign.deadline();
    await networkHelpers.time.increaseTo(deadline + 1n);

    await expect(campaign.connect(supporter).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
      campaign,
      "CampaignClosed",
    );
  });

  it("accepts multiple contributions from different supporters before the deadline", async function () {
    const firstContributionTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });
    const secondContributionTx = campaign.connect(outsider).contribute({ value: ethers.parseEther("2") });

    await recordTrackedTx("CrowdfundingCampaign", "contribute", firstContributionTx);
    await recordTrackedTx("CrowdfundingCampaign", "contribute", secondContributionTx);

    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("5"));
    expect(await campaign.contributions(supporter.address)).to.equal(ethers.parseEther("3"));
    expect(await campaign.contributions(outsider.address)).to.equal(ethers.parseEther("2"));
    expect(await campaign.totalRaisedUsd()).to.equal(ethers.parseUnits("10000", 18));
  });

  it("allows multiple users to claim refunds after a failed campaign", async function () {
    const firstContributionTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });
    const secondContributionTx = campaign.connect(outsider).contribute({ value: ethers.parseEther("2") });

    await recordTrackedTx("CrowdfundingCampaign", "contribute", firstContributionTx);
    await recordTrackedTx("CrowdfundingCampaign", "contribute", secondContributionTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const refundFromSupporterTx = campaign.connect(supporter).claimRefund();
    const refundFromOutsiderTx = campaign.connect(outsider).claimRefund();

    await recordTrackedTx("CrowdfundingCampaign", "claimRefund", refundFromSupporterTx);
    await recordTrackedTx("CrowdfundingCampaign", "claimRefund", refundFromOutsiderTx);

    expect(await campaign.contributions(supporter.address)).to.equal(0n);
    expect(await campaign.contributions(outsider.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(await campaign.getAddress())).to.equal(0n);
  });

  it("allows multiple users to claim reward tokens after a successful campaign", async function () {
    const firstContributionTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("6") });
    const secondContributionTx = campaign.connect(outsider).contribute({ value: ethers.parseEther("4") });

    await recordTrackedTx("CrowdfundingCampaign", "contribute", firstContributionTx);
    await recordTrackedTx("CrowdfundingCampaign", "contribute", secondContributionTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const rewardFromSupporterTx = campaign.connect(supporter).claimReward();
    const rewardFromOutsiderTx = campaign.connect(outsider).claimReward();

    await recordTrackedTx("CrowdfundingCampaign", "claimReward", rewardFromSupporterTx);
    await recordTrackedTx("CrowdfundingCampaign", "claimReward", rewardFromOutsiderTx);

    expect(await token.balanceOf(supporter.address)).to.equal(ethers.parseUnits("60", 18));
    expect(await token.balanceOf(outsider.address)).to.equal(ethers.parseUnits("40", 18));
    expect(await campaign.rewardClaimed(supporter.address)).to.equal(true);
    expect(await campaign.rewardClaimed(outsider.address)).to.equal(true);
  });

  it("treats price appreciation as reaching the USD goal", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("9") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);

    expect(await campaign.totalRaisedUsd()).to.equal(ethers.parseUnits("18000", 18));

    const updatePriceTx = priceFeed.updateAnswer(APPRECIATED_ETH_USD_PRICE);
    await recordTrackedTx("MockPriceFeed", "updateAnswer", updatePriceTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    expect(await campaign.totalRaisedUsd()).to.equal(ethers.parseUnits("22500", 18));
    expect(await campaign.isSuccessful()).to.equal(true);
  });
});
