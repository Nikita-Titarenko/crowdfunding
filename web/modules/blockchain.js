import { ethers } from "../ethers.js";
import { DEFAULT_ADMIN_ROLE, requiredNetwork, STORAGE_KEY } from "./config.js";
import { elements } from "./dom.js";
import { appState } from "./state.js";
import {
  addTxEntry,
  renderEvents,
  resetCampaignUi,
  setMessage,
  shortAddress,
  updateActionAvailability,
} from "./ui.js";

export async function fetchArtifact(contractName) {
  const response = await fetch(`/artifacts/contracts/contracts/${contractName}.sol/${contractName}.json`);
  if (!response.ok) {
    throw new Error(`Artifact for ${contractName} was not found.`);
  }

  return response.json();
}

export async function loadArtifacts() {
  if (appState.artifacts) {
    return appState.artifacts;
  }

  const [registryArtifact, tokenArtifact, campaignArtifact] = await Promise.all([
    fetchArtifact("AuthorRegistry"),
    fetchArtifact("RewardToken"),
    fetchArtifact("CrowdfundingCampaign"),
  ]);

  appState.artifacts = {
    registry: registryArtifact,
    token: tokenArtifact,
    campaign: campaignArtifact,
  };

  return appState.artifacts;
}

async function pinCampaignMetadata(metadata) {
  const response = await fetch("/api/pin-campaign-metadata", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Uploading campaign metadata to IPFS failed.");
  }

  return payload.cid;
}

