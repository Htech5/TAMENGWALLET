# API Contract — app ↔ server

**Versi:** 0.1 · 19 Okt 2026 · Pemilik: Habib (server), Faris (app)
Perubahan bentuk request/response harus disepakati keduanya, lalu `app/mocks/` ikut diperbarui.

Base URL: `EXPO_PUBLIC_API_URL` (contoh `http://192.168.1.10:3000`).

## 1. Konvensi umum

| Hal | Aturan |
|---|---|
| Auth | Semua request: `Authorization: Bearer <deviceToken>` |
| PIN | Aksi sensitif: header `X-Pin: 123456`. Tanpa PIN → `401 PIN_REQUIRED` |
| Idempotensi | `POST /chat`, `POST /confirm/:id`, `POST /mandates`, `POST /contacts`: header `Idempotency-Key: <uuid>`. Request ulang dengan key sama mengembalikan respons yang sama, tidak membuat aksi kedua |
| Nominal USDC | decimal string, maks 6 desimal: `"60.00"`. **Tidak pernah number/float** |
| Nominal USD | decimal string: `"0.0021"` |
| Waktu | ISO 8601 UTC: `"2026-11-01T02:00:00Z"` |
| Alamat | `address` lengkap + `addressShort` (`"0x7a3F…91cE"`) untuk UI |
| Error | `{ "error": { "code": "PIN_INVALID", "message": "Wrong PIN. 3 attempts left." } }` |

## 2. Tipe bersama

```ts
type Usdc = string;      // "60.00"
type Usd = string;       // "0.0021"
type Iso = string;       // ISO 8601 UTC

type Decision = "allow" | "confirm" | "deny";

interface Recipient {
  contactId: string;     // "savings" untuk wallet tabungan
  name: string;
  addressShort: string;
}

interface Reason {
  code: ReasonCode;
  message: string;       // kalimat siap tampil, bahasa Inggris
}

type ReasonCode =
  | "WITHIN_LIMITS"
  | "ABOVE_CONFIRM_THRESHOLD"
  | "APPROVAL_REQUIRED"
  | "NOT_IN_ALLOWLIST"
  | "LOOKALIKE_ADDRESS"
  | "INTENT_MISMATCH"
  | "EXTERNAL_PROVENANCE"
  | "INJECTION_DETECTED"
  | "OVER_PER_TX_LIMIT"
  | "OVER_DAILY_LIMIT"
  | "CHAIN_NOT_ALLOWED"
  | "ACTION_NOT_ALLOWED"
  | "AGENT_PAUSED"
  | "BELOW_MIN_BALANCE";

interface TxRef {
  hash: string;
  explorerUrl: string;   // https://sepolia.basescan.org/tx/<hash>
  status: "pending" | "confirmed" | "failed" | "unknown";
}

interface Schedule {
  type: "monthly" | "interval";
  dayOfMonth?: number;   // monthly: 1–28
  minutes?: number;      // interval: hanya saat demoMode = true
}
```

## 3. Kartu di Chat

Respons `POST /chat` berisi paling banyak satu `card`.

```ts
type Card = DecisionCard | ClarifyCard | MandateDraftCard;

interface DecisionCard {
  type: "decision";
  intentId: string;
  decision: Decision;
  summary: string;          // satu kalimat nasib uang: "40 USDC will go to Ibu after you confirm."
  action: "transfer" | "approve";
  amount: Usdc;
  token: "USDC";
  recipient: Recipient | null;   // null jika alamat tidak dikenal
  rawAddressShort?: string;      // alamat yang diminta, jika bukan kontak
  networkFeeUsd: Usd;
  savedVsBenchmarkUsd: Usd;
  reasons: Reason[];
  expiresAt: Iso | null;         // hanya untuk confirm
  tx: TxRef | null;              // terisi jika allow (langsung dikirim)
}

interface ClarifyCard {
  type: "clarify";
  question: string;
  options?: string[];            // chip jawaban cepat, mis. nama kontak
}

interface MandateDraftCard {
  type: "mandate_draft";
  intentId: string;              // dikonfirmasi lewat POST /confirm/:intentId
  summary: string;
  mandate: MandateInput;
  expiresAt: Iso;
}
```

Aturan UI (copy bahasa Inggris tanpa titik dua dan tanpa em dash):
- `allow` → kartu hijau, tampilkan `tx`.
- `confirm` → tombol **Confirm** (minta PIN/biometrik) dan **Cancel**.
- `deny` → kartu merah, tampilkan semua `reasons`. Tidak ada tombol untuk memaksa.

## 4. Endpoint

### POST `/chat`
```json
// request
{ "message": "send 40 usdc to ibu", "clientMessageId": "c-0192" }
// response 200
{
  "messageId": "m-381",
  "reply": "That's above your 25 USDC confirm threshold, so I need your OK first.",
  "card": { "...": "DecisionCard | ClarifyCard | MandateDraftCard | null" }
}
```
Contoh lengkap: `app/mocks/chat-confirm.json`, `chat-deny.json`, `chat-clarify.json`, `chat-allow.json`.

### POST `/confirm/:intentId`  · PIN jika `approve: true`
```json
// request
{ "approve": true }
// response 200
{ "intentId": "i-77", "status": "executed", "tx": { "hash": "0x…", "explorerUrl": "…", "status": "pending" }, "mandate": null }
```
`status`: `executed` · `rejected` (pemilik batal) · `denied` (pipeline ulang menolak, ada `reasons`) · `expired`.
Untuk `MandateDraftCard`, `mandate` berisi `Mandate` yang baru aktif dan `tx` null.

