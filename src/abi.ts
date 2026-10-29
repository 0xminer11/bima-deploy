// Minimal ABI fragments, extracted from the forge artifacts in bima-credit-contracts/out.
// Regenerate if the contract interfaces change.

export const factoryAbi = [
  {
    type: "function",
    name: "createCollateralFixedTerm",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "asset", type: "address" },
          { name: "loanToken", type: "address" },
          { name: "investmentManager", type: "address" },
          { name: "permissionLevel", type: "uint8" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "salt", type: "bytes32" },
        ],
      },
    ],
    outputs: [
      { name: "strategyProxy", type: "address" },
      { name: "vault", type: "address" },
      { name: "escrow", type: "address" },
    ],
  },
  {
    type: "event",
    name: "CollateralFixedTermCreated",
    anonymous: false,
    inputs: [
      { name: "proxy", type: "address", indexed: true },
      { name: "vault", type: "address", indexed: true },
      { name: "escrow", type: "address", indexed: false },
    ],
  },
] as const;

export const strategyAbi = [
  { type: "function", name: "acceptBorrowerRole", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "borrower", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "investmentManager", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "pendingBorrower", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "vault", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "escrow", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "setPendingBorrower",
    stateMutability: "nonpayable",
    inputs: [{ name: "newBorrower", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setTerms",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "terms",
        type: "tuple",
        components: [
          { name: "minDeposit", type: "uint256" },
          { name: "minRedeem", type: "uint256" },
          { name: "maxCapacity", type: "uint256" },
          { name: "minCapacity", type: "uint256" },
          { name: "interestRate", type: "uint256" },
          { name: "lateInterestPenalty", type: "uint256" },
          { name: "lateInterestGracePeriod", type: "uint256" },
          { name: "interestInterval", type: "uint256" },
          { name: "duration", type: "uint256" },
          { name: "depositPeriod", type: "uint256" },
          { name: "acceptGracePeriod", type: "uint256" },
          { name: "withdrawalPeriod", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
] as const;
