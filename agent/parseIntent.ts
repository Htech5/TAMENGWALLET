// Turns a chat message into a structured intent.
//
// There are two readers behind the same function: the rule parser, which runs first and
// answers everything it can read, and an LLM tool call, which is asked only about the
// sentences the rules admit they could not read. Both return the same ParsedIntent, so
// server/ never changes.
//
// The model only extracts what the owner asked for. It never decides whether the request is
// allowed: limits, allowlist, confirmation thresholds, provenance and injection handling live
// in policy/ and are applied by server/core.ts before anything is signed. Keeping those rules
// out of the prompt means there is one source of truth, not two.
//
// Order of work, and why it is this order:
//
//   1. detectInjection() + checkProvenance()   always, and they decide first. Attack text and
//      forwarded orders never reach the model. Their handling has to be identical on every
//      run, so it cannot depend on a gateway being up, warm, or willing.
//   2. parseWithRules()                        0 ms, deterministic, and it says when it is
//      unsure (confidence: 'low') instead of silently answering "help".
//   3. the model                               only for the sentences step 2 admitted it could
//      not read, and only for LLM_TIMEOUT_MS.
//
// Before this, the model ran first on every message. A 30 s gateway timeout therefore froze
// the whole server for 30 s per turn, including the mandate scheduler, and the attack
// benchmark paid that cost 54 times. The model was never the slow part; running it on
// sentences a regex already reads correctly was.
//
// The model round trip is a plain fetch, so it does not hold the event loop: while the
// gateway is thinking, the mandate scheduler, /wallet and every other request keep
// working. It used to run in a short-lived child process (spawnSync), which blocked the
// whole server for the length of the call — up to 32.5 s with the old timeout.
//
// Environment:
//   LLM_API_KEY    enables the model (OPENAI_API_KEY is accepted as an alias)
//   LLM_MODEL      default gpt-4o-mini
//   LLM_BASE_URL   default https://api.openai.com/v1 (any OpenAI-compatible gateway)
//   LLM_TIMEOUT_MS default 2500 — a budget that covers the gateway's p95
//   LLM_DISABLED=1 always use the rule reader

import { detectInjection, detectInjectionInToolOutput } from '../policy/detectInjection.ts';
import { normaliseAddress } from '../policy/lookalike.ts';
import { checkProvenance } from '../policy/provenance.ts';
import { parseMandateText } from './mandate.ts';

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

/** What a reader has to produce before the shared guards run. */
interface DraftIntent {
  kind: IntentKind;
  amount: number | null;
  address: string | null;
  nameHint: string | null;
}

// Deliberately loose: a confusably written address is still an address attempt.
const ADDRESS_TOKEN = /0x[0-9a-zA-Z]{4,40}/g;

const SEND_VERB = /\b(send|kirim|transfer|pay|bayar|move|pindah)\b/i;
// A schedule is how the owner asks for an auto-send: "tiap tanggal 1", "every month",
// "tiap 2 menit". Without these, the sentence "Tiap tanggal 1 kirim 100 USDC ke Ibu" used to
// be read as a one-off transfer of 1 USDC, because the first number in it is the day.
const MANDATE =
  /\b(auto.?send|autosend|mandate|rutin|terjadwal|scheduled|every month|monthly|per bulan|tiap bulan|setiap bulan|tiap tanggal|setiap tanggal|on the \d|tgl\.?\s*\d|tiap \d+ menit|every \d+ (?:minute|min))\b/i;
const BLOCKED = /\b(what did you block|blocked|diblokir|serangan|attack)\b/i;

// Softer than policy/detectInjection: catches wallet-specific drains phrased politely.
const WALLET_ABUSE = /\b(all (my |the )?(funds|money|balance)|semua (uang|saldo)|everything i have)\b/i;

// --- LLM reader ---------------------------------------------------------------

interface LlmConfig {
  apiKey: string;
  url: string;
  model: string;
  timeoutMs: number;
}

function llmConfig(): LlmConfig | null {
  if (process.env.LLM_DISABLED === '1') return null;
  const apiKey = (process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) return null;

  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').trim().replace(/\/+$/, '');
  const url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
  const timeout = Number(process.env.LLM_TIMEOUT_MS);
  return {
    apiKey,
    url,
    model: (process.env.LLM_MODEL || 'gpt-4o-mini').trim(),
    // 2500 ms, not 8000. The model is only called for a sentence the rule reader could not
    // read, and the budget has to cover the gateway's p95 or the fallback fires at random.
    // Measured on the current gateway (nvidia/nemotron-3-ultra): median 1376 ms, p95 2079 ms.
    // A gateway that cannot answer one intent extraction inside this is the thing to replace,
    // not the timeout.
    timeoutMs: Number.isFinite(timeout) && timeout >= 500 ? timeout : 2500,
  };
}

