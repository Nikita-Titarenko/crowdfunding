import { expect } from "chai";
import { network } from "hardhat";
import { deployAndTrack, trackGasUsage } from "./gas-report.js";

const connection = await network.create();
const { ethers, networkHelpers } = connection;

describe("CrowdfundingCampaign", function () {
  let deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let author: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let supporter: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let beneficiary: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let outsider: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let registry: any;
  let token: any;
  let campaign: any;

  async function recordTrackedTx(contractName: string, fn: string, txPromise: Promise<any>) {
    await txPromise;
    await trackGasUsage(contractName, fn, txPromise);
  }

  async function deployCampaign(duration = 30n) {
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
        "Launch Campaign",
        ethers.parseEther("10"),
        duration,
        beneficiary.address,
      ),
    );

    const grantRoleTx = token.grantRole(await token.MINTER_ROLE(), await campaign.getAddress());
    await recordTrackedTx("RewardToken", "grantRole", grantRoleTx);

    return { registry, token, campaign };
  }

  beforeEach(async function () {
    [deployer, author, supporter, beneficiary, outsider] = await ethers.getSigners();
    await deployCampaign();
  });

  it("01 should revert when registry is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        ethers.ZeroAddress,
        await token.getAddress(),
        "Bad",
        ethers.parseEther("10"),
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("02 should revert when token is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        ethers.ZeroAddress,
        "Bad",
        ethers.parseEther("10"),
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("03 should revert when beneficiary is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        "Bad",
        ethers.parseEther("10"),
        30n,
        ethers.ZeroAddress,
      ),
    ).to.revert(ethers);
  });

  it("04 should revert when campaign goal is zero", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        "Bad",
        0n,
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("05 should revert for non-author campaign creation", async function () {
    const noAuthorRegistry = await deployAndTrack("AuthorRegistry", ethers.deployContract("AuthorRegistry"));
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");

    await expect(
      factory.connect(author).deploy(
        await noAuthorRegistry.getAddress(),
        await token.getAddress(),
        "Bad",
        ethers.parseEther("10"),
        30n,
        beneficiary.address,
      ),
    ).to.revert(ethers);
  });

  it("06 should deploy a valid campaign and expose configuration", async function () {
    const factory = await ethers.getContractFactory("CrowdfundingCampaign");
    const campaign2 = await deployAndTrack(
      "CrowdfundingCampaign",
      factory.connect(author).deploy(
        await registry.getAddress(),
        await token.getAddress(),
        "Campaign Two",
        ethers.parseEther("12"),
        45n,
        beneficiary.address,
      ),
    );

    const grantRoleTx = token.grantRole(await token.MINTER_ROLE(), await campaign2.getAddress());
    await recordTrackedTx("RewardToken", "grantRole", grantRoleTx);

    expect(await campaign2.title()).to.equal("Campaign Two");
    expect(await campaign2.goal()).to.equal(ethers.parseEther("12"));
    expect(await campaign2.deadline()).to.be.greaterThan(0n);
    expect(await campaign2.beneficiary()).to.equal(beneficiary.address);
  });

  it("07 should accept a contribution before the deadline", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });

    await expect(contributeTx)
      .to.emit(campaign, "ContributionReceived")
      .withArgs(supporter.address, ethers.parseEther("3"));
    await trackGasUsage("CrowdfundingCampaign", "contribute", contributeTx);

    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("3"));
    expect(await campaign.contributions(supporter.address)).to.equal(ethers.parseEther("3"));
  });

  it("08 should reject zero contribution", async function () {
    await expect(campaign.connect(supporter).contribute({ value: 0n })).to.be.revertedWithCustomError(
      campaign,
      "InvalidAmount",
    );
  });

  it("09 should reject contributions after deadline", async function () {
    const deadline = await campaign.deadline();
    await networkHelpers.time.increaseTo(deadline + 1n);

    await expect(campaign.connect(supporter).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
      campaign,
      "CampaignClosed",
    );
  });

  it("10 should reject contributions after campaign is finalized", async function () {
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

  it("11 should reject withdrawal from unauthorized caller", async function () {
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);
    await expect(campaign.connect(outsider).withdrawFunds()).to.be.revertedWithCustomError(campaign, "Unauthorized");
  });

  it("12 should reject withdraw before deadline", async function () {
    await expect(campaign.connect(beneficiary).withdrawFunds()).to.be.revertedWithCustomError(
      campaign,
      "CampaignStillOpen",
    );
  });

  it("13 should reject withdraw after deadline if goal not reached", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(beneficiary).withdrawFunds()).to.be.revertedWithCustomError(
      campaign,
      "GoalNotReached",
    );
  });

  it("14 should allow beneficiary to withdraw after goal is reached and emit event", async function () {
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

  it("15 should reject double withdrawal after finalization", async function () {
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

  it("16 should reject refund before deadline", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await expect(campaign.connect(supporter).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "CampaignStillOpen",
    );
  });

  it("17 should reject refund when goal was reached", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(supporter).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "GoalReached",
    );
  });

  it("18 should reject refund for zero contribution", async function () {
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(outsider).claimRefund()).to.be.revertedWithCustomError(
      campaign,
      "NoContribution",
    );
  });

  it("19 should refund failed campaign contributor and zero contribution record", async function () {
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

  it("20 should reject repeated refunds", async function () {
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

  it("21 should reject reward claim before deadline", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await expect(campaign.connect(supporter).claimReward()).to.be.revertedWithCustomError(
      campaign,
      "CampaignStillOpen",
    );
  });

  it("22 should reject reward claim when goal not reached", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(supporter).claimReward()).to.be.revertedWithCustomError(
      campaign,
      "GoalNotReached",
    );
  });

  it("23 should reject reward claim when the campaign missed its goal", async function () {
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    await expect(campaign.connect(outsider).claimReward()).to.be.revertedWithCustomError(campaign, "GoalNotReached");
  });

  it("24 should allow reward claim after goal reached and mint reward tokens", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const claimRewardTx = campaign.connect(supporter).claimReward();

    await expect(claimRewardTx)
      .to.emit(campaign, "RewardClaimed")
      .withArgs(supporter.address, 100n);
    await trackGasUsage("CrowdfundingCampaign", "claimReward", claimRewardTx);

    expect(await token.balanceOf(supporter.address)).to.equal(100n);
  });

  it("25 should reject repeated reward claims", async function () {
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

  it("26 should return isSuccessful false before deadline or under target", async function () {
    expect(await campaign.isSuccessful()).to.equal(false);

    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("5") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    expect(await campaign.isSuccessful()).to.equal(false);
  });

  it("27 should return isSuccessful true after deadline once goal is met", async function () {
    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("10") });
    await recordTrackedTx("CrowdfundingCampaign", "contribute", contributeTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    expect(await campaign.isSuccessful()).to.equal(true);
  });

  it("28 should allow final contribution at exact last second before deadline", async function () {
    const deadline = await campaign.deadline();
    await networkHelpers.time.setNextBlockTimestamp(deadline - 1n);

    const contributeTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("1") });

    await expect(contributeTx)
      .to.emit(campaign, "ContributionReceived")
      .withArgs(supporter.address, ethers.parseEther("1"));
    await trackGasUsage("CrowdfundingCampaign", "contribute", contributeTx);
  });

  it("29 should reject contribution at first second after deadline", async function () {
    const deadline = await campaign.deadline();
    await networkHelpers.time.increaseTo(deadline + 1n);

    await expect(campaign.connect(supporter).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
      campaign,
      "CampaignClosed",
    );
  });

  it("30 should accept multiple contributions from different supporters before the deadline", async function () {
    const firstContributionTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("3") });
    const secondContributionTx = campaign.connect(outsider).contribute({ value: ethers.parseEther("2") });

    await recordTrackedTx("CrowdfundingCampaign", "contribute", firstContributionTx);
    await recordTrackedTx("CrowdfundingCampaign", "contribute", secondContributionTx);

    expect(await campaign.totalRaised()).to.equal(ethers.parseEther("5"));
    expect(await campaign.contributions(supporter.address)).to.equal(ethers.parseEther("3"));
    expect(await campaign.contributions(outsider.address)).to.equal(ethers.parseEther("2"));
  });

  it("31 should allow multiple users to claim refunds after a failed campaign", async function () {
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

  it("32 should allow multiple users to claim reward tokens after a successful campaign", async function () {
    const firstContributionTx = campaign.connect(supporter).contribute({ value: ethers.parseEther("6") });
    const secondContributionTx = campaign.connect(outsider).contribute({ value: ethers.parseEther("4") });

    await recordTrackedTx("CrowdfundingCampaign", "contribute", firstContributionTx);
    await recordTrackedTx("CrowdfundingCampaign", "contribute", secondContributionTx);
    await networkHelpers.time.increaseTo((await campaign.deadline()) + 1n);

    const rewardFromSupporterTx = campaign.connect(supporter).claimReward();
    const rewardFromOutsiderTx = campaign.connect(outsider).claimReward();

    await recordTrackedTx("CrowdfundingCampaign", "claimReward", rewardFromSupporterTx);
    await recordTrackedTx("CrowdfundingCampaign", "claimReward", rewardFromOutsiderTx);

    expect(await token.balanceOf(supporter.address)).to.equal(60n);
    expect(await token.balanceOf(outsider.address)).to.equal(40n);
    expect(await campaign.rewardClaimed(supporter.address)).to.equal(true);
    expect(await campaign.rewardClaimed(outsider.address)).to.equal(true);
  });
});
