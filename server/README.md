# server/ — Backend API

**Owner:** Habib Mukhlis Triatmojo (backend & testing)

Node.js ≥ 22.18, TypeScript. Exposes the API the mobile app calls and wires `agent/`, `policy/` and `onchain/` together. Storage: JSON or SQLite under `data/` (git-ignored).

## Endpoints

| Method | Path | Used by |
|---|---|---|
| POST | `/chat` | Chat screen |
| POST | `/confirm/:intentId` | Decision card "Confirm" |
| GET | `/wallet` | Home |
| GET | `/activity` | Activity |
| GET / POST / PATCH | `/mandates` | Mandates |
| GET / POST / DELETE | `/contacts` | Contacts |
| PATCH | `/settings` | Settings (PIN / biometrics required) |
| POST | `/benchmark/run` | Attack benchmark (TMG-26) |

Request/response shapes, PIN rules and error codes: [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md). Example responses the app is built against: [`app/mocks/`](../app/mocks/). Change the contract together with Faris, then update the mocks. Product scope and security pipeline: [`PRD.md`](../PRD.md).