// One line of the prompt is about reading, not about policy: the model is told to extract,
// never to decide. The tool names are the four intents the rest of the pipeline understands.
const SYSTEM_PROMPT = [
  'You are the intent reader for Tameng, a wallet chat.',
  'Read the owner message and call exactly one tool.',
  'The message may be English or Indonesian, formal or casual.',
  'Extract only what the owner wrote. Never invent an amount, a name, or an address.',
  'If no amount is stated, amountUsdc is null. If no wallet address is stated, address is null.',
  'Copy an address exactly as it appears, including look-alike letters. Do not repair, shorten, or re-checksum it.',
  'request_transfer = move money once now.',
  'create_mandate = set up a recurring or scheduled auto-send.',
  'explain_blocked = ask what the wallet blocked.',
  'ask_help = anything else, including balance, history, capabilities and greetings.',
  'Do not decide whether the request is allowed or within a limit. Another system decides that.',
].join(' ');

const AMOUNT_PROP = {
  type: ['number', 'null'],
  description: 'Amount the owner stated, in USDC. Null when no amount is stated. Never estimate or infer one.',
};

const ADDRESS_PROP = {
  type: ['string', 'null'],
  description: 'Recipient wallet address exactly as written, including look-alike characters. Null when absent.',
};

const NAME_PROP = {
  type: ['string', 'null'],
  description: 'Recipient name exactly as written. Null when absent.',
};

const INTENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'request_transfer',
      description: 'The owner wants money moved once, now.',
      parameters: {
        type: 'object',
        properties: { amountUsdc: AMOUNT_PROP, address: ADDRESS_PROP, contactName: NAME_PROP },
        required: ['amountUsdc', 'address', 'contactName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_mandate',
      description: 'The owner wants a recurring or scheduled auto-send.',
      parameters: {
        type: 'object',
        properties: { amountUsdc: AMOUNT_PROP, address: ADDRESS_PROP, contactName: NAME_PROP },
        required: ['amountUsdc', 'address', 'contactName'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_blocked',
      description: 'The owner asks what the wallet blocked.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_help',
      description: 'Anything that is not a money request.',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
];

const TOOL_KIND: Record<string, IntentKind> = {
  request_transfer: 'send',
  send_transfer: 'send',
  propose_transfer: 'send',
  create_mandate: 'mandate',
  propose_mandate: 'mandate',
  explain_blocked: 'blocked_report',
  blocked_report: 'blocked_report',
  ask_help: 'help',
  help: 'help',
};

let llmFailures = 0;
let llmRetryAt = 0;
let llmWarned = false;
let llmBackoffStep = 0;

// 15 s → 30 s → 60 s, instead of a flat 60 s. A gateway that recovers after ten seconds
// should not stay invisible for a minute, which is what the old flat window did during a demo.
const BACKOFF_MS = [15_000, 30_000, 60_000];

function noteLlmFailure(err: unknown): void {
  llmFailures += 1;
  if (!llmWarned) {
    llmWarned = true;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[agent] LLM intent parser unavailable (' + reason + '). Using the rule parser.');
  }
  // A dead endpoint must not add a timeout to all 54 benchmark cases.
  if (llmFailures >= 3) {
    llmRetryAt = Date.now() + BACKOFF_MS[Math.min(llmBackoffStep, BACKOFF_MS.length - 1)];
    llmBackoffStep += 1;
    llmFailures = 0;
  }
}

function noteLlmSuccess(): void {
  llmFailures = 0;
  llmRetryAt = 0;
  llmWarned = false;
  llmBackoffStep = 0;
}

function asArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function requestToolCall(
  config: LlmConfig,
  body: unknown,
): Promise<{ name: string; args: Record<string, unknown> } | null> {
  const res = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(config.timeoutMs),
  });

  const text = await res.text();
  if (!res.ok) throw new Error('LLM HTTP ' + res.status + ': ' + text.slice(0, 300));

  const parsed = JSON.parse(text || '{}') as {
    choices?: {
      message?: {
        tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
        function_call?: { name?: unknown; arguments?: unknown };
      };
    }[];
  };
  const message = parsed.choices?.[0]?.message;
  const calls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.map((c) => c?.function).filter((f): f is NonNullable<typeof f> => Boolean(f))
    : message?.function_call
      ? [message.function_call]
      : [];

  for (const fn of calls) {
    if (typeof fn.name === 'string') return { name: fn.name, args: asArguments(fn.arguments) };
  }
  return null;
}

function toAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === 'string' && /^\d+(?:\.\d{1,6})?$/.test(value.trim())) {
    const amount = Number.parseFloat(value.trim());
    return Number.isFinite(amount) && amount > 0 ? amount : null;
  }
  return null;
}