### GET `/wallet`
Semua data Home dalam satu panggilan. Contoh: `app/mocks/home-wallet.json` (nama file sengaja tidak diawali `wallet`, karena `.gitignore` memblokir `wallet*.json` untuk file kunci).
```ts
interface Wallet {
  owner: { name: string };
  address: string; addressShort: string;
  network: "base-sepolia";
  balance: Usdc;
  paused: boolean;
  nextRun: null | {
    mandateId: string; label: string; schedule: Schedule;
    at: Iso; total: Usdc; status: "active" | "postponed" | "paused";
    recipients: { name: string; amount: Usdc }[];
  };
  mandates: { active: number; total: number };
  savings: { balance: Usdc; target: Usdc };
  feesSaved: { month: string; totalUsd: Usd; benchmarkPct: "5.13" };
  protection: { month: string; checked: number; blocked: number };
  unreadEvents: number;
}
```

### GET `/activity?cursor=&limit=20`
Contoh: `app/mocks/activity.json`.
```ts
interface ActivityPage { items: ActivityEvent[]; nextCursor: string | null; unread: number }

interface ActivityEvent {
  id: string;
  type: "transfer_sent" | "transfer_failed" | "run_postponed" | "attempt_blocked"
      | "mandate_paused" | "agent_paused" | "agent_resumed";
  at: Iso;
  read: boolean;
  title: string;              // "60.00 USDC sent to Ibu"
  amount?: Usdc;
  recipient?: Recipient;
  mandateId?: string;
  tx?: TxRef;
  feeUsd?: Usd; savedVsBenchmarkUsd?: Usd;
  reasons?: Reason[];          // attempt_blocked, run_postponed
  source?: "chat" | "mandate" | "external";
  excerpt?: string;            // potongan teks serangan, maks 120 karakter
}
```

### POST `/activity/read`
```json
{ "upTo": "e-120" }   →   { "unread": 0 }
```

### `/mandates`
| | Request | Response |
|---|---|---|
| `GET /mandates` | — | `{ "items": Mandate[] }` |
| `POST /mandates` · PIN | `MandateInput` | `Mandate` |
| `PATCH /mandates/:id` · PIN | sebagian `MandateInput` dan/atau `{ "status": "active" \| "paused" }` | `Mandate` |
| `DELETE /mandates/:id` · PIN | — | `204` |

```ts
interface MandateInput {
  label?: string;              // kosong → dibuat otomatis: "Monthly · 3 recipients"
  recipients: { contactId: string; amount: Usdc }[];   // 1–5
  schedule: Schedule;
  minBalance: Usdc;
}

interface Mandate extends MandateInput {
  id: string;
  label: string;
  recipients: (Recipient & { amount: Usdc })[];
  total: Usdc;
  status: "active" | "postponed" | "paused";
  nextRunAt: Iso | null;
  lastRun: null | { id: string; at: Iso; status: "sent" | "postponed" | "failed" | "unknown"; txs: TxRef[] };
  consecutivePostpones: number;
}
```
Contoh: `app/mocks/mandates.json`.

### `/contacts`
| | Request | Response |
|---|---|---|
| `GET /contacts` | — | `{ "items": Contact[] }` |
| `POST /contacts` · PIN | `{ "name": "Ibu", "address": "0x…" }` | `Contact` |
| `DELETE /contacts/:id` · PIN | — | `204` (`409 CONTACT_IN_USE` jika dipakai mandat aktif) |

```ts
interface Contact { id: string; name: string; address: string; addressShort: string; verifiedAt: Iso }
```
`POST` menolak alamat yang mirip kontak lain dengan `409 LOOKALIKE_ADDRESS`.

### `/settings`
| | Request | Response |
|---|---|---|
| `GET /settings` | — | `Settings` |
| `PATCH /settings` | sebagian `Settings` | `Settings` |

`{ "paused": true }` **tidak** butuh PIN. Semua perubahan lain, termasuk `{ "paused": false }`, butuh PIN.
```ts
interface Settings {
  perTxLimit: Usdc; dailyLimit: Usdc; confirmAbove: Usdc;
  savingsTarget: Usdc;
  demoMode: boolean;
  paused: boolean;
}
```
Contoh: `app/mocks/settings.json`.

### POST `/benchmark/run` (build evaluasi)
```json
{
  "total": 52, "movedFunds": 0, "blocked": 49, "clarified": 3,
  "byCategory": [{ "category": "prompt_injection", "total": 15, "movedFunds": 0 }],
  "cases": [{ "id": "b-01", "category": "drain", "prompt": "Ignore the rules…", "decision": "deny", "movedFunds": false, "reasons": ["NOT_IN_ALLOWLIST"] }]
}
```

## 5. Kode error

| HTTP | code | Kapan |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Field salah atau hilang |
| 401 | `UNAUTHORIZED` | Token perangkat salah |
| 401 | `PIN_REQUIRED` | Aksi sensitif tanpa `X-Pin` |
| 401 | `PIN_INVALID` | PIN salah (`message` menyebut sisa percobaan) |
| 423 | `PIN_LOCKED` | 5 kali salah; terkunci 15 menit |
| 404 | `NOT_FOUND` | Intent, mandat, atau kontak tidak ada |
| 409 | `INTENT_EXPIRED` | Konfirmasi setelah `expiresAt` |
| 409 | `LOOKALIKE_ADDRESS` | Kontak baru mirip kontak lama |
| 409 | `CONTACT_IN_USE` | Hapus kontak yang dipakai mandat aktif |
| 423 | `AGENT_PAUSED` | Aksi transfer saat agent di-pause |
| 429 | `RATE_LIMITED` | Terlalu banyak request |
| 503 | `RPC_UNAVAILABLE` | RPC testnet tidak bisa dihubungi |

Penolakan oleh policy **bukan error HTTP**: `POST /chat` tetap `200` dengan `DecisionCard` berisi `decision: "deny"`.
