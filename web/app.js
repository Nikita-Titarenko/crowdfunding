import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.17.0/+esm";

const requiredNetwork = {
  chainId: "0xAA36A7",
  name: "Sepolia",
};

const appState = {
  provider: null,
  signer: null,
  account: null,
  registry: null,
  token: null,
  campaign: null,
  isDeployed: false,
  txs: [],
  events: [],
};

const elements = {
  connectWalletBtn: document.getElementById("connectWalletBtn"),
  accountStatus: document.getElementById("accountStatus"),
  networkStatus: document.getElementById("networkStatus"),
  registryName: document.getElementById("registryName"),
  tokenName: document.getElementById("tokenName"),
  campaignTitle: document.getElementById("campaignTitle"),
  deployStatus: document.getElementById("deployStatus"),
  authorRegistered: document.getElementById("authorRegistered"),
  goalValue: document.getElementById("goalValue"),
  raisedValue: document.getElementById("raisedValue"),
  deadlineValue: document.getElementById("deadlineValue"),
  finalizedValue: document.getElementById("finalizedValue"),
  successfulValue: document.getElementById("successfulValue"),
  rewardBalance: document.getElementById("rewardBalance"),
  userContribution: document.getElementById("userContribution"),
  txList: document.getElementById("txList"),
  eventLog: document.getElementById("eventLog"),
  deployBtn: document.getElementById("deployBtn"),
  registerAuthorBtn: document.getElementById("registerAuthorBtn"),
  contributeBtn: document.getElementById("contributeBtn"),
  withdrawBtn: document.getElementById("withdrawBtn"),
  claimRefundBtn: document.getElementById("claimRefundBtn"),
  claimRewardBtn: document.getElementById("claimRewardBtn"),
};

function setMessage(text, type = "neutral") {
  elements.deployStatus.textContent = text;
  elements.deployStatus.className = `message ${type}`;
}

function addTxEntry(label, status, hash, message) {
  appState.txs.unshift({ label, status, hash, message });
  renderTransactions();
}

function renderTransactions() {
  elements.txList.innerHTML = "";

  if (!appState.txs.length) {
    elements.txList.innerHTML = '<div class="tx-item"><div class="small">No transactions yet.</div></div>';
    return;
  }

  for (const tx of appState.txs) {
    const wrapper = document.createElement("div");
    wrapper.className = "tx-item";
    wrapper.innerHTML = `
      <div><strong>${tx.label}</strong><span class="status-pill ${tx.status}">${tx.status}</span></div>
      <div class="small">${tx.hash || "pending"}</div>
      <div class="small">${tx.message}</div>
    `;
    elements.txList.appendChild(wrapper);
  }
}

function renderEvents() {
  elements.eventLog.innerHTML = "";

  if (!appState.events.length) {
    elements.eventLog.innerHTML = '<div class="event-item"><div class="small">No contract events received yet.</div></div>';
    return;
  }

  for (const event of appState.events) {
    const item = document.createElement("div");
    item.className = "event-item";
    item.innerHTML = `<div><strong>${event.name}</strong></div><div class="small">${event.detail}</div>`;
    elements.eventLog.appendChild(item);
  }
}