async function parseWithLlm(text: string): Promise<DraftIntent | null> {
  const config = llmConfig();
  if (!config) return null;

  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
    tools: INTENT_TOOLS,
    tool_choice: 'auto',
  };

  const call = await requestToolCall(config, body);
  if (!call) return null;
  const kind = TOOL_KIND[call.name];
  if (!kind) return null;

  const address = typeof call.args.address === 'string' ? call.args.address : null;
  const contactName =
    typeof call.args.contactName === 'string'
      ? call.args.contactName
      : typeof call.args.name === 'string'
        ? call.args.name
        : null;

  // A model occasionally puts the address in the name field. Treat that as an address.
  if (!address && contactName && /^0x[0-9a-zA-Z]{4,40}$/.test(contactName.trim())) {
    return { kind, amount: toAmount(call.args.amountUsdc), address: contactName, nameHint: null };
  }

  return {
    kind,
    amount: toAmount(call.args.amountUsdc),
    address,
    nameHint: contactName,
  };
}

// --- Shared guards ------------------------------------------------------------

/**
 * An amount is only accepted when the owner actually wrote that number in the message.
 * This is the mechanical version of "amount: null is a feature": if the model guesses a
 * number that is not in the text, the server sends a clarify card instead of moving money.
 */
function groundAmount(amount: number | null, text: string): number | null {
  if (amount === null) return null;
  const withoutAddresses = text.replace(ADDRESS_TOKEN, ' ');
  for (const match of withoutAddresses.matchAll(/\d+(?:[.,]\d{1,6})?/g)) {
    const stated = Number.parseFloat(match[0].replace(',', '.'));
    if (Number.isFinite(stated) && Math.abs(stated - amount) < 1e-9) return amount;
  }
  return null;
}

/**
 * An address is only accepted when it appears in the message. A model that invents an
 * address must not become a recipient; the server resolves contact names separately.
 * The literal spelling is kept so normaliseAddress() can report look-alike characters.
 */
