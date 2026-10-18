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