function decodeErrorFromContract(contract, error) {
  const candidates = [
    error?.data,
    error?.info?.error?.data,
    error?.info?.error?.error?.data,
    error?.error?.data,
  ];

  for (const data of candidates) {
    if (typeof data === "string" && data.startsWith("0x")) {
      try {
        const parsed = contract?.interface?.parseError(data);
        if (parsed) {
          const args = parsed.args?.length ? `(${parsed.args.map((arg) => String(arg)).join(", ")})` : "";
          return `${parsed.name}${args}`;
        }
      } catch {
        // Ignore invalid payloads.
      }
    }
  }

  const rawMessage =
    error?.info?.error?.message ||
    error?.shortMessage ||
    error?.message ||
    "The contract rejected the transaction.";

  const cleaned = rawMessage
    .replace(/^execution reverted:\s*/i, "")
    .replace(/^reverted with custom error\s*/i, "")
    .replace(/^VM Exception while processing transaction:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (!cleaned || cleaned.startsWith("0x")) {
    return "The contract rejected the transaction. Please check the current state and try again.";
  }

  return cleaned;
}

function humanizeError(contract, error) {
  const message = decodeErrorFromContract(contract, error);

  const mapped = {
    ZeroAddress: "The contract received a zero address.",
    EmptyName: "The author name cannot be empty.",
    AlreadyRegistered: "This author is already registered.",
    NotRegistered: "This address is not registered as an author.",
    InvalidAmount: "The amount must be greater than zero.",
    CampaignClosed: "The campaign is already closed for this action.",
    CampaignStillOpen: "This action is allowed only after the deadline.",
    GoalNotReached: "The campaign goal has not been reached yet.",
    GoalReached: "The funding goal was already met.",
    Unauthorized: "Your wallet is not allowed to do this action.",
    AlreadyRefunded: "You already claimed a refund.",
    AlreadyClaimed: "You already claimed the reward.",
    NoContribution: "You have no contribution to claim or refund.",
    NotAuthor: "Only a registered author can create this campaign.",
    InvalidGoal: "The campaign goal must be greater than zero.",
    TransferFailed: "The contract failed to transfer funds.",
    AccessControlUnauthorizedAccount: "Your wallet does not have the required role.",
  };

  const foundKey = Object.keys(mapped).find((key) => message.includes(key));
  return foundKey ? mapped[foundKey] : message;
}

async function fetchArtifact(contractName) {
  const response = await fetch(`../artifacts/contracts/contracts/${contractName}.sol/${contractName}.json`);
  if (!response.ok) {
    throw new Error(`Artifact for ${contractName} was not found.`);
  }
  return response.json();
}

async function ensureWalletConnected() {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask and try again.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  appState.provider = provider;
  const accounts = await provider.send("eth_requestAccounts", []);
  appState.account = accounts[0];
  appState.signer = await provider.getSigner();

  const network = await provider.getNetwork();
  const chainId = `0x${network.chainId.toString(16)}`;

  if (chainId !== requiredNetwork.chainId) {
    throw new Error(`Please switch MetaMask to ${requiredNetwork.name}.`);
  }

  elements.accountStatus.textContent = appState.account;
  elements.networkStatus.textContent = `${network.name} (${chainId})`;
  return provider;
}

async function attachNetworkListeners() {
  if (!window.ethereum) return;

  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}

async function deployDemo() {
  await ensureWalletConnected();

  const [registryArtifact, tokenArtifact, campaignArtifact] = await Promise.all([
    fetchArtifact("AuthorRegistry"),
    fetchArtifact("RewardToken"),
    fetchArtifact("CrowdfundingCampaign"),
  ]);

  const registryFactory = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode,
    appState.signer,
  );
  const registry = await registryFactory.deploy();
  const registryAddress = await registry.getAddress();
  addTxEntry("Deploy registry", "pending", registry.deploymentTransaction()?.hash || "pending", "Waiting for confirmation");
  await registry.waitForDeployment();
  addTxEntry("Deploy registry", "confirmed", registry.deploymentTransaction()?.hash || "pending", "Registry deployed successfully");

  const tokenFactory = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, appState.signer);
  const token = await tokenFactory.deploy();
  const tokenAddress = await token.getAddress();
  addTxEntry("Deploy token", "pending", token.deploymentTransaction()?.hash || "pending", "Waiting for confirmation");
  await token.waitForDeployment();
  addTxEntry("Deploy token", "confirmed", token.deploymentTransaction()?.hash || "pending", "Token deployed successfully");

  const campaignFactory = new ethers.ContractFactory(
    campaignArtifact.abi,
    campaignArtifact.bytecode,
    appState.signer,
  );
  const campaign = await campaignFactory.deploy(
    registryAddress,
    tokenAddress,
    "Demo Campaign",
    ethers.parseEther("1"),
    60n,
    appState.account,
  );
  const campaignAddress = await campaign.getAddress();
  addTxEntry("Deploy campaign", "pending", campaign.deploymentTransaction()?.hash || "pending", "Waiting for confirmation");
  await campaign.waitForDeployment();
  addTxEntry("Deploy campaign", "confirmed", campaign.deploymentTransaction()?.hash || "pending", `Campaign deployed at ${campaignAddress}`);

  const authorRegistry = new ethers.Contract(registryAddress, registryArtifact.abi, appState.signer);
  const registrationTx = await authorRegistry.registerAuthor(appState.account, "Demo Author");
  addTxEntry("Register author", "pending", registrationTx.hash, "Submitting author registration");
  await registrationTx.wait();
  addTxEntry("Register author", "confirmed", registrationTx.hash, "Author registered successfully");

  const grantTx = await token.grantRole(await token.MINTER_ROLE(), campaignAddress);
  addTxEntry("Grant minter role", "pending", grantTx.hash, "Granting campaign mint access");
  await grantTx.wait();
  addTxEntry("Grant minter role", "confirmed", grantTx.hash, "Campaign can mint reward tokens");

  appState.registry = authorRegistry;
  appState.token = token;
  appState.campaign = campaign;
  appState.isDeployed = true;

  elements.registryName.textContent = registryAddress;
  elements.tokenName.textContent = tokenAddress;
  elements.campaignTitle.textContent = await campaign.title();

  setMessage("Demo scenario deployed and ready.", "success");
  attachEventListeners();
  await refreshContractState();
}

