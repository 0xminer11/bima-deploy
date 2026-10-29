import "dotenv/config";
import { parseArgs } from "node:util";
import { getAddress } from "viem";
import { loadConfig, rpcUrlFor, selectJobs } from "./config.js";
import { contractRows, deployVault, type DeployResult } from "./deploy.js";
import { bold, dim, fail, green, red, yellow } from "./format.js";
import { getAccount } from "./signer.js";
import type { DeployJob } from "./types.js";

const USAGE = `Usage: tsx src/cli.ts <command> [options]

Commands:
  deploy   Create every selected vault on every chain it targets (simulate -> send txs)
  check    Validate config and show the deployment plan (no RPC calls)
  list     List configured chains and vaults

Options (deploy / check):
  --chain <key>   Chain key from config/deploy.config.json (repeatable). Default: all enabled chains
  --vault <id>    Vault id (repeatable). Default: all vaults
  --dry-run       deploy only: simulate the factory call, send nothing
  --force         deploy only: deploy again even if (chain, vault) is already in deployments/
  -h, --help

A vault is deployed once per chain listed in its "targets". Already-deployed (chain, vault)
pairs are skipped, so re-running only deploys what is new.
`;

type Outcome = { job: DeployJob; result?: DeployResult; error?: string };

function deployerOf(envVar: string): string {
  try {
    return getAccount(envVar).address;
  } catch (err) {
    return `(${err instanceof Error ? err.message : err})`;
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      chain: { type: "string", multiple: true },
      vault: { type: "string", multiple: true },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const command = positionals[0];
  if (values.help || !command) {
    console.log(USAGE);
    return;
  }

  const cfg = loadConfig();

  if (command === "list") {
    console.log(bold("Chains"));
    for (const [key, c] of Object.entries(cfg.chains)) {
      console.log(`  ${c.enabled ? "[x]" : "[ ]"} ${key} (chain ${c.chainId}) rpc=${rpcUrlFor(c)}`);
      console.log(`        factory ${c.factory}  key ${c.privateKeyEnv}`);
    }
    console.log(`\n${bold("Vaults")}`);
    for (const v of cfg.vaults) {
      console.log(`  ${v.id}  ${v.name} / ${v.symbol}  permission ${v.permissionLevel}`);
      console.log(`        chains: ${Object.keys(v.targets).join(", ")}`);
    }
    return;
  }

  if (command !== "check" && command !== "deploy") {
    console.error(`Unknown command "${command}"\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const jobs = selectJobs(cfg, values.chain ?? [], values.vault ?? []);

  if (command === "check") {
    let problems = 0;
    for (const { chainKey, chain, vault, target } of jobs) {
      const deployer = deployerOf(chain.privateKeyEnv);
      const manager = getAddress(target.investmentManager);
      const mismatch = deployer.startsWith("0x") && deployer !== manager;
      if (mismatch || !deployer.startsWith("0x")) problems++;
      console.log(`\n${bold(`${vault.id} on ${chain.name}`)}  ${dim(`${chainKey} · chain ${chain.chainId}`)}`);
      console.log(`    Loan        ${vault.name} / ${vault.symbol}, permission ${vault.permissionLevel}`);
      console.log(`    Asset       ${target.asset}`);
      console.log(`    Loan token  ${target.loanToken}`);
      console.log(`    Manager     ${manager}`);
      console.log(`    Deployer    ${deployer} ${mismatch ? red("<- does not match manager") : ""}`);
    }
    console.log(`\n${jobs.length} deployment(s) planned`);
    if (problems > 0) {
      console.log(red(`${problems} problem(s) found`));
      process.exitCode = 1;
    } else {
      console.log("Config OK");
    }
    return;
  }

  const outcomes: Outcome[] = [];
  for (const job of jobs) {
    try {
      const result = await deployVault(job, { dryRun: values["dry-run"] ?? false, force: values.force ?? false });
      outcomes.push({ job, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      fail(`${job.vault.id} on ${job.chainKey}: ${error}`);
      const partial = (err as { partial?: DeployResult }).partial;
      if (partial?.strategyProxy) fail(`strategy ${partial.strategyProxy} was already created - finish the remaining steps manually`);
      outcomes.push({ job, result: partial, error });
    }
  }

  const failed = outcomes.filter((o) => o.error).length;
  console.log(`\n${bold("Summary")}`);
  for (const { job, result, error } of outcomes) {
    const status = error ? "failed" : result!.status;
    const badge = error ? red(status) : status === "complete" ? green(status) : yellow(status);
    console.log(`\n  ${bold(job.vault.id)} on ${job.chainKey}  ${badge}`);
    if (result?.strategyProxy && result.vault && result.escrow) console.log(contractRows(result.strategyProxy, result.vault, result.escrow));
    if (error) console.log(`    ${dim(error.split("\n")[0]!)}`);
  }
  if (failed > 0) {
    console.log(`\n  ${red(`${failed} of ${outcomes.length} deployment(s) failed`)}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
