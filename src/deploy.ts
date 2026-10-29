import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  getAddress,
  http,
  keccak256,
  parseEventLogs,
  parseUnits,
  toHex,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { erc20Abi, factoryAbi, strategyAbi } from "./abi.js";
import { rpcUrlFor } from "./config.js";
import { banner, kv, ok, step, txUrl } from "./format.js";
import { readRecords, saveRecord } from "./records.js";
import { getAccount } from "./signer.js";
import type { DeployJob } from "./types.js";

const PERMISSION_LEVEL = { None: 0, KYC: 1, Whitelist: 2 } as const;

export interface DeployResult {
  vaultId: string;
  chain: string;
  chainId: number;
  status: "dry-run" | "complete" | "partial" | "skipped";
  deployer: Address;
  factory: Address;
  asset: Address;
  loanToken: Address;
  salt: Hex;
  strategyProxy?: Address;
  vault?: Address;
  escrow?: Address;
  transactions: { step: string; hash: Hash }[];
  deployedAt: string;
  error?: string;
}

export function contractRows(strategy: Address, vault: Address, escrow: Address): string {
  return kv([
    ["Strategy", strategy],
    ["Vault", vault],
    ["Escrow", escrow],
  ]);
}

function newSalt(salt: "auto" | Hex): Hex {
  if (salt !== "auto") return salt;
  return keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
}

