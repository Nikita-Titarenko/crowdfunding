# Crowdfunding

## Verification setup

Set these variables in `.env` before deploying or verifying on Sepolia:

```bash
SEPOLIA_RPC_URL=...
SEPOLIA_PRIVATE_KEY=...
ETHERSCAN_API_KEY=...
```

## Build with the production profile so the deployed bytecode matches Etherscan verification:

```bash
npm run build
```

## Deploy command

```bash
npm run deploy:sepolia
```

## Launch web page

```bash
npm run start:web
```