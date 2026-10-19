// Turns a chat message into a structured intent.
//
// There are two readers behind the same function: an LLM tool call when LLM_API_KEY is set,
// and the original rule parser as a fallback when no model is configured or the call fails.
// Both return the same ParsedIntent, so server/ never changes.
//
// The model only extracts what the owner asked for. It never decides whether the request is
// allowed: limits, allowlist, confirmation thresholds, provenance and injection handling live
// in policy/ and are applied by server/core.ts before anything is signed. Keeping those rules
// out of the prompt means there is one source of truth, not two.
//
// parseIntent stays synchronous because server/core.ts calls it from synchronous handlers.
// The LLM round trip therefore runs in a short-lived child process (spawnSync). That costs a
// process start per LLM turn, but keeps the exported shape and the whole server untouched.
//
// Environment:
//   LLM_API_KEY    enables the model (OPENAI_API_KEY is accepted as an alias)
//   LLM_MODEL      default gpt-4o-mini
//   LLM_BASE_URL   default https://api.openai.com/v1 (any OpenAI-compatible gateway)
//   LLM_TIMEOUT_MS default 8000
//   LLM_DISABLED=1 always use the rule reader

import { spawnSync } from 'node:child_process';

import { detectInjection, detectInjectionInToolOutput } from '../policy/detectInjection.ts';
import { normaliseAddress } from '../policy/lookalike.ts';
import { checkProvenance } from '../policy/provenance.ts';

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
const MANDATE = /\b(auto.?send|every month|monthly|tiap bulan|setiap bulan|mandate|rutin)\b/i;
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
    timeoutMs: Number.isFinite(timeout) && timeout >= 1000 ? timeout : 8000,
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

// The child only performs the HTTP round trip. The API key travels on stdin, not on the
// command line, so it cannot be read out of the process list.
const LLM_TRANSPORT = `
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let out;
try {
  const req = JSON.parse(raw);
  const res = await fetch(req.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + req.apiKey },
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(req.timeoutMs),
  });
  out = { status: res.status, body: await res.text() };
} catch (err) {
  out = { status: 0, error: err && err.message ? err.message : String(err) };
}
process.stdout.write(JSON.stringify(out));
`;

let llmFailures = 0;
let llmRetryAt = 0;
let llmWarned = false;

function noteLlmFailure(err: unknown): void {
  llmFailures += 1;
  if (!llmWarned) {
    llmWarned = true;
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[agent] LLM intent parser unavailable (' + reason + '). Using the rule parser.');
  }
  // A dead endpoint must not add a timeout to all 54 benchmark cases.
  if (llmFailures >= 3) {
    llmRetryAt = Date.now() + 60_000;
    llmFailures = 0;
  }
}

function noteLlmSuccess(): void {
  llmFailures = 0;
  llmRetryAt = 0;
  llmWarned = false;
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

function requestToolCall(
  config: LlmConfig,
  body: unknown,
): { name: string; args: Record<string, unknown> } | null {
  const payload = { url: config.url, apiKey: config.apiKey, timeoutMs: config.timeoutMs, body };
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', LLM_TRANSPORT], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: config.timeoutMs + 2500,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });

  if (child.error) throw child.error;
  if (child.status !== 0) {
    const stderr = (child.stderr || '').trim().slice(0, 300);
    throw new Error('LLM transport exited with ' + child.status + (stderr ? ': ' + stderr : ''));
  }

  const envelope = JSON.parse(child.stdout || '{}') as { status?: number; body?: string; error?: string };
  if (envelope.error) throw new Error(envelope.error);
  if (!envelope.status || envelope.status < 200 || envelope.status >= 300) {
    throw new Error('LLM HTTP ' + envelope.status + ': ' + (envelope.body || '').slice(0, 300));
  }

  const parsed = JSON.parse(envelope.body || '{}') as {
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

function parseWithLlm(text: string): DraftIntent | null {
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

  const call = requestToolCall(config, body);
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

function parseWithRules(text: string, injection: string[]): DraftIntent {
  const lower = text.toLowerCase();
  const rawAddress = text.match(ADDRESS_TOKEN)?.[0] ?? null;

  // Remove the whole address first: its digits are not an amount.
  const amountMatch = text
    .replace(ADDRESS_TOKEN, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .match(/(\d+(?:\.\d{1,6})?)/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1]) : null;

  const nameHint = lower.match(/(?:to|ke|for|buat|kepada)\s+([a-z][a-z'’-]*)/)?.[1] ?? null;

  let kind: IntentKind = 'help';
  if (BLOCKED.test(lower) && !SEND_VERB.test(lower)) kind = 'blocked_report';
  else if (MANDATE.test(lower) && injection.length === 0) kind = 'mandate';
  else if (SEND_VERB.test(lower) || amount !== null || rawAddress || injection.length > 0) kind = 'send';

  return { kind, amount, address: rawAddress, nameHint };
}

// --- Entry point --------------------------------------------------------------

export function parseIntent(message: string): ParsedIntent {
  const text = (message ?? '').trim();
  const injection = detectInjection(text).matches;

  if (text && Date.now() >= llmRetryAt && llmConfig()) {
    try {
      const parsed = parseWithLlm(text);
      if (parsed) {
        noteLlmSuccess();
        return finalise(text, parsed, injection);
      }
      noteLlmFailure(new Error('the model returned no usable tool call'));
    } catch (err) {
      noteLlmFailure(err);
    }
  }

  return finalise(text, parseWithRules(text, injection), injection);
}

/**
 * Second line for anything a tool returns to the agent. Tool output is EXTERNAL text: it can
 * inform a reply, never order a transfer. When such text goes back through POST /chat it must
 * carry "source": "external"; this helper covers results the agent handles itself.
 */
export function scanToolOutput(output: string): string[] {
  return detectInjectionInToolOutput(output).matches;
}
