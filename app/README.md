# app/ — Mobile app (Expo / React Native)

**Owner:** Muhammad Faris Revansyah · **Epics:** TMG-5 Mobile App UI, TMG-4 Savings & Value

Expo SDK 57 (runs in Expo Go), Expo Router, TypeScript, Geist font.

## Run it

```bash
cd app
npm install
cp .env.example .env        # leave EXPO_PUBLIC_API_URL empty to use sample data
npx expo start              # scan the QR with Expo Go, or press w for web
```

- **Sample data mode.** With `EXPO_PUBLIC_API_URL` empty, the app runs on an in-memory copy of `mocks/` that follows the same rules as the policy layer (limits, contacts only, injection, look-alike addresses, PIN). Demo PIN is **123456**.
- **Live mode.** Set `EXPO_PUBLIC_API_URL` to the server (for example `http://192.168.1.10:3000`) and `EXPO_PUBLIC_DEVICE_TOKEN`. Restart with `npx expo start --clear`.
- Checks: `npm run typecheck`, `npm run export:web`.

## Screens

| Route | Screen | Ticket |
|---|---|---|
| `/` | Home: balance, fee savings, protection card or new block alert, upcoming transfer with Pause, recent activity | TMG-32, TMG-28 |
| `/chat` | Ask Tam: decision cards Allow / Confirm / Deny, clarify chips, auto-send draft | TMG-31 |
| `/activity`, `/activity/[id]` | Activity with filters, transfer details with BaseScan link, Review for blocked attempts | TMG-34 |
| `/autosend` | Auto-send list, split per recipient, pause and resume with PIN | TMG-33 |
| `/contacts`, `/contacts/new` | Contacts, add and remove with PIN, look-alike warning | TMG-35 |
| `/settings` | Pause Tam (no PIN to pause, PIN to resume), limits, demo mode | TMG-35 |
| `/notifications` | In-app notifications from activity | TMG-36 |
| `/send` | Pick a contact, keypad, then hands the request to Tam so it goes through the same checks | TMG-31 |
| `/add-funds` | Sheet with wallet address, QR, and a link to the Circle USDC faucet | TMG-32 |
| `/savings-info` | Sheet explaining the fee savings against the World Bank 5.13% average | TMG-28 |
| `/profile` | Owner, wallet address, totals | |

## Structure

```
src/app/          routes (Expo Router)
src/components/   UI kit, Screen and Sheet, PIN pad, chat cards, icons, Tam mascot
src/lib/api.ts    typed client for docs/API_CONTRACT.md (auth, X-Pin, Idempotency-Key)
src/lib/mock.ts   sample data backend used when no API URL is set
src/lib/types.ts  contract types
src/theme.ts      colors and fonts from the Figma Home
mocks/            sample responses shared with server/
```

## Rules

- No API keys or private keys in this folder. Everything goes through the backend API.
- The backend URL comes from config (`EXPO_PUBLIC_API_URL`), not hard-coded.
- Every money movement goes through `POST /chat` and `POST /confirm`. The Send screen does not have its own transfer call.
- Blocked cards never show a button that forces the transfer.