/** Deploys one vault on one chain. Already-recorded (chain, vault) pairs are skipped unless `force`. */
export async function deployVault(job: DeployJob, opts: { dryRun: boolean; force: boolean }): Promise<DeployResult> {
  const { chainKey, chain: chainCfg, vault: cfg, target } = job;
  const root = process.cwd();

  const existing = readRecords(root, chainKey)[cfg.id];
  if (existing && !opts.force) {
    banner(`${cfg.id} on ${chainCfg.name}`, `${chainKey} · chain ${chainCfg.chainId}`);
    step(`Skipped: already ${existing.status ?? "deployed"} (use --force to deploy again)`);
    console.log(contractRows(existing.strategy, existing.vault, existing.escrow));
    return {
      vaultId: cfg.id,
      chain: chainKey,
      chainId: chainCfg.chainId,
      status: "skipped",
      deployer: existing.deployer,
      factory: existing.factory,
      asset: target.asset,
      loanToken: target.loanToken,
      salt: existing.salt,
      strategyProxy: existing.strategy,
      vault: existing.vault,
      escrow: existing.escrow,
      transactions: [],
      deployedAt: existing.deployedAt,
    };
  }

  const account = getAccount(chainCfg.privateKeyEnv);
  const rpcUrl = rpcUrlFor(chainCfg);
  const chain = defineChain({
    id: chainCfg.chainId,
    name: chainCfg.name,
    nativeCurrency: chainCfg.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: chainCfg.explorerUrl ? { default: { name: "Explorer", url: chainCfg.explorerUrl } } : undefined,
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  // --- preflight ---------------------------------------------------------
  const rpcChainId = await publicClient.getChainId();
  if (rpcChainId !== chainCfg.chainId) {
    throw new Error(`RPC ${rpcUrl} reports chain id ${rpcChainId}, expected ${chainCfg.chainId}`);
  }

  const { asset, loanToken } = target;
  const borrower = getAddress(target.borrower ?? target.investmentManager);
  const investmentManager = getAddress(target.investmentManager);

  if (getAddress(account.address) !== investmentManager) {
    throw new Error(
      `${chainCfg.privateKeyEnv} address ${account.address} != investmentManager ${investmentManager}. ` +
        `setPendingBorrower/setTerms are manager-only and would revert.`,
    );
  }
  if (borrower !== investmentManager) {
    throw new Error(
      `borrower (${borrower}) != investmentManager. A single key can't call acceptBorrowerRole for a ` +
        `different borrower; only borrower = investmentManager is supported for now.`,
    );
  }

  for (const [label, addr] of [["factory", chainCfg.factory], ["asset", asset], ["loanToken", loanToken]] as const) {
    const code = await publicClient.getCode({ address: addr });
    if (!code || code === "0x") throw new Error(`No contract code at ${label} ${addr} on ${chainKey}`);
  }

  const balance = await publicClient.getBalance({ address: account.address });
  banner(`${cfg.id} on ${chainCfg.name}`, `${chainKey} · chain ${chainCfg.chainId}${opts.dryRun ? " · dry run" : ""}`);
  console.log(
    kv([
      ["Deployer", account.address],
      ["Balance", `${formatEther(balance)} ${chainCfg.nativeCurrency.symbol}`],
      ["Factory", chainCfg.factory],
      ["Loan", `${cfg.name} (${cfg.symbol})`],
    ]),
  );
  console.log();
  if (balance === 0n && !opts.dryRun) throw new Error(`Deployer has no ${chainCfg.nativeCurrency.symbol} for gas on ${chainKey}`);

  const decimals = await publicClient.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" });
  const t = cfg.terms;
  const terms = {
    minDeposit: parseUnits(t.minDeposit, decimals),
    minRedeem: parseUnits(t.minRedeem, decimals),
    maxCapacity: parseUnits(t.maxCapacity, decimals),
    minCapacity: parseUnits(t.minCapacity, decimals),
    interestRate: BigInt(t.interestRate),
    lateInterestPenalty: BigInt(t.lateInterestPenalty),
    lateInterestGracePeriod: BigInt(t.lateInterestGracePeriod),
    interestInterval: BigInt(t.interestInterval),
    duration: BigInt(t.duration),
    depositPeriod: BigInt(t.depositPeriod),
    acceptGracePeriod: BigInt(t.acceptGracePeriod),
    withdrawalPeriod: BigInt(t.withdrawalPeriod),
  };

  const salt = newSalt(cfg.salt);
  const result: DeployResult = {
    vaultId: cfg.id,
    chain: chainKey,
    chainId: chainCfg.chainId,
    status: "partial",
    deployer: account.address,
    factory: chainCfg.factory,
    asset,
    loanToken,
    salt,
    transactions: [],
    deployedAt: new Date().toISOString(),
  };

  let createBlock = 0n;
  const record = (status: "complete" | "partial") => {
    if (opts.dryRun || !result.strategyProxy || !result.vault || !result.escrow) return;
    const [createTx] = result.transactions;
    saveRecord(root, {
      vaultId: cfg.id,
      chain: chainKey,
      chainId: chainCfg.chainId,
      factory: chainCfg.factory,
      strategy: result.strategyProxy,
      vault: result.vault,
      escrow: result.escrow,
      salt,
      deployer: account.address,
      createTx: createTx!.hash,
      blockNumber: createBlock.toString(),
      txs: Object.fromEntries(result.transactions.map((t) => [t.step, t.hash])),
      deployedAt: result.deployedAt,
      status,
    });
  };

  const send = async (name: string, hash: Hash) => {
    result.transactions.push({ step: name, hash });
    ok(`${name}  ${txUrl(chainCfg.explorerUrl, hash)}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${name} reverted (tx ${hash})`);
    if (result.strategyProxy) record("partial");
    return receipt;
  };

  try {
    // --- 1. create strategy via factory --------------------------------
    const params = {
      asset,
      loanToken,
      investmentManager,
      permissionLevel: PERMISSION_LEVEL[cfg.permissionLevel],
      name: cfg.name,
      symbol: cfg.symbol,
      salt,
    };
    const { request, result: simulated } = await publicClient.simulateContract({
      account,
      address: chainCfg.factory,
      abi: factoryAbi,
      functionName: "createCollateralFixedTerm",
      args: [params],
    });
    const [simProxy, simVault, simEscrow] = simulated;
    ok("Simulation passed");

    if (opts.dryRun) {
      console.log("\n  Would deploy\n" + contractRows(simProxy, simVault, simEscrow));
      Object.assign(result, { status: "dry-run", strategyProxy: simProxy, vault: simVault, escrow: simEscrow });
      return result;
    }

    const createReceipt = await send("createCollateralFixedTerm", await walletClient.writeContract(request));
    const [created] = parseEventLogs({ abi: factoryAbi, eventName: "CollateralFixedTermCreated", logs: createReceipt.logs });
    if (!created) throw new Error("CollateralFixedTermCreated event not found in receipt");
    const strategy = created.args.proxy;
    result.strategyProxy = strategy;
    result.vault = created.args.vault;
    result.escrow = created.args.escrow;
    createBlock = createReceipt.blockNumber;
    record("partial");
    console.log("\n  Deployed\n" + contractRows(strategy, created.args.vault, created.args.escrow) + "\n");

    // --- 2. wire up borrower + terms -----------------------------------
    const strategyCall = { account, address: strategy, abi: strategyAbi } as const;

    const pending = await publicClient.simulateContract({ ...strategyCall, functionName: "setPendingBorrower", args: [borrower] });
    await send("setPendingBorrower", await walletClient.writeContract(pending.request));

    const accept = await publicClient.simulateContract({ ...strategyCall, functionName: "acceptBorrowerRole" });
    await send("acceptBorrowerRole", await walletClient.writeContract(accept.request));

    const setTerms = await publicClient.simulateContract({ ...strategyCall, functionName: "setTerms", args: [terms] });
    await send("setTerms", await walletClient.writeContract(setTerms.request));

    result.status = "complete";
    record("complete");
    ok("Terms set - loan is open for deposits");
    return result;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { partial: result });
  }
}
