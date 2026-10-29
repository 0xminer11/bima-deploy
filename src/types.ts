import type { Address, Hex } from "viem";

export type PermissionLevel = "None" | "KYC" | "Whitelist";

/** Loan terms. Amounts are human-readable strings in `asset` units; periods are in seconds. */
export interface LoanTermsConfig {
  minDeposit: string;
  minRedeem: string;
  maxCapacity: string;
  minCapacity: string;
  /** Raw uint256, passed through to the contract as-is. */
  interestRate: bigint;
  /** Raw uint256, passed through to the contract as-is. */
  lateInterestPenalty: bigint;
  lateInterestGracePeriod: number;
  interestInterval: number;
  duration: number;
  depositPeriod: number;
  acceptGracePeriod: number;
  withdrawalPeriod: number;
}

export interface ChainConfig {
  /** Disabled chains are skipped unless selected with `--chain`. */
  enabled: boolean;
  chainId: number;
  name: string;
  /** Default RPC URL. */
  rpcUrl: string;
  /** Env var that overrides rpcUrl when set. */
  rpcEnv?: string;
  explorerUrl?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  /** Deployed CollateralFixedTermFactory on this chain. */
  factory: Address;
  /** Env var holding this chain's deployer key. Defaults to PRIVATE_KEY. */
  privateKeyEnv: string;
}

/** Where (and with which tokens / manager) a vault is deployed on one chain. */
export interface VaultTarget {
  /** Collateral token the vault accepts. */
  asset: Address;
  /** Loan token distributed to LPs. */
  loanToken: Address;
  /** Must be the address of the chain's deployer key (manager-only calls). */
  investmentManager: Address;
  /** Defaults to investmentManager. Must equal the deployer key's address for now. */
  borrower?: Address;
}

export interface VaultConfig {
  /** Unique id; deployments are recorded per (chain, id). */
  id: string;
  /** Vault share token name / symbol. */
  name: string;
  symbol: string;
  permissionLevel: PermissionLevel;
  /** "auto" generates a fresh random CREATE2 salt per deployment. */
  salt: "auto" | Hex;
  terms: LoanTermsConfig;
  /** Chain key -> target. The vault is deployed once on each listed chain. */
  targets: Record<string, VaultTarget>;
}

export interface AppConfig {
  chains: Record<string, ChainConfig>;
  vaults: VaultConfig[];
}

/** One deployment: a vault on a chain. */
export interface DeployJob {
  chainKey: string;
  chain: ChainConfig;
  vault: VaultConfig;
  target: VaultTarget;
}