function attachEventListeners() {
  if (!appState.campaign || !appState.registry || !appState.token) return;

  appState.registry.removeAllListeners();
  appState.token.removeAllListeners();
  appState.campaign.removeAllListeners();

  appState.registry.on("AuthorRegistered", (...args) => {
    const [author, name] = args;
    appState.events.unshift({ name: "AuthorRegistered", detail: `${author} / ${name}` });
    renderEvents();
    refreshContractState();
  });

  appState.token.on("RewardMinted", (...args) => {
    const [recipient, amount, minter] = args;
    appState.events.unshift({
      name: "RewardMinted",
      detail: `${recipient} received ${ethers.formatUnits(amount, 18)} CRWD from ${minter}`,
    });
    renderEvents();
    refreshContractState();
  });

  appState.campaign.on("ContributionReceived", (...args) => {
    const [supporter, amount] = args;
    appState.events.unshift({ name: "ContributionReceived", detail: `${supporter} contributed ${ethers.formatEther(amount)} ETH` });
    renderEvents();
    refreshContractState();
  });

  appState.campaign.on("BeneficiaryWithdrawn", (...args) => {
    const [beneficiary, amount] = args;
    appState.events.unshift({
      name: "BeneficiaryWithdrawn",
      detail: `${beneficiary} withdrew ${ethers.formatEther(amount)} ETH`,
    });
    renderEvents();
    refreshContractState();
  });

  appState.campaign.on("RefundIssued", (...args) => {
    const [supporter, amount] = args;
    appState.events.unshift({ name: "RefundIssued", detail: `${supporter} received ${ethers.formatEther(amount)} ETH refund` });
    renderEvents();
    refreshContractState();
  });

  appState.campaign.on("RewardClaimed", (...args) => {
    const [supporter, amount] = args;
    appState.events.unshift({ name: "RewardClaimed", detail: `${supporter} claimed ${ethers.formatEther(amount)} reward` });
    renderEvents();
    refreshContractState();
  });
}

