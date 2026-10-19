// Turns a chat message into a structured intent. This is the "agent" layer, but it is
// deliberately rule-based: the policy engine decides what may happen, so the parser only
// has to read the message. An LLM can replace parse() later without touching server/.
//
// TODO(TMG-49): swap in LLM tool-calling when LLM_API_KEY is set. Keep the same return shape.

import { detectInjection } from '../policy/detectInjection.ts';
import { normaliseAddress } from '../policy/lookalike.ts';

export type IntentKind = 'send' | 'mandate' | 'blocked_report' | 'help';

export interface ParsedIntent {
  kind: IntentKind;
  amount: number | null;
  address: string | null;
  nameHint: string | null;
  injection: string[];
  /** True when the address was written with look-alike characters (O for 0, l for 1). */
  addressConfusable: boolean;
  text: string;
}

// Deliberately loose: a confusably written address is still an address attempt.
const ADDRESS = /0x[0-9a-zA-Z]{4,40}/;
const SEND = /\b(send|kirim|transfer|pay|bayar|move|pindah)\b/i;
const MANDATE = /\b(auto.?send|every month|monthly|tiap bulan|setiap bulan|mandate|rutin)\b/i;
const BLOCKED = /\b(what did you block|blocked|diblokir|serangan|attack)\b/i;

// Softer than policy/detectInjection: catches wallet-specific drains phrased politely.
const WALLET_ABUSE = /\b(all (my |the )?(funds|money|balance)|semua (uang|saldo)|everything i have)\b/i;

export function parseIntent(message: string): ParsedIntent {
  const text = message.trim();
  const lower = text.toLowerCase();
  const rawAddress = text.match(ADDRESS)?.[0] ?? null;
  const normalised = rawAddress ? normaliseAddress(rawAddress) : undefined;
  const address = normalised?.address ?? rawAddress;
  const addressConfusable = normalised?.confusable ?? false;

  const amountMatch = lower
    .replace(/0x[0-9a-f]+/gi, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .match(/(\d+(?:\.\d{1,6})?)/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1]) : null;

  const injection = detectInjection(text).matches;
  if (WALLET_ABUSE.test(lower) && SEND.test(lower)) injection.push('drain attempt');

  const nameHint = lower.match(/(?:to|ke|for|buat|kepada)\s+([a-z][a-z'’-]*)/)?.[1] ?? null;

  let kind: IntentKind = 'help';
  if (BLOCKED.test(lower) && !SEND.test(lower)) kind = 'blocked_report';
  else if (MANDATE.test(lower) && injection.length === 0) kind = 'mandate';
  else if (SEND.test(lower) || amount !== null || address || injection.length > 0) kind = 'send';

  return { kind, amount, address, nameHint, injection, addressConfusable, text };
}
