import { expect } from "chai";
import { network } from "hardhat";
import { deployAndTrack, trackGasUsage } from "./gas-report.js";

const connection = await network.create();
const { ethers } = connection;

describe("RewardToken", function () {
  let deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let recipient: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let outsider: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let token: any;

  beforeEach(async function () {
    [deployer, recipient, outsider] = await ethers.getSigners();
    token = await deployAndTrack("RewardToken", ethers.deployContract("RewardToken"));
  });

  it("01 should grant deployer as admin and minter", async function () {
    const minterRole = await token.MINTER_ROLE();
    expect(await token.hasRole(minterRole, deployer.address)).to.equal(true);
  });

  it("02 should mint tokens to a valid recipient", async function () {
    const mintTx = token.mint(recipient.address, 1000n);

    await expect(mintTx)
      .to.emit(token, "RewardMinted")
      .withArgs(recipient.address, 1000n, deployer.address);
    await trackGasUsage("RewardToken", "mint", mintTx);

    expect(await token.balanceOf(recipient.address)).to.equal(1000n);
  });

  it("03 should reject mint to zero address", async function () {
    await expect(token.mint(ethers.ZeroAddress, 1000n)).to.be.revertedWithCustomError(token, "ZeroAddress");
  });

  it("04 should reject mint from non minter", async function () {
    await expect(token.connect(outsider).mint(recipient.address, 1000n)).to.revert(ethers);
  });

  it("05 should pause and emit pause event", async function () {
    const pauseTx = token.pause();

    await expect(pauseTx).to.emit(token, "Paused");
    await trackGasUsage("RewardToken", "pause", pauseTx);
    expect(await token.paused()).to.equal(true);
  });

  it("06 should reject pause from unauthorized account", async function () {
    await expect(token.connect(outsider).pause()).to.revert(ethers);
  });

  it("07 should unpause and emit unpause event", async function () {
    const pauseTx = token.pause();
    await pauseTx;
    await trackGasUsage("RewardToken", "pause", pauseTx);

    const unpauseTx = token.unpause();
    await expect(unpauseTx).to.emit(token, "Unpaused");
    await trackGasUsage("RewardToken", "unpause", unpauseTx);
    expect(await token.paused()).to.equal(false);
  });

  it("08 should reject unpause from unauthorized account", async function () {
    await token.pause();
    await expect(token.connect(outsider).unpause()).to.revert(ethers);
  });

  it("09 should block transfers while paused", async function () {
    const mintTx = token.mint(deployer.address, 1000n);
    await mintTx;
    await trackGasUsage("RewardToken", "mint", mintTx);

    const pauseTx = token.pause();
    await pauseTx;
    await trackGasUsage("RewardToken", "pause", pauseTx);

    await expect(token.transfer(recipient.address, 100n)).to.revert(ethers);
  });

  it("10 should allow transfers after unpause", async function () {
    const mintTx = token.mint(deployer.address, 1000n);
    await mintTx;
    await trackGasUsage("RewardToken", "mint", mintTx);

    const pauseTx = token.pause();
    await pauseTx;
    await trackGasUsage("RewardToken", "pause", pauseTx);

    const unpauseTx = token.unpause();
    await unpauseTx;
    await trackGasUsage("RewardToken", "unpause", unpauseTx);

    const transferTx = token.transfer(recipient.address, 100n);
    await transferTx;
    await trackGasUsage("RewardToken", "transfer", transferTx);
    expect(await token.balanceOf(recipient.address)).to.equal(100n);
  });

  it("11 should allow grantRole and mint through new minter", async function () {
    const minterRole = await token.MINTER_ROLE();
    const grantRoleTx = token.grantRole(minterRole, recipient.address);
    await grantRoleTx;
    await trackGasUsage("RewardToken", "grantRole", grantRoleTx);

    const mintTx = token.connect(recipient).mint(outsider.address, 333n);

    await expect(mintTx)
      .to.emit(token, "RewardMinted")
      .withArgs(outsider.address, 333n, recipient.address);
    await trackGasUsage("RewardToken", "mint", mintTx);
  });

  it("12 should mint multiple times to several recipients", async function () {
    const mintTx1 = token.mint(recipient.address, 100n);
    const mintTx2 = token.mint(outsider.address, 250n);
    const mintTx3 = token.mint(deployer.address, 75n);

    await mintTx1;
    await mintTx2;
    await mintTx3;

    await trackGasUsage("RewardToken", "mint", mintTx1);
    await trackGasUsage("RewardToken", "mint", mintTx2);
    await trackGasUsage("RewardToken", "mint", mintTx3);

    expect(await token.balanceOf(recipient.address)).to.equal(100n);
    expect(await token.balanceOf(outsider.address)).to.equal(250n);
    expect(await token.balanceOf(deployer.address)).to.equal(75n);
  });
});
