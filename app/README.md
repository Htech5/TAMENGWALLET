# app/ — Mobile app (Expo / React Native)

**Owner:** Muhammad Faris Revansyah · **Epics:** TMG-5 Mobile App UI, TMG-4 Savings & Value

## Screens

Home · Chat (decision cards Allow / Confirm / Deny) · Mandates · Activity · Contacts · Settings (changes behind PIN / biometrics)

## Tickets

| Ticket | Task | Due |
|---|---|---|
| TMG-30 | Expo scaffold + navigation (6 screens) + API client | 18 Oct |
| TMG-31 | Chat screen + decision cards (FR-13) | |
| TMG-32 | Home screen (balance, savings, total saved, next run, pause) | |
| TMG-33 | Mandates screen (list, create, split recipients, pause, demo interval) | |
| TMG-34 | Activity screen (tx hashes + blocked attempts) | |
| TMG-35 | Contacts + Settings behind PIN / biometrics (FR-05, NFR-03) | |
| TMG-36 | In-app notifications (FR-27) | |
| TMG-28 | Savings counter vs 5.57% World Bank benchmark (FR-24) | |
| TMG-37 | Build APK + Expo Go link, fallback web build (NFR-12) | |

## Rules

- No API keys or private keys in this folder. Everything goes through the backend API.
- The backend URL comes from config (`EXPO_PUBLIC_API_URL`), not hard-coded.
