# agent/ — LLM agent

**Owner:** Faras Ataqi · **Epic:** TMG-1 Chat & Agent

Turns the owner's chat message into a structured intent and calls tools. It never signs anything itself: every transaction goes through `policy/checkPolicy()`.

## Tickets

| Ticket | Task |
|---|---|
| TMG-7 | FR-01 Natural-language chat (English + Indonesian, colloquial) |
| TMG-8 | FR-02 Intent extraction + clarifying questions |
| TMG-9 | FR-03 Balance and history tools |
| TMG-10 | FR-04 Plain-language explanation of Confirm / Deny |
| TMG-11 | FR-06 Resolve contact names to verified addresses |
| TMG-29 | FR-25 + FR-26 Balance forecast and protection report |

## Rules

- Safety limits are enforced in `policy/`, not in the system prompt.
- Text from tool outputs or received data is `EXTERNAL` and can never trigger a transfer (TMG-20).

## The intent reader (`parseIntent.ts`)

`parseIntent(message)` is the only thing `server/` imports from here. Its return shape is the
contract — `server/` never changes when the reader changes:

```ts
{ kind: 'send' | 'mandate' | 'blocked_report' | 'help',
  amount: number | null,
  address: string | null,
  nameHint: string | null,
  injection: string[],
  addressConfusable: boolean,
  text: string }
```

Two readers sit behind it, and they return the same thing:

1. **LLM tool-calling** when `LLM_API_KEY` is set. The model picks one of four tools
   (`request_transfer`, `create_mandate`, `explain_blocked`, `ask_help`) and extracts the
   amount, the address and the recipient name. Nothing else.
2. **The original rule reader** when no key is configured, when `LLM_DISABLED=1`, or when the
   call fails or times out. The server therefore still runs with no model at all.

Three guards run after the reader, on every path, so a wrong or jailbroken model cannot turn
into a wrong transfer:

- **Amount grounding** — the amount is kept only when the owner actually wrote that number.
  Otherwise it becomes `null`, and `server/` sends a clarify card. The model may guess; the
  guess never becomes money.
- **Address grounding + `normaliseAddress()`** — an address the owner did not type is dropped.
  A confusably typed one (`0x0O47…` with the letter O for zero) is folded to hex and flagged
  with `addressConfusable: true`, so the server tells the owner whose wallet it imitates.
- **Injection and provenance** — `detectInjection()` runs on the raw text, and an injection or
  a forwarded order is forced onto the `send` branch so the server logs the denial instead of
  quietly replying.

The prompt deliberately says nothing about limits, allowlists or confirmation thresholds.
Those are decided once, in `policy/checkPolicy.ts`, and called again right before signing.
Two sources of truth is how a wallet loses money.

`parseIntent` is synchronous because `server/core.ts` calls it from synchronous handlers. The
model round trip therefore runs in a short-lived child process (`spawnSync`) with the API key
on stdin, never on the command line. Cost: one process start per LLM turn.

### Environment

| Variable | Meaning |
|---|---|
| `LLM_API_KEY` | Enables the model. `OPENAI_API_KEY` is accepted as an alias. |
| `LLM_MODEL` | Default `gpt-4o-mini`. |
| `LLM_BASE_URL` | Default `https://api.openai.com/v1`; any OpenAI-compatible gateway works. |
| `LLM_TIMEOUT_MS` | Default `8000`. Three failures in a row skip the model for 60 s. |
| `LLM_DISABLED` | `1` always uses the rule reader. |

`npm run server` loads `.env` when the file exists, so `cp .env.example .env` and filling in
`LLM_API_KEY` is enough.

### Tool output

Anything a tool returns is EXTERNAL text: it can inform a reply, never order a transfer.

- Text the agent feeds back into the conversation goes to `POST /chat` with `"source": "external"`.
- Results the agent handles itself are scanned with `scanToolOutput()`
  (`policy/detectInjectionInToolOutput`). That is a second layer, not the main one — the policy
  gate still runs before anything is signed.

## The auto-send reader (`mandate.ts`)

`parseMandateText()` / `buildMandateDraft()` read an auto-send out of one sentence:

```
Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC
  -> Every month on the 1st: 100.00 to Ibu. Keeps at least 20.00 USDC.

auto-send every month: 60 to Ibu, 20 to Adik, 20 to tabungan
  -> Every month on the 1st: 60.00 to Ibu, 20.00 to Adik, 20.00 to Savings.
```

