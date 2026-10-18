# policy/ — Security and policy engine

**Owner:** Habib Mukhlis Triatmojo · **Epic:** TMG-3 Security & Policy

Plain TypeScript, framework-independent, unit-tested. Run `npm test` from the repo root.

## What exists

- `checkPolicy()` — allow / confirm / deny from per-tx limit, daily limit, confirm threshold, allowlist, chain, action and pause state.
- `detectInjection()` — heuristic prompt-injection detector.
- `policy.test.ts` — 13 passing tests.

## Tickets

| Ticket | Task |
|---|---|
| TMG-20 | FR-15 Provenance guard (USER / EXTERNAL labels) |
| TMG-21 | FR-16 `decodeTx` + `intentCheck` |
| TMG-22 | FR-17 Look-alike address detection |
| TMG-23 | FR-18 Extend `detectInjection` (base64, Morse, tool outputs) |
| TMG-24 | FR-19 + FR-20 + FR-21 Wire `checkPolicy`, fixed permissions, emergency pause |
| TMG-25 | FR-22 Audit log of every policy decision |
| TMG-26 | FR-28 Attack benchmark (50+ attacks) |
