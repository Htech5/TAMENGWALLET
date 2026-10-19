# Tameng

> A mobile AI wallet agent that sends cross-border remittances for Indonesian migrant workers autonomously, within a mandate the owner sets, and cannot be steered outside it by scammers or prompt injection.

**2026 Shenzhen International FinTech Competition (FinTechathon) — International Track, Topic F: Agent Wallet**
Universitas Diponegoro, Indonesia

---

## Core idea

The LLM decides **what** the owner wants. Code decides **whether it is allowed**.

```
Owner ──▶ Mobile app ──▶ Backend agent (LLM + tools) ──▶ Policy engine ──▶ Agent wallet ──▶ Base Sepolia (USDC)
                                                            │
                                                            └──▶ deny / ask the owner to confirm
```

| Guard | What it does |
|---|---|
| **Mandate** | Owner-set schedule, split recipients, minimum balance and savings allocation. Runs autonomously. |
| **Intent lock** | The decoded transaction must match what the owner asked for, or it is denied. |
| **Provenance** | Text is labelled `USER` or `EXTERNAL`. External text can never trigger a transfer. |
| **Fixed permissions** | Permissions never change through chat or through assets the wallet receives. |
| **`checkPolicy()`** | Last gate before signing: limits, allowlist, chain, action, emergency pause. |

## Team and ownership

| Role | Member | Folder | Jira epic |
|---|---|---|---|
| Agent | Faras Ataqi | [`agent/`](agent/) | TMG-1 Chat & Agent |
| On-chain | Farrel Adhi Pratama | [`onchain/`](onchain/) | TMG-2 Mandates & Transfers |
| Security (backend & testing) | Habib Mukhlis Triatmojo | [`policy/`](policy/), [`server/`](server/) | TMG-3 Security & Policy |
| UI/UX + mobile frontend | Muhammad Faris Revansyah (lead) | [`app/`](app/) | TMG-5 Mobile App UI, TMG-4 Savings & Value |
| Docs & pitch | Hizkia Yosefha Wetrawatri Sanjaya | [`docs/`](docs/) | TMG-6 Docs & Submission |

Project board: **tameng.atlassian.net**, project `TMG`. Each folder's README lists its tickets. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and commit rules that link work to Jira.

## Key dates (WIB, UTC+7)

| When | What |
|---|---|
| 19 Oct, 12:00 | Feature freeze |
| 20 Oct, 12:00 | Team target: submission email sent (TMG-45) |
| 20 Oct, 22:59 | Official deadline (23:59 Beijing time) |

## Repository layout

```
app/       Expo / React Native mobile app (Home, Chat, Mandates, Activity, Contacts, Settings)
server/    HTTP API, scheduler, storage — wires agent + policy + onchain together
agent/     LLM setup, tools, system prompt, dialogue
onchain/   Agent wallet, USDC transfers, mandates execution, tx-hash logging
policy/    checkPolicy(), detectInjection(), provenance, intent lock, tests
docs/      Technical doc, security report, execution evidence, deck, video
```

## Getting started

```bash
# Requirements: Node.js >= 22.18 (runs TypeScript tests without a build step)
node --version

# Secrets go in .env (never committed)
cp .env.example .env

# Run the test suite
npm test
```

## Stack

- **Mobile:** Expo / React Native, TypeScript. Android APK + Expo Go link; fallback `expo start --web`.
- **Backend:** Node.js ≥ 22.18, TypeScript. Agent, policy, scheduler and wallet. JSON/SQLite storage.
- **LLM:** tool calling; API keys live on the backend only.
- **Network:** Base Sepolia testnet, USDC.

## Docs for the team

- [`PRD.md`](PRD.md) — scope, roles, security pipeline, acceptance criteria
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — app ↔ server contract
- [`app/mocks/`](app/mocks/) — example responses for every endpoint

## Security rules for the team

1. `.env` and private keys are **never** committed. Check `git status` before every push.
2. **Testnet only.** `checkPolicy()` denies any other chain.
3. Safety limits live in `policy/`, not in the system prompt.
4. Every successful transaction hash goes into [`docs/EXECUTION_EVIDENCE.md`](docs/EXECUTION_EVIDENCE.md).
