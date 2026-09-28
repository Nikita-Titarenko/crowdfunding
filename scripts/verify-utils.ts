import { readFile } from "node:fs/promises";
import path from "node:path";

import hre from "hardhat";
import { Interface, type InterfaceAbi } from "ethers";

const MAX_VERIFY_ATTEMPTS = 4;
const VERIFY_RETRY_DELAY_MS = 15_000;
const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";
const SEPOLIA_CHAIN_ID = "11155111";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAlreadyVerified(message: string) {
  return /already verified/i.test(message);
}

function isRetryableVerificationError(message: string) {
  return [
    /pending/i,
    /try again/i,
    /wait/i,
    /429/i,
    /5\d\d/i,
    /temporar/i,
    /unable to locate contractcode/i,
    /contract code.*not found/i,
    /unable to locate.*contract/i,
  ].some((pattern) => pattern.test(message));
}

type VerificationRequest = {
  address: string;
  constructorArgs: unknown[];
  label: string;
  contract: string;
};

function resolveArtifactPath(contract: string) {
  const separatorIndex = contract.lastIndexOf(":");
  if (separatorIndex === -1) {
    throw new Error(`Invalid contract identifier: ${contract}`);
  }

  const sourceName = contract.slice(0, separatorIndex);
  const contractName = contract.slice(separatorIndex + 1);
  const artifactPath = path.join(hre.config.paths.root, "artifacts", sourceName, `${contractName}.json`);

  return { artifactPath, contractName, sourceName };
}

async function loadBuildInfo(contract: string) {
  const { artifactPath, contractName, sourceName } = resolveArtifactPath(contract);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    abi: InterfaceAbi;
    buildInfoId: string;
    contractName: string;
    sourceName: string;
  };

  const buildInfoPath = path.join(hre.config.paths.root, "artifacts", "build-info", `${artifact.buildInfoId}.json`);
  const buildInfo = JSON.parse(await readFile(buildInfoPath, "utf8")) as {
    input: unknown;
    solcLongVersion: string;
  };

  return {
    abi: artifact.abi,
    buildInfo,
    contractName,
    sourceName,
  };
}

function encodeConstructorArgs(abi: InterfaceAbi, constructorArgs: unknown[]) {
  const contractInterface = new Interface(abi);
  return contractInterface.encodeDeploy(constructorArgs).replace(/^0x/, "");
}

async function etherscanRequest(
  action: "verifysourcecode" | "checkverifystatus",
  payload: Record<string, string>,
) {
  const queryParams = new URLSearchParams({
    module: "contract",
    action,
    chainid: SEPOLIA_CHAIN_ID,
    apikey: process.env.ETHERSCAN_API_KEY ?? "",
  });

  const formBody = new URLSearchParams({
    ...payload,
  });

  const response = await fetch(`${ETHERSCAN_API_URL}?${queryParams.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody,
  });

  const responseBody = (await response.json()) as { status?: string; message?: string; result?: string };

  if (!response.ok) {
    throw new Error(
      `Etherscan request failed with status ${response.status}: ${responseBody.result ?? responseBody.message ?? "Unknown error"}`,
    );
  }

  return responseBody;
}

export async function verifyOnEtherscan({ address, constructorArgs, label, contract }: VerificationRequest) {
  if (!process.env.ETHERSCAN_API_KEY) {
    console.log(`Skipping verification for ${label}: ETHERSCAN_API_KEY is not set.`);
    return false;
  }

  const { abi, buildInfo, contractName, sourceName } = await loadBuildInfo(contract);

  const sourceCode = JSON.stringify(buildInfo.input);
  const compilerVersion = `v${buildInfo.solcLongVersion}`;
  const encodedConstructorArgs = encodeConstructorArgs(abi, constructorArgs);
  const contractNameForExplorer = `${sourceName}:${contractName}`;

  for (let attempt = 1; attempt <= MAX_VERIFY_ATTEMPTS; attempt += 1) {
    try {
      const submitResponse = await etherscanRequest("verifysourcecode", {
        contractaddress: address,
        sourceCode,
        codeformat: "solidity-standard-json-input",
        contractname: contractNameForExplorer,
        compilerversion: compilerVersion,
        constructorArguments: encodedConstructorArgs,
      });

      const submitResult = submitResponse.result ?? "";

      if (/already verified/i.test(submitResult)) {
        console.log(`${label} already verified on Etherscan: ${address}`);
        return true;
      }

      if (!submitResponse.status || submitResponse.status !== "1") {
        throw new Error(submitResult || submitResponse.message || "Etherscan verification submission failed.");
      }

      const guid = submitResult;

      while (true) {
        const statusResponse = await etherscanRequest("checkverifystatus", { guid });
        const statusResult = statusResponse.result ?? "";

        if (/Pending in queue/i.test(statusResult)) {
          await delay(3000);
          continue;
        }

        if (/Contract source code already verified/i.test(statusResult) || /Already Verified/i.test(statusResult)) {
          console.log(`${label} already verified on Etherscan: ${address}`);
          return true;
        }

        if (/Pass - Verified/i.test(statusResult)) {
          console.log(`${label} verified on Etherscan: ${address}`);
          return true;
        }

        if (/Fail - Unable to verify/i.test(statusResult) || /FAIL/i.test(statusResult)) {
          throw new Error(statusResult);
        }

        throw new Error(statusResult || statusResponse.message || "Unexpected Etherscan verification response.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (isAlreadyVerified(message)) {
        console.log(`${label} already verified on Etherscan: ${address}`);
        return true;
      }

      if (attempt < MAX_VERIFY_ATTEMPTS && isRetryableVerificationError(message)) {
        console.log(`Verification attempt ${attempt} for ${label} failed: ${message}`);
        console.log(`Retrying in ${VERIFY_RETRY_DELAY_MS / 1000} seconds...`);
        await delay(VERIFY_RETRY_DELAY_MS);
        continue;
      }

      throw new Error(`Failed to verify ${label} at ${address}: ${message}`);
    }
  }

  return false;
}
