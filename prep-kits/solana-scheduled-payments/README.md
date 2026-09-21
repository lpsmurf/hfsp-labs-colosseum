# solana-scheduled-payments

**Programmable, scheduled token payments for Solana agents.** Create multi-hop transfer pipelines — vesting, payroll, escrow, treasury drips — that execute on-chain over time, with client-side signing so keys never leave the agent. Backed by the Multihopper protocol.

> Separate skill from `solana-x402-bridge`. Solana-native; not cross-chain.

## Modules
| Module | Purpose |
|---|---|
| `create-pipeline` | Define recipients, amounts, timing, sequence → transferId |
| `prepare-and-sign` | Fetch unsigned txs, sign locally, broadcast in order, confirm |
| `pipeline-status` | Poll completion; handle blockhash expiry / resume |
| `compliance-screening` | Sanctions/risk screening deposit + flagged-route reporting |

## Status
Prep kit / scaffold. See `BUILD-BRIEF.md`. Backend: https://dev-docs.multihopper.com/ — secondary submission, build after the bridge.

## License
MIT