async function refreshContractState() {
  if (!appState.registry || !appState.token || !appState.campaign || !appState.account) return;

  const [isAuthor, goal, raised, deadline, finalized, successful, balance, contribution, title] = await Promise.all([
    appState.registry.isAuthor(appState.account),
    appState.campaign.goal(),
    appState.campaign.totalRaised(),
    appState.campaign.deadline(),
    appState.campaign.finalized(),
    appState.campaign.isSuccessful(),
    appState.token.balanceOf(appState.account),
    appState.campaign.contributions(appState.account),
    appState.campaign.title(),
  ]);

  elements.authorRegistered.textContent = isAuthor ? "Yes" : "No";
  elements.goalValue.textContent = `${ethers.formatEther(goal)} ETH`;
  elements.raisedValue.textContent = `${ethers.formatEther(raised)} ETH`;
  elements.deadlineValue.textContent = new Date(Number(deadline) * 1000).toLocaleString();
  elements.finalizedValue.textContent = finalized ? "Yes" : "No";
  elements.successfulValue.textContent = successful ? "Yes" : "No";
  elements.rewardBalance.textContent = `${ethers.formatEther(balance)} CRWD`;
  elements.userContribution.textContent = `${ethers.formatEther(contribution)} ETH`;
  elements.campaignTitle.textContent = title;
}

async function runTx(label, action, contract) {
  if (!appState.provider) {
    await ensureWalletConnected();
  }

  if (!appState.isDeployed) {
    setMessage("Deploy the demo first.", "warning");
    return;
  }

  try {
    const tx = await action();
    addTxEntry(label, "pending", tx.hash, "Waiting for confirmation");

    const receipt = await tx.wait();
    const succeeded = receipt?.status === 1;
    const message = succeeded ? "Transaction confirmed." : "Transaction failed.";

    addTxEntry(label, succeeded ? "confirmed" : "failed", tx.hash, message);
    setMessage(succeeded ? `${label} confirmed.` : `${label} failed.`, succeeded ? "success" : "error");

    await refreshContractState();
  } catch (error) {
    const friendly = humanizeError(contract, error);
    addTxEntry(label, "failed", "rejected", friendly);
    setMessage(friendly, "error");
  }
}

async function handleConnectWallet() {
  try {
    await ensureWalletConnected();
    attachNetworkListeners();
    elements.connectWalletBtn.textContent = "Wallet connected";
    elements.connectWalletBtn.disabled = true;
    setMessage("MetaMask connected. You can deploy the scenario.", "success");
  } catch (error) {
    setMessage(humanizeError(null, error), "error");
  }
}

async function handleDeploy() {
  try {
    await deployDemo();
  } catch (error) {
    setMessage(humanizeError(null, error), "error");
  }
}

async function handleRegisterAuthor() {
  await runTx(
    "Register author",
    async () => appState.registry.registerAuthor(appState.account, "Demo Author"),
    appState.registry,
  );
}

async function handleContribute() {
  await runTx(
    "Contribute",
    async () => appState.campaign.contribute({ value: ethers.parseEther("0.5") }),
    appState.campaign,
  );
}

async function handleWithdraw() {
  await runTx("Withdraw funds", async () => appState.campaign.withdrawFunds(), appState.campaign);
}

async function handleClaimRefund() {
  await runTx("Claim refund", async () => appState.campaign.claimRefund(), appState.campaign);
}

async function handleClaimReward() {
  await runTx("Claim reward", async () => appState.campaign.claimReward(), appState.campaign);
}

function bindButton(id, action) {
  const element = document.getElementById(id);
  if (element) element.addEventListener("click", action);
}

bindButton("connectWalletBtn", handleConnectWallet);
bindButton("deployBtn", handleDeploy);
bindButton("registerAuthorBtn", handleRegisterAuthor);
bindButton("contributeBtn", handleContribute);
bindButton("withdrawBtn", handleWithdraw);
bindButton("claimRefundBtn", handleClaimRefund);
bindButton("claimRewardBtn", handleClaimReward);

renderTransactions();
renderEvents();
