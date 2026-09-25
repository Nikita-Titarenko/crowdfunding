import { expect } from "chai";
import { network } from "hardhat";

const connection = await network.create();
const { ethers } = connection;

describe("Authorization bypass demo", function () {
  it("vulnerable withdrawal drains the whole balance", async function () {
    const [owner, attackerWallet] = await ethers.getSigners();

    const vulnerable = await ethers.deployContract("VulnerableCrowdfundingCampaign", [owner.address]);
    const vulnerableAddress = await vulnerable.getAddress();

    await owner.sendTransaction({
      to: vulnerableAddress,
      value: ethers.parseEther("5"),
    });

    const attacker = await ethers.deployContract("FundDrainAttacker", [vulnerableAddress]);

    await attacker.connect(attackerWallet).attack();

    expect(await ethers.provider.getBalance(vulnerableAddress)).to.equal(0n);
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.be.greaterThan(0n);
  });

  it("the secure version rejects the same attack", async function () {
    const [owner, attackerWallet] = await ethers.getSigners();

    const secure = await ethers.deployContract("SecureCrowdfundingCampaign", [owner.address]);
    const secureAddress = await secure.getAddress();

    await owner.sendTransaction({
      to: secureAddress,
      value: ethers.parseEther("5"),
    });

    const attacker = await ethers.deployContract("FundDrainAttacker", [secureAddress]);

    await expect(attacker.connect(attackerWallet).attack()).to.be.revertedWithCustomError(
      secure,
      "Unauthorized",
    );

    expect(await ethers.provider.getBalance(secureAddress)).to.equal(ethers.parseEther("5"));
  });
});
