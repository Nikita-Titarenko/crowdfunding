export const appState = {
  provider: null,
  signer: null,
  account: null,
  activeTab: "create-campaign",
  registry: null,
  token: null,
  campaign: null,
  artifacts: null,
  ethUsdPrice: null,
  roles: {
    isAuthor: false,
    isRegistryManager: false,
    isTokenAdmin: false,
    campaignHasMinterRole: false,
  },
  txs: [],
  events: [],
};