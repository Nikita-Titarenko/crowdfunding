import { expect } from "chai";
import { network } from "hardhat";

const connection = await network.create();
const { ethers } = connection;

describe("RewardToken", function () {
  let deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let recipient: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let outsider: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let token: any;

  beforeEach(async function () {
    [deployer, recipient, outsider] = await ethers.getSigners();
    token = await ethers.deployContract("RewardToken");
  });

  it("01 should grant deployer as admin and minter", async function () {
    const minterRole = await token.MINTER_ROLE();
    expect(await token.hasRole(minterRole, deployer.address)).to.equal(true);
  });

  it("02 should mint tokens to a valid recipient", async function () {
    await expect(token.mint(recipient.address, 1000n))
      .to.emit(token, "RewardMinted")
      .withArgs(recipient.address, 1000n, deployer.address);

    expect(await token.balanceOf(recipient.address)).to.equal(1000n);
  });

  it("03 should reject mint to zero address", async function () {
    await expect(token.mint(ethers.ZeroAddress, 1000n)).to.be.revertedWithCustomError(token, "ZeroAddress");
  });

  it("04 should reject mint from non minter", async function () {
    await expect(token.connect(outsider).mint(recipient.address, 1000n)).to.revert(ethers);
  });

  it("05 should pause and emit pause event", async function () {
    await expect(token.pause()).to.emit(token, "Paused");
    expect(await token.paused()).to.equal(true);
  });

  it("06 should reject pause from unauthorized account", async function () {
    await expect(token.connect(outsider).pause()).to.revert(ethers);
  });

  it("07 should unpause and emit unpause event", async function () {
    await token.pause();
    await expect(token.unpause()).to.emit(token, "Unpaused");
    expect(await token.paused()).to.equal(false);
  });

  it("08 should reject unpause from unauthorized account", async function () {
    await token.pause();
    await expect(token.connect(outsider).unpause()).to.revert(ethers);
  });

  it("09 should block transfers while paused", async function () {
    await token.mint(deployer.address, 1000n);
    await token.pause();

    await expect(token.transfer(recipient.address, 100n)).to.revert(ethers);
  });

  it("10 should allow transfers after unpause", async function () {
    await token.mint(deployer.address, 1000n);
    await token.pause();
    await token.unpause();

    await token.transfer(recipient.address, 100n);
    expect(await token.balanceOf(recipient.address)).to.equal(100n);
  });

  it("11 should allow grantRole and mint through new minter", async function () {
    const minterRole = await token.MINTER_ROLE();
    await token.grantRole(minterRole, recipient.address);

    await expect(token.connect(recipient).mint(outsider.address, 333n))
      .to.emit(token, "RewardMinted")
      .withArgs(outsider.address, 333n, recipient.address);
  });
});
