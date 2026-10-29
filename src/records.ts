import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Address, Hex } from "viem";

export interface DeploymentRecord {
  vaultId: string;
  chain: string;
  chainId: number;
  factory: Address;
  strategy: Address;
  vault: Address;
  escrow: Address;
  salt: Hex;
  deployer: Address;
  createTx: Hex;
  blockNumber: string;
  txs: Record<string, Hex>;
  /** "partial" = strategy created but a later step failed; finish it by hand. */
  status: "complete" | "partial";
  deployedAt: string;
}

type File = Record<string, DeploymentRecord>;

const pathFor = (root: string, chain: string) => join(root, "deployments", `${chain}.json`);

export function readRecords(root: string, chain: string): File {
  const p = pathFor(root, chain);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as File) : {};
}

export function saveRecord(root: string, rec: DeploymentRecord): void {
  const p = pathFor(root, rec.chain);
  mkdirSync(dirname(p), { recursive: true });
  const all = readRecords(root, rec.chain);
  all[rec.vaultId] = rec;
  writeFileSync(p, JSON.stringify(all, null, 2) + "\n");
}