It reads recipients and amounts (a split into several is fine), the schedule (`tanggal 15`,
`every month`, `tiap 2 menit` for the fast demo), and the buffer (`sisakan minimal`, `keep at
least`, `saldo minimum`). Names are resolved by the caller, so `server/core.ts` keeps its own
alias table and there is only one of them.

The rule is the same as for a single transfer, and it is the reason this module exists:
**never invent a number.** A draft card can be confirmed with a PIN, so a made-up amount in a
draft is made-up money. When the sentence is missing a piece, the answer is a question:

| Sentence | Result |
|---|---|
| `set up monthly auto send` | clarify — a recipient and an amount are needed |
| `tiap bulan kirim 50 USDC ke Budi` | clarify — "I don't have a contact called Budi yet" |
| `Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC` | draft: 100 to Ibu, keeps 20 |

Two bugs this closed, both found by running the demo script from the plan:

- `Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC` used to be read as a one-off
  transfer of **1 USDC** — the first number in the sentence is the day, not the amount — so the
  exact sentence the demo opens with moved money instead of drafting a mandate.
- The draft card used to be a fixed template (60/20/20, buffer 50) whatever the owner said, so
  a PIN could turn an invented split into a live auto-send.

`server/core.ts` uses it in one place, the `mandate` branch of `chat()`: the draft is built
from `intent.text`, and a missing piece becomes a clarify card. Limits, the allowlist, the
confirmation threshold and the scheduler are still core's, untouched.

`parseIntent()` also validates the branch: a message that only mentions auto-send without
describing one is not allowed to become a `mandate`, because that branch produces a
confirmable card. An incomplete request that still asks to move money falls back to `send`,
so it meets the gate instead of a silent "help" reply.

## Choosing a model

`agent/check-llm.mjs` tests whether a gateway can actually drive this reader. It sends the
same request `parseIntent()` sends and reports whether the answer comes back as a **tool
call**. A provider that only returns text is not enough: the reader would see no answer and
silently fall back to the rules.

```bash
node agent/check-llm.mjs                       # reads .env
node agent/check-llm.mjs --base https://... --model ... --key ...
```

Exit 0 means the gateway is usable, 2 means it answers but not with tool calls, 1 means the
request failed.

`agent/mock-llm.mjs` is a local stand-in that obeys the attacker on purpose, for checking that
the policy gate — not the prompt — is what stops a transfer:

```bash
node agent/mock-llm.mjs                        # terminal 1, port 8787
$env:LLM_BASE_URL='http://127.0.0.1:8787/v1'; $env:LLM_API_KEY='test'; npm run server
```

### Latency, measured

An [OI]-compatible gateway is not automatically fast enough. Measured on a hosted NVIDIA NIM
endpoint (2026-10-19): the same sentence took 3.5 s once and 46 s the next time, and the
54-case benchmark took **401 s**. Several other models on that endpoint exceeded a 60 s
timeout or answered without a tool call at all.

So: the gate is correct either way, but a slow model makes the chat feel broken and the
benchmark unusable for a live demo. If a request times out, `parseIntent` falls back to the
rule reader, which is safe but means the model was not used. For a demo, either keep
`LLM_DISABLED=1` (rules are instant and the gate is identical) or use a model that answers in
under a second. `LLM_TIMEOUT_MS` is the knob.
## Tests (`parseIntent.test.ts`, `mandate.test.ts`)

The model in `parseIntent.test.ts` is a mock OpenAI-compatible gateway running in its own process: the real
`spawnSync` transport would deadlock against an in-process server. The suite proves that a tool
call decides the branch, that an invented amount or address is dropped, that a confusable
address is folded and flagged, that an injection reaches the deny path, that a dead gateway
falls back to the rules, and that `POST /benchmark/run` still reports `movedFunds: 0` when the
model obeys the attacker.

`mandate.test.ts` runs the plan's demo sentences through the real `chat()` pipeline: the demo
sentence drafts 100 to Ibu (not a 1 USDC transfer), the split sentence keeps all three
recipients, confirming the draft creates exactly that mandate, and an underspecified or
unknown-name auto-send asks instead of inventing one.

```bash
npm test                       # whole repo
node --test agent/parseIntent.test.ts
node --test agent/mandate.test.ts
```
