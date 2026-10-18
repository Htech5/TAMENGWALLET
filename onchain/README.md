# onchain/ — Agent wallet and transfers

**Owner:** Farrel Adhi Pratama · **Epic:** TMG-2 Mandates & Transfers

Base Sepolia testnet, USDC. Holds the agent wallet, executes mandates and one-off transfers, and records every tx hash.

## Tickets

| Ticket | Task |
|---|---|
| TMG-12 | Set up testnet agent wallet, USDC faucet and backend secrets |
| TMG-13 | FR-07 Create mandate (multiple recipients, schedule, minimum balance) |
| TMG-14 | FR-08 + FR-11 Scheduler executes due mandates (with demo interval) |
| TMG-15 | FR-09 Postpone mandate run when balance is below minimum |
| TMG-16 | FR-10 Mandates editable only by the owner in the app |
| TMG-17 | FR-12 + FR-14 One-off transfer with tx hash and explorer link |
| TMG-18 | NFR-06 Retry once + idempotency key per mandate run |
| TMG-27 | FR-23 Savings wallet with target and progress |
| TMG-19 | Collect 10+ tx hashes into `docs/EXECUTION_EVIDENCE.md` |

## Rules

- Private key only in `.env` on the backend machine. Never in code, logs or chat.
- Call `checkPolicy()` right before signing. If it returns `deny`, do not sign.
