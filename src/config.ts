import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getAddress, isHex } from "viem";
import { z } from "zod";
import type { AppConfig, DeployJob } from "./types.js";

export const CONFIG_PATH = fileURLToPath(new URL("../config/deploy.config.json", import.meta.url));

const address = z.string().refine((v) => /^0x[0-9a-fA-F]{40}$/.test(v), "invalid address").transform((v) => getAddress(v));
const amount = z.string().regex(/^\d+(\.\d+)?$/, "expected a decimal string like \"0.1\"");

const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 } as const;
/** Seconds as a number, or a string like "0s", "30m", "12h", "1d", "2w" (bare digits = seconds). */
const period = z
  .union([z.number().int().nonnegative(), z.string()])
  .transform((v, ctx) => {
    if (typeof v === "number") return v;
    const m = /^(\d+)([smhdw]?)$/.exec(v.trim());
    if (!m) {
      ctx.addIssue({ code: "custom", message: `invalid period "${v}" (use e.g. 0s, 30m, 12h, 1d, 2w)` });
      return z.NEVER;
    }
    return Number(m[1]) * UNIT_SECONDS[(m[2] || "s") as keyof typeof UNIT_SECONDS];
  });
const uint = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform((v) => BigInt(v));

const chainSchema = z.object({
  enabled: z.boolean().default(true),
  chainId: z.number().int().positive(),
  name: z.string().min(1),
  rpcUrl: z.string().url(),
  rpcEnv: z.string().optional(),
  explorerUrl: z.string().url().optional(),
  nativeCurrency: z.object({ name: z.string(), symbol: z.string(), decimals: z.number() }),
  factory: address,
  privateKeyEnv: z.string().min(1).default("PRIVATE_KEY"),
});

const targetSchema = z.object({
  asset: address,
  loanToken: address,
  investmentManager: address,
  borrower: address.optional(),
});

const vaultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1),
  permissionLevel: z.enum(["None", "KYC", "Whitelist"]),
  salt: z.union([z.literal("auto"), z.string().refine((v) => isHex(v) && v.length === 66, "salt must be 32-byte hex")]).default("auto"),
  terms: z.object({
    minDeposit: amount,
    minRedeem: amount,
    maxCapacity: amount,
    minCapacity: amount,
    interestRate: uint.default(0),
    lateInterestPenalty: uint.default(0),
    lateInterestGracePeriod: period.default(0),
    interestInterval: period,
    duration: period,
    depositPeriod: period,
    acceptGracePeriod: period,
    withdrawalPeriod: period,
  }),
  targets: z.record(targetSchema).refine((t) => Object.keys(t).length > 0, "needs at least one target chain"),
});

const configSchema = z
  .object({
    chains: z.record(chainSchema),
    vaults: z.array(vaultSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    cfg.vaults.forEach((v, i) => {
      if (seen.has(v.id)) ctx.addIssue({ code: "custom", path: ["vaults", i, "id"], message: `duplicate vault id "${v.id}"` });
      seen.add(v.id);
      for (const chainKey of Object.keys(v.targets)) {
        if (!cfg.chains[chainKey]) {
          ctx.addIssue({
            code: "custom",
            path: ["vaults", i, "targets", chainKey],
            message: `unknown chain "${chainKey}" (known: ${Object.keys(cfg.chains).join(", ")})`,
          });
        }
      }
    });
  });

export function loadConfig(path = CONFIG_PATH): AppConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${path}: ${err instanceof Error ? err.message : err}`);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid ${path}:\n${formatIssues(parsed.error)}`);
  return parsed.data as AppConfig;
}

/**
 * Expands the vault x chain matrix into jobs, grouped by chain. `--chain` / `--vault` narrow it;
 * without `--chain`, disabled chains are skipped.
 */
export function selectJobs(cfg: AppConfig, chainKeys: string[], vaultIds: string[]): DeployJob[] {
  for (const key of chainKeys) {
    if (!cfg.chains[key]) throw new Error(`Unknown chain "${key}". Known chains: ${Object.keys(cfg.chains).join(", ")}`);
  }
  for (const id of vaultIds) {
    if (!cfg.vaults.some((v) => v.id === id)) {
      throw new Error(`Unknown vault "${id}". Known vaults: ${cfg.vaults.map((v) => v.id).join(", ")}`);
    }
  }

  const jobs: DeployJob[] = [];
  for (const [chainKey, chain] of Object.entries(cfg.chains)) {
    if (chainKeys.length > 0 ? !chainKeys.includes(chainKey) : !chain.enabled) continue;
    for (const vault of cfg.vaults) {
      if (vaultIds.length > 0 && !vaultIds.includes(vault.id)) continue;
      const target = vault.targets[chainKey];
      if (target) jobs.push({ chainKey, chain, vault, target });
    }
  }
  if (jobs.length === 0) throw new Error("Nothing to deploy: no vault targets match the selected chains / vaults");
  return jobs;
}

export function rpcUrlFor(chain: { rpcUrl: string; rpcEnv?: string }): string {
  return (chain.rpcEnv && process.env[chain.rpcEnv]) || chain.rpcUrl;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}
