type GasSample = {
  contract: string;
  fn: string;
  values: bigint[];
};

type GasReceiptLike = {
  gasUsed: bigint;
};

type TxLike = {
  wait: (...args: unknown[]) => Promise<GasReceiptLike | null>;
};

type DeployableContract = {
  deploymentTransaction?: () => TxLike | null;
};

const gasSamples = new Map<string, GasSample>();

function getKey(contract: string, fn: string): string {
  return `${contract}:${fn}`;
}

function addGasSample(contract: string, fn: string, gasUsed: bigint): void {
  const key = getKey(contract, fn);
  const sample = gasSamples.get(key);

  if (sample !== undefined) {
    sample.values.push(gasUsed);
    return;
  }

  gasSamples.set(key, {
    contract,
    fn,
    values: [gasUsed],
  });
}

async function extractGasUsed<T extends TxLike>(txPromise: Promise<T>): Promise<bigint> {
  const tx = await txPromise;
  const receipt = await tx.wait();

  if (receipt === null) {
    throw new Error("Transaction receipt is null.");
  }

  return receipt.gasUsed;
}

function formatInteger(value: bigint): string {
  return value.toString();
}

function formatTable(): string {
  const rows = [...gasSamples.values()]
    .map((sample) => {
      const min = sample.values.reduce((left, right) => (left < right ? left : right));
      const max = sample.values.reduce((left, right) => (left > right ? left : right));
      const total = sample.values.reduce((sum, current) => sum + current, 0n);
      const average = total / BigInt(sample.values.length);

      return {
        Contract: sample.contract,
        Function: sample.fn,
        Min: formatInteger(min),
        Average: formatInteger(average),
        Max: formatInteger(max),
        "Number of calls": sample.values.length.toString(),
      };
    })
    .sort((left, right) => {
      if (left.Contract === right.Contract) {
        return left.Function.localeCompare(right.Function);
      }

      return left.Contract.localeCompare(right.Contract);
    });

  if (rows.length === 0) {
    return "No gas samples recorded.";
  }

  const headers = ["Contract", "Function", "Min", "Average", "Max", "Number of calls"];

  return [
    headers.join("\t"),
    ...rows.map((row) =>
      [row.Contract, row.Function, row.Min, row.Average, row.Max, row["Number of calls"]].join("\t"),
    ),
  ].join("\n");
}

let reportHookRegistered = false;

function ensureReportHook(): void {
  if (reportHookRegistered) {
    return;
  }

  reportHookRegistered = true;

  process.once("beforeExit", () => {
    if (gasSamples.size === 0) {
      return;
    }

    console.log("\nGas usage report");
    console.log(formatTable());
  });
}

ensureReportHook();

export async function trackGasUsage<T extends TxLike>(
  contract: string,
  fn: string,
  txPromise: Promise<T>,
): Promise<void> {
  addGasSample(contract, fn, await extractGasUsed(txPromise));
}

export async function deployAndTrack<T extends DeployableContract>(
  contract: string,
  deploymentPromise: Promise<T>,
): Promise<T> {
  const deployedContract = await deploymentPromise;
  const deploymentTx = deployedContract.deploymentTransaction?.() ?? null;

  if (deploymentTx === null) {
    throw new Error(`Missing deployment transaction for ${contract}`);
  }

  const receipt = await deploymentTx.wait();

  if (receipt === null) {
    throw new Error(`Missing deployment receipt for ${contract}`);
  }

  addGasSample(contract, "constructor", receipt.gasUsed);
  return deployedContract;
}