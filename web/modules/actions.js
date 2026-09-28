import { ethers } from "../ethers.js";
import { bindButton, elements } from "./dom.js";
import {
  attachNetworkListeners,
  connectCoreContracts,
  createCampaign,
  ensureCampaignMinterRole,
  loadCampaign,
  refreshContractState,
} from "./blockchain.js";
import { appState } from "./state.js";
import {
  addTxEntry,
  humanizeError,
  renderEvents,
  renderTransactions,
  resetCampaignUi,
  setActiveTab,
  setMessage,
  updateActionAvailability,
} from "./ui.js";

async function runTx(label, action, contract) {
  if (!appState.provider) {
    await connectCoreContracts();
  }

  if (!appState.campaign && label !== "Register author") {
    setMessage("Create or load a campaign first.", "warning");
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
    await connectCoreContracts();
    attachNetworkListeners();
    elements.connectWalletBtn.textContent = "Wallet connected";
    elements.connectWalletBtn.disabled = true;
    setMessage("MetaMask connected. You can register an author and create or load a Sepolia campaign.", "success");
  } catch (error) {
    setMessage(humanizeError(null, error), "error");
  }
}

async function handleCreateCampaign() {
  try {
    await createCampaign();
  } catch (error) {
    setMessage(humanizeError(appState.campaign, error), "error");
  }
}

async function handleLoadCampaign() {
  try {
    await loadCampaign(elements.campaignAddressInput.value.trim());
  } catch (error) {
    setMessage(humanizeError(appState.campaign, error), "error");
  }
}

async function handleRegisterAuthor() {
  const authorName = elements.authorNameInput.value.trim();
  const authorAddressInput = elements.authorAddressInput.value.trim();
  const authorAddress = authorAddressInput || appState.account;

  if (!authorName) {
    setMessage("Enter an author name before registering.", "warning");
    return;
  }

  if (!ethers.isAddress(authorAddress)) {
    setMessage("Enter a valid author address before registering.", "warning");
    return;
  }

  await runTx(
    "Register author",
    async () => appState.registry.registerAuthor(authorAddress, authorName),
    appState.registry,
  );
}

async function handleGrantMinterRole() {
  try {
    await ensureCampaignMinterRole(true);
  } catch (error) {
    setMessage(humanizeError(appState.token, error), "error");
  }
}

async function handleContribute() {
  const contributionAmount = elements.contributionInput.value.trim();
  if (!contributionAmount || Number(contributionAmount) <= 0) {
    setMessage("Contribution amount must be greater than zero.", "warning");
    return;
  }

  await runTx(
    "Contribute",
    async () => appState.campaign.contribute({ value: ethers.parseEther(contributionAmount) }),
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

function bindTabs() {
  for (const tabButton of elements.tabButtons) {
    tabButton.addEventListener("click", () => {
      setActiveTab(tabButton.dataset.tab);
    });
  }
}

function bindPriceEstimateInputs() {
  const updateGoalEstimate = () => {
    const usdAmount = Number(elements.campaignGoalInput.value || 0);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      elements.goalEthEstimate.textContent = "Enter a USD goal to estimate ETH amount.";
      return;
    }

    const ethUsdPrice = appState.ethUsdPrice;
    if (!ethUsdPrice || !Number.isFinite(ethUsdPrice) || ethUsdPrice <= 0) {
      elements.goalEthEstimate.textContent = "Price feed is loading…";
      return;
    }

    const ethNeeded = usdAmount / ethUsdPrice;
    elements.goalEthEstimate.textContent = `≈ ${ethNeeded.toFixed(6)} ETH for $${usdAmount.toLocaleString()} at $${ethUsdPrice.toLocaleString()} / ETH`;
  };

  const updateContributionEstimate = () => {
    const usdValue = Number(elements.contributionInput.value || 0);
    if (!Number.isFinite(usdValue) || usdValue <= 0) {
      elements.contributionEthEstimate.textContent = "Enter ETH amount to estimate USD value.";
      return;
    }

    const ethUsdPrice = appState.ethUsdPrice;
    if (!ethUsdPrice || !Number.isFinite(ethUsdPrice) || ethUsdPrice <= 0) {
      elements.contributionEthEstimate.textContent = "Price feed is loading…";
      return;
    }

    const usdEquivalent = usdValue * ethUsdPrice;
    elements.contributionEthEstimate.textContent = `≈ $${usdEquivalent.toLocaleString(undefined, { maximumFractionDigits: 2 })} at $${ethUsdPrice.toLocaleString()} / ETH`;
  };

  elements.campaignGoalInput.addEventListener("input", updateGoalEstimate);
  elements.contributionInput.addEventListener("input", updateContributionEstimate);
}

export function initializeApp() {
  bindButton("connectWalletBtn", handleConnectWallet);
  bindButton("createCampaignBtn", handleCreateCampaign);
  bindButton("loadCampaignBtn", handleLoadCampaign);
  bindButton("registerAuthorBtn", handleRegisterAuthor);
  bindButton("grantMinterRoleBtn", handleGrantMinterRole);
  bindButton("contributeBtn", handleContribute);
  bindButton("withdrawBtn", handleWithdraw);
  bindButton("claimRefundBtn", handleClaimRefund);
  bindButton("claimRewardBtn", handleClaimReward);
  bindTabs();
  bindPriceEstimateInputs();

  renderTransactions();
  renderEvents();
  resetCampaignUi();
  updateActionAvailability();
  setActiveTab(appState.activeTab);
}