# Deployment guide

**Audience:** anyone (including the judges) who wants to run Tameng from a clean checkout.
**Ticket:** TMG-43 · **Last verified:** 2026-10-19 on Node 22.x, Linux.

Tameng has two processes: the **backend** (`server/`, holds the key, calls the chain) and the **mobile app** (`app/`, holds no key). The app runs in Expo Go, as a web build, or as an APK; the backend runs on any machine that can reach Base Sepolia.

---

## 1. Requirements

| Thing | Version | Check |
|---|---|---|
| Node.js | ≥ 22.18 (`--env-file-if-exists`, direct TypeScript) | `node --version` |
| npm | ≥ 10 | `npm --version` |
| Expo Go on a phone, or a browser | latest | `npx expo --version` (optional) |
| Git | any | `git --version` |

No build step, no database server, no Docker required.

## 2. Get the code and install

```bash
git clone https://github.com/Htech5/TAMENGWALLET.git
cd TAMENGWALLET
npm install          # backend: one dependency (viem)
(cd app && npm install)
```

## 3. Configure

```bash
cp .env.example .env
```

Edit `.env`. For a **simulated** run, leave it as is (`TAMENG_LIVE=0`): transfers return deterministic fake hashes and nothing hits the chain, so the whole flow can be demoed offline.

For a **live testnet** run you need four values:

```ini
CHAIN_ID=base-sepolia
RPC_URL=https://sepolia.base.org
AGENT_WALLET_PRIVATE_KEY=0x...        # a throwaway Base Sepolia key, funded with ETH for gas
SAVINGS_WALLET_ADDRESS=0x...          # second owner wallet (public address only)
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e   # Circle USDC, Base Sepolia
TAMENG_LIVE=1
```

Optional hardening before any public deployment:

```ini
DEVICE_TOKEN=<random string>          # default demo value is "demo-device"
APP_PIN_HASH=<sha256 of the owner PIN>  # default demo PIN is 123456
PORT=3000
```

```bash
node -e "console.log(require('crypto').createHash('sha256').update('123456').digest('hex'))"
```

`.env` is git-ignored. Never commit it, and never put any of these values in `app/`.

## 4. Run the tests and the benchmark

```bash
npm test        # 65 tests: policy 13, security 29, onchain 2, server 21
```

Expected: `pass 65`, `fail 0`. The suite runs fully offline in simulated mode.

The attack benchmark is served by the backend:

```bash
npm run server
curl -s -X POST http://localhost:3000/benchmark/run \
  -H "Authorization: Bearer demo-device" | python3 -m json.tool
```

It snapshots `data/state.json`, runs 54 deterministic cases (49 attacks + 5 benign), **forces simulated mode**, restores the snapshot, and returns the counts. The recorded run is **49/49 attacks blocked, 0 funds moved, 0 failures** — see `docs/SECURITY_REPORT.md`.

## 5. Run the backend

```bash
npm run server
```

It binds `0.0.0.0:${PORT:-3000}` and prints the URL the phone should use:

```
[tameng] phone: EXPO_PUBLIC_API_URL=http://192.168.1.10:3000
```

State lives in `data/state.json`; one JSON line per decision is appended to `data/audit.log`. Both are git-ignored. Delete `data/state.json` to reset the demo.

## 6. Run the app

```bash
cd app
echo "EXPO_PUBLIC_API_URL=http://<backend-host>:3000" > .env
npx expo start            # scan the QR with Expo Go
```

If `EXPO_PUBLIC_API_URL` is empty, the app runs against `app/mocks/` and the UI works with no backend at all.

**Web fallback (used for the submission screenshots):**

```bash
cd app
npx expo start --web      # http://localhost:8081
```

**Android APK:** `npx expo run:android` with Android SDK, or `eas build -p android` with an Expo account. A prebuilt APK or the Expo Go link is acceptable for the demo; the web build is the documented fallback.

## 7. Deploy the backend publicly

Any Node 22 host works (Render, Railway, Fly.io, a VPS). The steps:

1. Point the host at this repo, start command `npm run server`, health check `/health`.
2. Set the same variables as `.env` in the host's secret manager — `AGENT_WALLET_PRIVATE_KEY`, `RPC_URL`, `SAVINGS_WALLET_ADDRESS`, `USDC_CONTRACT_ADDRESS`, `TAMENG_LIVE=1`, plus a real `DEVICE_TOKEN` and `APP_PIN_HASH`.
3. Persist `data/` on a volume, or accept that state resets on redeploy.
4. Put TLS in front (the hosts above do this by default) and set `EXPO_PUBLIC_API_URL=https://<host>` in `app/.env`, then rebuild the app.
5. Lock CORS to the app origin if you expose the API beyond the demo.

The backend is the only process that needs the key. The app's bundle contains no secrets.

## 8. Reproduce the on-chain evidence

With a live `.env` and gas in the agent wallet:

```bash
npm run server
T='Authorization: Bearer demo-device'
P='X-Pin: 123456'
J='Content-Type: application/json'

# 0) add the recipients as contacts (owner-only, PIN)
curl -s -X POST localhost:3000/contacts -H "$T" -H "$P" -H "$J" \
  -d '{"name":"Ibu","address":"0x1111111111111111111111111111111111111111"}'
# repeat for Adik and Savings, note each returned contact id (c-...)

# 1) one-off transfer: chat -> confirm
ID=$(curl -s -X POST localhost:3000/chat -H "$T" -H "$J" \
  -d '{"message":"Send 40 USDC to Ibu"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["card"]["intentId"])')
curl -s -X POST "localhost:3000/confirm/$ID" -H "$T" -H "$P" -H "$J" \
  -d '{"approve":true}' | python3 -m json.tool

# 2) auto-send: create a mandate, wait for the scheduler tick, then read the activity
curl -s -X POST localhost:3000/mandates -H "$T" -H "$P" -H "$J" \
  -d '{"label":"Demo run","recipients":[{"contactId":"c-1","amount":"60.00"},{"contactId":"c-2","amount":"20.00"},{"contactId":"c-3","amount":"20.00"}],"schedule":{"type":"interval","minutes":2},"minBalance":"50.00"}'
curl -s localhost:3000/activity -H "$T" | python3 -m json.tool
```

Amounts are decimal strings (`"60.00"`), never floats. Interview `Schedule.minutes` is accepted only while `demoMode` is on, which is the default in a fresh demo `state.json`.

Every returned hash is a real Base Sepolia transaction: open it on `https://sepolia.basescan.org/tx/<hash>`. `docs/EXECUTION_EVIDENCE.md` records the 11 hashes from the 2026-10-19 run; regenerate this file by replacing the rows with yours (the evidence writer in `server/evidence.ts` keeps the table append-only and contiguous).

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App shows mock data | `app/.env` missing or empty | set `EXPO_PUBLIC_API_URL` and restart Expo with `-c` |
| `401` on every call | wrong `DEVICE_TOKEN` | use the value from `.env`, or the demo default `demo-device` |
| `423` on a write | five wrong PINs | wait 15 minutes, or delete `data/state.json` |
| Transfers return fake hashes | `TAMENG_LIVE=0` | set `TAMENG_LIVE=1` and provide a funded key |
| `deny` on a known contact | address not in the allowlist | add the contact first; the allowlist is owner-only |
| PDFs stale | docs edited after build | `python3 docs/build/render_pdfs.py` |