function buildPinataGatewayUrl(metadataCid) {
  if (!metadataCid) {
    return null;
  }

  if (metadataCid.startsWith("http://") || metadataCid.startsWith("https://")) {
    return metadataCid;
  }

  const cleanCid = metadataCid.replace(/^ipfs:\/\//i, "");
  return `https://gateway.pinata.cloud/ipfs/${cleanCid}`;
}

async function fetchCampaignMetadata(metadataCid) {
  const gatewayUrl = buildPinataGatewayUrl(metadataCid);
  if (!gatewayUrl) {
    return null;
  }

  const response = await fetch(gatewayUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load campaign metadata from IPFS.`);
  }

  const metadata = await response.json().catch(() => null);
  if (!metadata) {
    return null;
  }

  return metadata;
}

async function verifyCampaignDeployment({ address, metadataCid, goalUsd, duration, beneficiary, metadataUri }) {
  const response = await fetch("/api/verify-campaign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      address,
      registry: requiredNetwork.contracts.registry,
      token: requiredNetwork.contracts.token,
      priceFeed: requiredNetwork.contracts.priceFeed,
      metadataCid,
      goalUsd,
      duration,
      beneficiary,
      metadataUri,
      contract: "contracts/contracts/CrowdfundingCampaign.sol:CrowdfundingCampaign",
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Campaign verification failed.");
  }
}

export async function ensureWalletConnected() {
  if (!window.ethereum) {
    throw new Error("MetaMask is not installed. Please install MetaMask and try again.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  appState.provider = provider;
  const accounts = await provider.send("eth_requestAccounts", []);
  appState.account = accounts[0];
  appState.signer = await provider.getSigner();

  const network = await provider.getNetwork();
  const chainId = `0x${network.chainId.toString(16)}`.toLowerCase();

  if (chainId !== requiredNetwork.chainId) {
    throw new Error(`Please switch MetaMask to ${requiredNetwork.name}.`);
  }

  elements.accountStatus.textContent = shortAddress(appState.account);
  elements.accountStatus.dataset.fullValue = appState.account;
  elements.networkStatus.textContent = `${network.name} (${chainId})`;
  if (!elements.authorAddressInput.value) {
    elements.authorAddressInput.value = appState.account;
  }
  if (!elements.beneficiaryInput.value) {
    elements.beneficiaryInput.value = appState.account;
  }

  return provider;
}

export function attachNetworkListeners() {
  if (!window.ethereum) {
    return;
  }

  window.ethereum.on("accountsChanged", () => {
    window.location.reload();
  });

  window.ethereum.on("chainChanged", () => {
    window.location.reload();
  });
}

async function loadEthUsdPrice() {
  if (!appState.provider) {
    return;
  }

  const feedAbi = [
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
  ];

  const feed = new ethers.Contract(requiredNetwork.contracts.priceFeed, feedAbi, appState.provider);
  const [decimals, roundData] = await Promise.all([feed.decimals(), feed.latestRoundData()]);
  const rawPrice = roundData[1];
  const normalizedPrice = Number(ethers.formatUnits(rawPrice, decimals));
  appState.ethUsdPrice = Number.isFinite(normalizedPrice) ? normalizedPrice : null;

  if (elements.goalEthEstimate) {
    const usdGoal = Number(elements.campaignGoalInput.value || 0);
    if (usdGoal > 0 && Number.isFinite(appState.ethUsdPrice) && appState.ethUsdPrice > 0) {
      const ethNeeded = usdGoal / appState.ethUsdPrice;
      elements.goalEthEstimate.textContent = `≈ ${ethNeeded.toFixed(6)} ETH for $${usdGoal.toLocaleString()} at $${appState.ethUsdPrice.toLocaleString()} / ETH`;
    } else {
      elements.goalEthEstimate.textContent = "Enter a USD goal to estimate ETH amount.";
    }
  }

  if (elements.contributionEthEstimate) {
    const ethAmount = Number(elements.contributionInput.value || 0);
    if (ethAmount > 0 && Number.isFinite(appState.ethUsdPrice) && appState.ethUsdPrice > 0) {
      const usdEquivalent = ethAmount * appState.ethUsdPrice;
      elements.contributionEthEstimate.textContent = `≈ $${usdEquivalent.toLocaleString(undefined, { maximumFractionDigits: 2 })} at $${appState.ethUsdPrice.toLocaleString()} / ETH`;
    } else {
      elements.contributionEthEstimate.textContent = "Current ETH/USD price: loading…";
    }
  }
}

export async function connectCoreContracts(restoreSavedCampaign = true) {
  await ensureWalletConnected();
  const artifacts = await loadArtifacts();

  appState.registry = new ethers.Contract(
    requiredNetwork.contracts.registry,
    artifacts.registry.abi,
    appState.signer,
  );
  appState.token = new ethers.Contract(
    requiredNetwork.contracts.token,
    artifacts.token.abi,
    appState.signer,
  );

  elements.registryName.textContent = shortAddress(requiredNetwork.contracts.registry);
  elements.registryName.dataset.fullValue = requiredNetwork.contracts.registry;
  elements.tokenName.textContent = shortAddress(requiredNetwork.contracts.token);
  elements.tokenName.dataset.fullValue = requiredNetwork.contracts.token;

  const savedCampaignAddress = restoreSavedCampaign ? localStorage.getItem(STORAGE_KEY) : null;
  if (savedCampaignAddress && !appState.campaign) {
    await loadCampaign(savedCampaignAddress, false);
  }

  attachEventListeners();
  await loadEthUsdPrice();
  await refreshContractState();
}

export async function loadCampaign(campaignAddress, announce = true) {
  if (!ethers.isAddress(campaignAddress)) {
    throw new Error("Enter a valid CrowdfundingCampaign address.");
  }

  await connectCoreContracts(false);
  const artifacts = await loadArtifacts();
  const normalized = ethers.getAddress(campaignAddress);
  const campaign = new ethers.Contract(normalized, artifacts.campaign.abi, appState.signer);

  const [registryAddress, tokenAddress, priceFeedAddress, metadataCid] = await Promise.all([
    campaign.authorRegistry(),
    campaign.rewardToken(),
    campaign.priceFeed(),
    campaign.metadataCid(),
  ]);

  if (
    ethers.getAddress(registryAddress) !== requiredNetwork.contracts.registry ||
    ethers.getAddress(tokenAddress) !== requiredNetwork.contracts.token ||
    ethers.getAddress(priceFeedAddress) !== requiredNetwork.contracts.priceFeed
  ) {
    throw new Error("This campaign is not wired to the deployed Sepolia registry, token, and ETH/USD price feed.");
  }

  appState.campaign = campaign;
  localStorage.setItem(STORAGE_KEY, normalized);
  elements.campaignAddressInput.value = normalized;

  let displayTitle = "IPFS metadata CID";
  try {
    const metadata = await fetchCampaignMetadata(metadataCid);
    displayTitle = metadata?.name || metadata?.title || metadataCid || displayTitle;
  } catch {
    displayTitle = metadataCid || displayTitle;
  }

  elements.campaignTitle.textContent = displayTitle;
  elements.campaignAddressValue.textContent = shortAddress(normalized);
  elements.campaignAddressValue.dataset.fullValue = normalized;

  attachEventListeners();
  await refreshContractState();

  if (announce) {
    setMessage(`Campaign ${shortAddress(normalized)} loaded from Sepolia.`, "success");
  }
}

export async function createCampaign() {
  await connectCoreContracts();

  const title = elements.campaignNameInput.value.trim();
  const description = elements.campaignDescriptionInput.value.trim();
  const image = elements.campaignImageInput.value.trim();
  const category = elements.campaignCategoryInput.value.trim();
  const goalUsdInput = elements.campaignGoalInput.value.trim();
  const durationRaw = elements.campaignDurationInput.value.trim();
  const beneficiaryInput = elements.beneficiaryInput.value.trim();
  const beneficiary = beneficiaryInput || appState.account;

  if (!title) {
    throw new Error("Enter a campaign title.");
  }

  if (!description) {
    throw new Error("Enter a campaign description.");
  }

  if (!goalUsdInput || Number(goalUsdInput) <= 0) {
    throw new Error("Campaign goal must be greater than zero.");
  }

  if (!durationRaw || Number(durationRaw) <= 0) {
    throw new Error("Campaign duration must be greater than zero.");
  }

  if (!ethers.isAddress(beneficiary)) {
    throw new Error("Beneficiary address is invalid.");
  }

  const metadataCid = await pinCampaignMetadata({
    title,
    description,
    image,
    category: category || "general",
    createdBy: appState.account,
  });

  localStorage.setItem("campaignMetadataCid", metadataCid);

  const goalUsd = ethers.parseUnits(goalUsdInput, 18);

  const isAuthor = await appState.registry.isAuthor(appState.account);
  if (!isAuthor) {
    throw new Error("Only a registered author can create this campaign.");
  }

  const { campaign: campaignArtifact } = await loadArtifacts();
  const campaignFactory = new ethers.ContractFactory(
    campaignArtifact.abi,
    campaignArtifact.bytecode,
    appState.signer,
  );

  const campaign = await campaignFactory.deploy(
    requiredNetwork.contracts.registry,
    requiredNetwork.contracts.token,
    requiredNetwork.contracts.priceFeed,
    metadataCid,
    goalUsd,
    BigInt(durationRaw),
    beneficiary,
  );
  const deployHash = campaign.deploymentTransaction()?.hash || "pending";
  addTxEntry("Create campaign", "pending", deployHash, "Submitting campaign deployment");
  await campaign.waitForDeployment();
  addTxEntry("Create campaign", "confirmed", deployHash, "Campaign deployed on Sepolia");

  const campaignAddress = await campaign.getAddress();
  addTxEntry("Verify campaign", "pending", campaignAddress, "Submitting source verification to Etherscan");

  try {
    await verifyCampaignDeployment({
      address: campaignAddress,
      metadataCid,
      goalUsd: goalUsd.toString(),
      duration: durationRaw,
      beneficiary,
      metadataUri: `https://gateway.pinata.cloud/ipfs/${metadataCid}`,
    });
    addTxEntry("Verify campaign", "confirmed", campaignAddress, "Campaign verified on Etherscan");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addTxEntry("Verify campaign", "failed", campaignAddress, message);
    setMessage(`Campaign created, but verification failed: ${message}`, "warning");
  }

  await loadCampaign(campaignAddress, false);
  setMessage("Campaign created. Next step: ensure it has MINTER_ROLE for rewards.", "success");

  if (appState.roles.isTokenAdmin) {
    await ensureCampaignMinterRole(true);
  } else {
    setMessage("Campaign created, but connected wallet is not RewardToken admin. An admin must grant MINTER_ROLE before reward claims will work.", "warning");
  }
}

