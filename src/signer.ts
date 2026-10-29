import { isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Deployer account. Only private-key signing is supported for now; keep all signer
 * construction here so other backends (Ledger, multisig, KMS) can be added later.
 */
export function getAccount(envVar = "PRIVATE_KEY") {
  const key = process.env[envVar]?.trim();
  if (!key) throw new Error(`${envVar} is not set (copy .env.example to .env)`);
  const normalized = key.startsWith("0x") ? key : `0x${key}`;
  if (!isHex(normalized) || normalized.length !== 66) {
    throw new Error(`${envVar} must be a 32-byte hex string`);
  }
  return privateKeyToAccount(normalized);
}