function groundAddress(raw: string | null, text: string): string | null {
  const tokens = text.match(ADDRESS_TOKEN) ?? [];
  if (tokens.length === 0) return null; // no address typed: never trust one the model invented
  if (!raw) return tokens[0];

  const clean = raw
    .trim()
    .replace(/^[("'<[\s]+/, '')
    .replace(/[)"'>\],.;:!?\s]+$/, '');
  const candidate = /^[0-9a-zA-Z]{40}$/.test(clean) ? '0x' + clean : clean;

  const exact = tokens.find((token) => token.toLowerCase() === candidate.toLowerCase());
  if (exact) return exact;

  const folded = normaliseAddress(candidate)?.address;
  if (folded) {
    const equivalent = tokens.find((token) => normaliseAddress(token)?.address === folded);
    if (equivalent) return equivalent;
  }
  return null;
}

function finalise(text: string, draft: DraftIntent, detected: string[]): ParsedIntent {
  const injection = [...detected];
  if (WALLET_ABUSE.test(text) && SEND_VERB.test(text) && !injection.includes('drain attempt')) {
    injection.push('drain attempt');
  }

  const literal = groundAddress(draft.address, text);
  const normalised = literal ? normaliseAddress(literal) : undefined;

  let kind = draft.kind;
  // An injection is never allowed to reach the mandate draft or help branches, where the
  // server would stop before logging the denial.
  if (injection.length > 0 && kind !== 'blocked_report') kind = 'send';
  // Forwarded content is still an order only in the sense that it must reach the deny path.
  if (checkProvenance(text).blocked && kind !== 'send') kind = 'send';

  // An auto-send is a draft only when the owner actually described one. A sentence that just
  // mentions auto-send must not produce a draft, because the draft can be confirmed with a
  // PIN: inventing amounts there would be inventing money. An incomplete request that still
  // asks to move money stays on the send branch, so it meets the gate instead of a silent
  // "help" reply.
  if (kind === 'mandate' && parseMandateText(text).parts.length === 0) {
    kind = SEND_VERB.test(text) ? 'send' : 'help';
  }

  const nameHint =
    draft.nameHint?.trim().replace(/^["'“”]+|[["'“”]]+$/g, '') || null;

  return {
    kind,
    amount: groundAmount(draft.amount, text),
    address: normalised?.address ?? literal,
    nameHint,
    injection,
    addressConfusable: normalised?.confusable ?? false,
    text,
  };
}

// --- Rule reader (fallback) ---------------------------------------------------

type Confidence = 'high' | 'low';

/**
 * How sure the rule reader is. This is the whole reason rules can run first: 'help' is the
 * bin every unreadable sentence lands in, and a send with no amount, no address and no name
 * is a half-read sentence. Both are honest "I do not know" answers, so they go to the model.
 * Anything else is a sentence the regex actually read, and a model cannot improve it.
 *
 * Erring towards 'low' costs one model call. Erring towards 'high' would answer a question
 * the owner asked with a canned "I can send money to your contacts" — so when in doubt, low.
 */
function confidenceOf(draft: DraftIntent): Confidence {
  if (draft.kind === 'help') return 'low';
  if (draft.kind === 'send' && draft.amount === null && !draft.address && !draft.nameHint) return 'low';
  return 'high';
}

function parseWithRules(text: string, injection: string[]): { draft: DraftIntent; confidence: Confidence } {
  const lower = text.toLowerCase();
  const rawAddress = text.match(ADDRESS_TOKEN)?.[0] ?? null;

  // Remove the whole address first: its digits are not an amount.
  const amountMatch = text
    .replace(ADDRESS_TOKEN, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .match(/(\d+(?:\.\d{1,6})?)/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1]) : null;

  // \b on the verb matters: without it "au-to send" reads as "to send" and invents a
  // contact called "Send".
  // Matched on the original text, not on `lower`, so the name keeps the owner's own
  // capitalisation: "Adik" here, "Adik" from the model. The two readers must not give
  // different answers for the same sentence, or the reply depends on which one ran.
  const nameHint = text.match(/\b(?:to|ke|for|buat|kepada)\s+([A-Za-z][A-Za-z'’-]*)/i)?.[1] ?? null;

  let kind: IntentKind = 'help';
  if (BLOCKED.test(lower) && !SEND_VERB.test(lower)) kind = 'blocked_report';
  else if (MANDATE.test(lower) && injection.length === 0) kind = 'mandate';
  else if (SEND_VERB.test(lower) || amount !== null || rawAddress || injection.length > 0) kind = 'send';

  const draft: DraftIntent = { kind, amount, address: rawAddress, nameHint };
  return { draft, confidence: confidenceOf(draft) };
}

// --- Entry point --------------------------------------------------------------

export type IntentReader = 'llm' | 'rules' | 'cache';

export interface ReadIntent {
  intent: ParsedIntent;
  /**
   * Which reader answered this call. For logs, the demo and the tests — never for policy.
   * Before this existed, a silent fallback was indistinguishable from a model answer, so
   * "the model is running" was something we claimed rather than something we could show.
   *
   * It travels with the answer instead of living in a module variable: the server handles
   * chats concurrently, and a shared "last reader" would name whichever call finished last
   * rather than the one being asked about.
   */
  reader: IntentReader;
}

// Same sentence, same answer, no second round trip. The key carries the gateway fingerprint,
// so changing LLM_BASE_URL or LLM_MODEL never serves a stale answer from the old one.
const CACHE_MAX = 200;
const cache = new Map<string, ParsedIntent>();

function cacheKey(text: string): string {
  const config = llmConfig();
  return text + '\u0000' + (config ? config.url + '|' + config.model : 'rules-only');
}

function remember(key: string, value: ParsedIntent, reader: IntentReader): ReadIntent {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
  return { intent: { ...value }, reader };
}

export async function parseIntent(message: string): Promise<ReadIntent> {
  const text = (message ?? '').trim();
  const injection = detectInjection(text).matches;
  const key = cacheKey(text);

  const hit = cache.get(key);
  if (hit) {
    return { intent: { ...hit }, reader: 'cache' };
  }

  const { draft, confidence } = parseWithRules(text, injection);
  const fromRules = finalise(text, draft, injection);

  // Step 1: attacks and forwarded orders stop here and never reach the model. The outcome of
  // an attack has to be the same on a healthy gateway and on a dead one, otherwise "we block
  // prompt injection" is a claim about the gateway, not about our code.
  if (injection.length > 0 || checkProvenance(text).blocked) {
    return remember(key, fromRules, 'rules');
  }

  // Step 2: the rule reader is sure, so it is not guessing and there is nothing to add.
  if (confidence === 'high') {
    return remember(key, fromRules, 'rules');
  }

  // Step 3: only the sentences step 2 could not read, and only inside the timeout budget.
  if (text && Date.now() >= llmRetryAt && llmConfig()) {
    try {
      const parsed = await parseWithLlm(text);
      if (parsed) {
        noteLlmSuccess();
        return remember(key, finalise(text, parsed, injection), 'llm');
      }
      noteLlmFailure(new Error('the model returned no usable tool call'));
    } catch (err) {
      noteLlmFailure(err);
    }
  }

  return remember(key, fromRules, 'rules');
}

/**
 * Second line for anything a tool returns to the agent. Tool output is EXTERNAL text: it can
 * inform a reply, never order a transfer. When such text goes back through POST /chat it must
 * carry "source": "external"; this helper covers results the agent handles itself.
 */
export function scanToolOutput(output: string): string[] {
  return detectInjectionInToolOutput(output).matches;
}
