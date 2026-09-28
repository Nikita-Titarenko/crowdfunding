import "dotenv/config";

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function runHardhatVerify(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const child = spawn(
      isWindows ? "cmd.exe" : "npx",
      isWindows ? ["/c", "npx", ...args] : args,
      {
        cwd: rootDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(Object.assign(error, { stdout, stderr }));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        Object.assign(new Error(`Hardhat verification failed with exit code ${code}.`), {
          stdout,
          stderr,
          code,
        }),
      );
    });
  });
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

async function handlePinCampaignMetadata(req, res) {
  let payload;

  try {
    payload = await readJsonBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Request body must be valid JSON." }));
    return;
  }

  if (!payload?.title || !payload?.description) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Campaign title and description are required." }));
    return;
  }

  const pinataApiKey = process.env.PINATA_API_KEY;
  const pinataSecret = process.env.PINATA_SECRET_API_KEY;

  if (!pinataApiKey || !pinataSecret) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "PINATA_API_KEY and PINATA_SECRET_API_KEY must be set." }));
    return;
  }

  try {
    const body = JSON.stringify({
      pinataOptions: {
        cidVersion: 1,
      },
      pinataMetadata: {
        name: `${payload.title}.json`,
      },
      pinataContent: {
        name: payload.title,
        description: payload.description,
        image: payload.image || "",
        category: payload.category || "general",
        createdBy: payload.createdBy || "",
      },
    });

    const pinResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "pinata_api_key": pinataApiKey,
        "pinata_secret_api_key": pinataSecret,
      },
      body,
    });

    const pinData = await pinResponse.json().catch(() => null);

    if (!pinResponse.ok || !pinData?.IpfsHash) {
      throw new Error(pinData?.error?.details || pinData?.message || "Pinata upload failed.");
    }

    const cid = pinData.IpfsHash;
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${cid}`;

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, cid, ipfsUrl }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Pinata error";
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: message }));
  }
}

async function handleVerifyCampaign(req, res) {
  if (!process.env.ETHERSCAN_API_KEY) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "ETHERSCAN_API_KEY is not set." }));
    return;
  }

  let payload;

  try {
    payload = await readJsonBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Request body must be valid JSON." }));
    return;
  }

  const requiredFields = ["address", "registry", "token", "priceFeed", "metadataCid", "goalUsd", "duration", "beneficiary"];
  const missingField = requiredFields.find((field) => !payload?.[field] && !(field === "metadataCid" && payload?.title));

  if (missingField) {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: `Missing field: ${missingField}` }));
    return;
  }

  const commandArgs = [
    "hardhat",
    "run",
    "--build-profile",
    "production",
    "--network",
    "sepolia",
    "scripts/verify-campaign.ts",
  ];

  const verificationEnv = {
    ...process.env,
    VERIFICATION_ADDRESS: payload.address,
    VERIFICATION_REGISTRY: payload.registry,
    VERIFICATION_TOKEN: payload.token,
    VERIFICATION_PRICE_FEED: payload.priceFeed,
    VERIFICATION_METADATA_CID: payload.metadataCid || payload.title,
    VERIFICATION_TITLE: payload.title || payload.metadataCid,
    VERIFICATION_GOAL_USD: String(payload.goalUsd),
    VERIFICATION_DURATION: String(payload.duration),
    VERIFICATION_BENEFICIARY: payload.beneficiary,
    VERIFICATION_METADATA_URI: payload.metadataUri || "",
  };

  try {
    const { stdout, stderr } = await runHardhatVerify(commandArgs, verificationEnv);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: true, output: [stdout, stderr].filter(Boolean).join("\n") }));
  } catch (error) {
    const message = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: message || "Campaign verification failed." }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "POST" && url.pathname === "/api/pin-campaign-metadata") {
    await handlePinCampaignMetadata(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/verify-campaign") {
    await handleVerifyCampaign(req, res);
    return;
  }

  let requestedPath = url.pathname === "/" ? "/web/index.html" : url.pathname;

  if (requestedPath.startsWith("/artifacts/")) {
    requestedPath = requestedPath.replace("/artifacts/", "/artifacts/");
  } else if (!requestedPath.startsWith("/web/")) {
    requestedPath = `/web${requestedPath}`;
  }

  const safePath = path.normalize(path.join(rootDir, requestedPath));

  if (!safePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(safePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Web app is running at http://localhost:${PORT}`);
});
