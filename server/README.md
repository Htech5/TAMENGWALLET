# server/ — Backend API

**Owner:** Habib Mukhlis Triatmojo (backend & testing)

Node.js ≥ 22.18, TypeScript, no build step and no framework: Node runs the `.ts` files directly. Exposes the API the mobile app calls and wires `agent/`, `policy/` and `onchain/` together. Storage: one JSON file under `data/` (git-ignored).

## Run

```bash
npm run server          # http://localhost:3000, binds 0.0.0.0 so the phone can reach it
npm test                # policy + server suites
```

On boot it prints the line to paste into `app/.env`:

```
[tameng] phone: EXPO_PUBLIC_API_URL=http://192.168.1.10:3000
```

The app falls back to `app/mocks/` whenever that variable is empty, so an unreachable server never blocks the UI work.

## Files

| File | Job |
|---|---|
| `index.ts` | HTTP routing, device auth, idempotency, rate limit, error shape, scheduler tick |
| `core.ts` | Every endpoint's logic. Calls `policy/checkPolicy.ts` for each decision |
| `store.ts` | `data/state.json` plus the append-only `data/audit.log` |
| `../agent/parseIntent.ts` | Chat message to a structured intent (rule-based for now) |
| `../onchain/sendUsdc.ts` | Transfer execution. Simulated until a key and RPC are set |

## Endpoints

| Method | Path | PIN | Used by |
|---|---|---|---|
| GET | `/health` | — | Deploy checks (no token needed) |
| GET | `/wallet` | — | Home |
| POST | `/chat` | — | Chat screen |
| POST | `/confirm/:intentId` | on approve | Decision card "Confirm" |
| GET | `/activity` | — | Activity |
| POST | `/activity/read` | — | Activity |
| GET POST PATCH DELETE | `/mandates` | write | Auto-send |
| GET POST DELETE | `/contacts` | write | Contacts |
| GET PATCH | `/settings` | all but `{"paused": true}` | Settings |

Request/response shapes, PIN rules and error codes: [`docs/API_CONTRACT.md`](../docs/API_CONTRACT.md). Example responses the app is built against: [`app/mocks/`](../app/mocks/). Change the contract together with Faris, then update the mocks.

## Security (NFR-03)

- Every request needs `Authorization: Bearer <DEVICE_TOKEN>`; `/health` is the only exception.
- Sensitive actions need `X-Pin`. Five wrong PINs lock the wallet for 15 minutes.
- `APP_PIN_HASH` holds a sha256 of the PIN, never the PIN:
  `node -e "console.log(require('crypto').createHash('sha256').update('123456').digest('hex'))"`
- With `APP_PIN_HASH` and `DEVICE_TOKEN` unset the server runs the demo pair (`123456` / `demo-device`). Set both before any public deployment.
- `policy/checkPolicy.ts` decides every transfer, and `core.ts` calls it again right before signing, so an approval from a minute ago cannot outrun a limit you just lowered.
- `data/audit.log` keeps one JSON line per transfer, block, PIN failure and auto-send run.

## Deploy so the phone can reach it (TMG-51)

1. **Same Wi-Fi (demo default).** `npm run server`, then paste the printed `EXPO_PUBLIC_API_URL` into `app/.env` and restart Expo. Nothing else to set up.
2. **Phone on mobile data, or a judge watching remotely.** Tunnel the local port:
   `npx cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`), then use the `https://…` URL it prints.
3. **Always-on box.** Any Node 22 host works: `git clone`, `cp .env.example .env`, fill `DEVICE_TOKEN` and `APP_PIN_HASH`, `npm run server` behind your process manager of choice. State lives in `data/`, so back up that folder and nothing else.

Health check for all three: `curl http://<host>/health` returns `{"ok":true,...}`.