export async function ensureCampaignMinterRole(announceSuccess = false) {
  await connectCoreContracts();

  if (!appState.campaign) {
    throw new Error("Load or create a campaign first.");
  }

  const minterRole = await appState.token.MINTER_ROLE();
  const campaignAddress = await appState.campaign.getAddress();
  const hasRole = await appState.token.hasRole(minterRole, campaignAddress);

  if (hasRole) {
    appState.roles.campaignHasMinterRole = true;
    elements.campaignMinterValue.textContent = "Yes";
    if (announceSuccess) {
      setMessage("Campaign already has MINTER_ROLE.", "success");
    }
    return;
  }

  const grantTx = await appState.token.grantRole(minterRole, campaignAddress);
  addTxEntry("Grant MINTER_ROLE", "pending", grantTx.hash, "Granting the campaign permission to mint rewards");
  await grantTx.wait();
  addTxEntry("Grant MINTER_ROLE", "confirmed", grantTx.hash, "Campaign can now mint reward tokens");

  appState.roles.campaignHasMinterRole = true;
  elements.campaignMinterValue.textContent = "Yes";
  await refreshContractState();
  if (announceSuccess) {
    setMessage("Campaign received MINTER_ROLE.", "success");
  }
}

export function attachEventListeners() {
  if (!appState.registry || !appState.token) {
    return;
  }

  appState.registry.removeAllListeners();
  appState.token.removeAllListeners();
  if (appState.campaign) {
    appState.campaign.removeAllListeners();
  }

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

  if (!appState.campaign) {
    return;
  }

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

export async function refreshContractState() {
  if (!appState.registry || !appState.token || !appState.account) {
    return;
  }

  const registryManagerRole = await appState.registry.AUTHOR_MANAGER_ROLE();
  const [isAuthor, isRegistryManager, isTokenAdmin, balance] = await Promise.all([
    appState.registry.isAuthor(appState.account),
    appState.registry.hasRole(registryManagerRole, appState.account),
    appState.token.hasRole(DEFAULT_ADMIN_ROLE, appState.account),
    appState.token.balanceOf(appState.account),
  ]);

  appState.roles.isAuthor = isAuthor;
  appState.roles.isRegistryManager = isRegistryManager;
  appState.roles.isTokenAdmin = isTokenAdmin;

  elements.authorRegistered.textContent = isAuthor ? "Yes" : "No";
  elements.registryManagerValue.textContent = isRegistryManager ? "Yes" : "No";
  elements.tokenAdminValue.textContent = isTokenAdmin ? "Yes" : "No";
  elements.rewardBalance.textContent = `${ethers.formatEther(balance)} CRWD`;

  if (!appState.campaign) {
    resetCampaignUi("No campaign loaded");
    updateActionAvailability();
    return;
  }

  const campaignAddress = await appState.campaign.getAddress();
  const minterRole = await appState.token.MINTER_ROLE();
  const [goalUsd, raised, raisedUsd, deadline, finalized, successful, contribution, contributionUsd, metadataCid, hasMinterRole] = await Promise.all([
    appState.campaign.goalUsd(),
    appState.campaign.totalRaised(),
    appState.campaign.totalRaisedUsd(),
    appState.campaign.deadline(),
    appState.campaign.finalized(),
    appState.campaign.isSuccessful(),
    appState.campaign.contributions(appState.account),
    appState.campaign.contributionUsd(appState.account),
    appState.campaign.metadataCid(),
    appState.token.hasRole(minterRole, campaignAddress),
  ]);

  appState.roles.campaignHasMinterRole = hasMinterRole;

  let displayTitle = metadataCid || "IPFS metadata CID";
  let metadata = null;
  try {
    metadata = await fetchCampaignMetadata(metadataCid);
    displayTitle = metadata?.name || metadata?.title || metadataCid || displayTitle;
  } catch {
    displayTitle = metadataCid || displayTitle;
  }

  elements.campaignTitle.textContent = displayTitle;
  elements.campaignAddressValue.textContent = shortAddress(campaignAddress);
  elements.campaignCategoryValue.textContent = metadata?.category || "—";
  elements.campaignDescriptionValue.textContent = metadata?.description || "—";
  if (metadata?.image) {
    elements.campaignImagePreview.src = metadata.image;
    elements.campaignImagePreview.hidden = false;
  } else {
    elements.campaignImagePreview.hidden = true;
    elements.campaignImagePreview.removeAttribute("src");
  }
  elements.campaignAddressValue.dataset.fullValue = campaignAddress;
  elements.campaignMinterValue.textContent = hasMinterRole ? "Yes" : "No";
  elements.goalValue.textContent = `${ethers.formatUnits(goalUsd, 18)} USD`;
  elements.raisedValue.textContent = `${ethers.formatEther(raised)} ETH (~${ethers.formatUnits(raisedUsd, 18)} USD)`;
  elements.deadlineValue.textContent = new Date(Number(deadline) * 1000).toLocaleString();
  elements.finalizedValue.textContent = finalized ? "Yes" : "No";
  elements.successfulValue.textContent = successful ? "Yes" : "No";
  elements.userContribution.textContent = `${ethers.formatEther(contribution)} ETH (~${ethers.formatUnits(contributionUsd, 18)} USD)`;

  updateActionAvailability();
}