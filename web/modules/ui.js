import { appState } from "./state.js";
import { elements } from "./dom.js";

export function shortAddress(address) {
  if (!address) {
    return "—";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function resetCampaignUi(text = "No campaign selected") {
  elements.campaignTitle.textContent = text;
  elements.campaignAddressValue.textContent = "—";
  elements.campaignMinterValue.textContent = "—";
  elements.goalValue.textContent = "—";
  elements.raisedValue.textContent = "—";
  elements.deadlineValue.textContent = "—";
  elements.finalizedValue.textContent = "—";
  elements.successfulValue.textContent = "—";
  elements.userContribution.textContent = "—";
}

export function setMessage(text, type = "neutral") {
  elements.deployStatus.textContent = text;
  elements.deployStatus.className = `message ${type}`;
}

export function setActiveTab(tabName) {
  appState.activeTab = tabName;

  for (const button of elements.tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tabName);
  }

  for (const panel of elements.tabPanels) {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  }
}

export function addTxEntry(label, status, hash, message) {
  appState.txs.unshift({ label, status, hash, message });
  renderTransactions();
}

export function renderTransactions() {
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

export function renderEvents() {
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

export function decodeErrorFromContract(contract, error) {
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

export function humanizeError(contract, error) {
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
    MissingMinterRole: "This campaign does not have MINTER_ROLE, so it cannot mint reward tokens.",
    TransferFailed: "The contract failed to transfer funds.",
    AccessControlUnauthorizedAccount: "Your wallet does not have the required role.",
  };

  const foundKey = Object.keys(mapped).find((key) => message.includes(key));
  return foundKey ? mapped[foundKey] : message;
}

export function updateActionAvailability() {
  const connected = Boolean(appState.account);
  const hasCampaign = Boolean(appState.campaign);

  elements.createCampaignBtn.disabled = !connected;
  elements.loadCampaignBtn.disabled = !connected;
  elements.registerAuthorBtn.disabled = !connected;
  elements.grantMinterRoleBtn.disabled = !connected || !hasCampaign;
  elements.contributeBtn.disabled = !connected || !hasCampaign;
  elements.withdrawBtn.disabled = !connected || !hasCampaign;
  elements.claimRefundBtn.disabled = !connected || !hasCampaign;
  elements.claimRewardBtn.disabled = !connected || !hasCampaign;
}