# bima-deploy

Config-driven CLI that creates a Bima `CollateralFixedTerm` loan (strategy proxy + vault + escrow) on
one or more EVM chains through an already-deployed `CollateralFixedTermFactory`.

Per chain it runs the same flow as `bima-credit-contracts/script/CreateCollateralFixedTerm.s.sol`:

1. `factory.createCollateralFixedTerm(params)`
2. `strategy.setPendingBorrower(borrower)`
3. `strategy.acceptBorrowerRole()`
4. `strategy.setTerms(terms)`

## Setup

```sh
npm install
cp .env.example .env     # set PRIVATE_KEY
```

The deployer key must belong to each target's `investmentManager` (the manager-only calls revert
otherwise). For now `borrower` must equal `investmentManager`, because one key signs `acceptBorrowerRole`.

## Config: `config/deploy.config.json`

One file describes the whole **vault x chain** matrix.

- `chains`: per chain key: `chainId`, `name`, `rpcUrl` (+ optional `rpcEnv` override), `explorerUrl`,
  `nativeCurrency`, `factory`, optional `privateKeyEnv` (env var with that chain's key, default
  `PRIVATE_KEY`) and optional `enabled` (default `true`).
- `vaults`: a list; each has a unique `id`, `name`, `symbol`, `permissionLevel`, `terms`, optional `salt`
  (default `"auto"`), and `targets`.
- `targets`: chain key -> `{ asset, loanToken, investmentManager, borrower? }`. **A vault is deployed once on
  every chain listed in its targets**, with that chain's own token addresses.

Terms: amounts are human-readable (parsed with the collateral token's on-chain decimals); periods are
seconds or strings like `"0s"`, `"30m"`, `"12h"`, `"1d"`, `"2w"`; `interestRate`, `lateInterestPenalty`,
`lateInterestGracePeriod` default to `0`.

Example: V1..V5 on C1..C5 is five vaults, each with one target (`v1.targets.c1`, `v2.targets.c2`, ...).
To put another vault on a chain later, append a vault (or add a `targets.<chain>` entry to an existing
one). Re-running `deploy` skips every (chain, vault id) already recorded in `deployments/<chain>.json`,
so only the new ones are deployed.

## Commands

```sh
npm run list                          # configured chains and vaults
npm run check                         # validate config + show the plan (no network calls)
npm run deploy:dry                    # simulate the factory call for every planned deployment, send nothing
npm run deploy                        # deploy everything not yet deployed
npm run deploy -- --chain monad_testnet           # only this chain (repeatable)
npm run deploy -- --vault sept-2026-sbmbtc        # only this vault (repeatable)
npm run deploy -- --force                         # redeploy even if already recorded
```

Each real deployment is recorded in `deployments/<chain>.json`, keyed by vault id (addresses, tx hashes,
salt, status). Deployments run one after another, grouped by chain; a failure doesn't stop the rest.

## Notes

- If a later step fails after the strategy was created, the record is saved with `status: "partial"` and
  the run exits non-zero. Re-runs skip it (it is already recorded), so finish the remaining calls by hand
  rather than using `--force`, which would create a second loan.
- `--dry-run` only simulates step 1; the later calls depend on the strategy existing.
- Signer construction lives in `src/signer.ts` so Ledger/multisig backends can be added later.
- Contract ABIs (`src/abi.ts`) are trimmed from the forge artifacts; update them if the interfaces change.
