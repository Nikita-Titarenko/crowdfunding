import { expect } from "chai";
import { network } from "hardhat";
import { deployAndTrack, trackGasUsage } from "./gas-report.js";

const connection = await network.create();
const { ethers } = connection;

describe("AuthorRegistry", function () {
  let deployer: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let manager: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let author1: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let author2: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let outsider: Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let registry: any;

  beforeEach(async function () {
    [deployer, manager, author1, author2, outsider] = await ethers.getSigners();
    registry = await deployAndTrack("AuthorRegistry", ethers.deployContract("AuthorRegistry"));
  });

  it("01 should grant default admin and author manager roles to deployer", async function () {
    const defaultRole = await registry.DEFAULT_ADMIN_ROLE();
    const authorRole = await registry.AUTHOR_MANAGER_ROLE();

    expect(await registry.hasRole(defaultRole, deployer.address)).to.equal(true);
    expect(await registry.hasRole(authorRole, deployer.address)).to.equal(true);
  });

  it("02 should register an author successfully", async function () {
    const registerAuthorTx = registry.registerAuthor(author1.address, "Alice");

    await expect(registerAuthorTx)
      .to.emit(registry, "AuthorRegistered")
      .withArgs(author1.address, "Alice");
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthorTx);

    expect(await registry.isAuthor(author1.address)).to.equal(true);
    const [name, active] = await registry.getAuthor(author1.address);
    expect(name).to.equal("Alice");
    expect(active).to.equal(true);
  });

  it("03 should reject zero address registration", async function () {
    await expect(registry.registerAuthor(ethers.ZeroAddress, "Alice")).to.be.revertedWithCustomError(
      registry,
      "ZeroAddress",
    );
  });

  it("04 should reject empty name registration", async function () {
    await expect(registry.registerAuthor(author1.address, "")).to.be.revertedWithCustomError(
      registry,
      "EmptyName",
    );
  });

  it("05 should reject duplicate author registration", async function () {
    const registerAuthorTx = registry.registerAuthor(author1.address, "Alice");
    await registerAuthorTx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthorTx);

    await expect(registry.registerAuthor(author1.address, "Alice 2")).to.be.revertedWithCustomError(
      registry,
      "AlreadyRegistered",
    );
  });

  it("06 should reject registration from unauthorized account", async function () {
    await expect(registry.connect(outsider).registerAuthor(author1.address, "Alice")).to.revert(ethers);
  });

  it("07 should remove an author successfully", async function () {
    const registerAuthorTx = registry.registerAuthor(author1.address, "Alice");
    await registerAuthorTx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthorTx);

    const removeAuthorTx = registry.removeAuthor(author1.address);

    await expect(removeAuthorTx)
      .to.emit(registry, "AuthorRemoved")
      .withArgs(author1.address, "Alice");
    await trackGasUsage("AuthorRegistry", "removeAuthor", removeAuthorTx);

    expect(await registry.isAuthor(author1.address)).to.equal(false);
  });

  it("08 should reject removing zero address", async function () {
    await expect(registry.removeAuthor(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      registry,
      "ZeroAddress",
    );
  });

  it("09 should reject removing unregistered author", async function () {
    await expect(registry.removeAuthor(author1.address)).to.be.revertedWithCustomError(
      registry,
      "NotRegistered",
    );
  });

  it("10 should reject removal from unauthorized account", async function () {
    const registerAuthorTx = registry.registerAuthor(author1.address, "Alice");
    await registerAuthorTx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthorTx);

    await expect(registry.connect(outsider).removeAuthor(author1.address)).to.revert(ethers);
  });

  it("11 should return all registered authors", async function () {
    const registerAuthor1Tx = registry.registerAuthor(author1.address, "Alice");
    await registerAuthor1Tx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthor1Tx);

    const registerAuthor2Tx = registry.registerAuthor(author2.address, "Bob");
    await registerAuthor2Tx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthor2Tx);

    const authors = await registry.getAllAuthors();
    expect(authors).to.have.length(2);
    expect(authors[0]).to.equal(author1.address);
    expect(authors[1]).to.equal(author2.address);
  });

  it("12 should return a growing author list across multiple registrations and removals", async function () {
    const registerAuthor1Tx = registry.registerAuthor(author1.address, "Alice");
    await registerAuthor1Tx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthor1Tx);

    const registerAuthor2Tx = registry.registerAuthor(author2.address, "Bob");
    await registerAuthor2Tx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthor2Tx);

    expect((await registry.getAllAuthors()).length).to.equal(2);

    const removeAuthor1Tx = registry.removeAuthor(author1.address);
    await removeAuthor1Tx;
    await trackGasUsage("AuthorRegistry", "removeAuthor", removeAuthor1Tx);

    const removeAuthor2Tx = registry.removeAuthor(author2.address);
    await removeAuthor2Tx;
    await trackGasUsage("AuthorRegistry", "removeAuthor", removeAuthor2Tx);

    const authors = await registry.getAllAuthors();
    expect(authors).to.have.length(2);
    expect(authors[0]).to.equal(author1.address);
    expect(authors[1]).to.equal(author2.address);
    expect(await registry.isAuthor(author1.address)).to.equal(false);
    expect(await registry.isAuthor(author2.address)).to.equal(false);
  });

  it("13 should return metadata for known author", async function () {
    const registerAuthorTx = registry.registerAuthor(author1.address, "Alice");
    await registerAuthorTx;
    await trackGasUsage("AuthorRegistry", "registerAuthor", registerAuthorTx);

    const [name, active] = await registry.getAuthor(author1.address);
    expect(name).to.equal("Alice");
    expect(active).to.equal(true);
  });
});
