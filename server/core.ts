// Business logic for every endpoint in docs/API_CONTRACT.md.
//
// Rule of the house: the policy engine in policy/ decides whether money may move. This file
// never re-implements a limit; it calls checkPolicy() and turns its verdict into the reason
// codes and the copy the app shows. Transfers call the gate a second time right before
// signing, so a stale confirmation can never slip past a limit that changed in between.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseIntent } from '../agent/parseIntent.ts';
import { checkPolicy } from '../policy/checkPolicy.ts';
import { intentCheck } from '../policy/intentCheck.ts';
import { checkLimits, clampConfig } from '../policy/permissions.ts';
import { findLookalike, type KnownAddress } from '../policy/lookalike.ts';
import { checkProvenance, type Provenance } from '../policy/provenance.ts';
import type { PolicyConfig, PolicyResult, TxIntent } from '../policy/types.ts';
import { decodeTx } from '../onchain/decodeTx.ts';
import * as chain from '../onchain/sendUsdc.ts';
import type {
  ActivityEvent,
  ActivityPage,
  ChatResponse,
  ConfirmResponse,
  Contact,
  DecisionCard,
  ErrorCode,
  Mandate,
  MandateDraftCard,
  MandateInput,
  MandateStatus,
  Reason,
  Recipient,
  Settings,
  TxRef,
  Wallet,
} from '../app/src/lib/types.ts';
import { appendEvidence } from './evidence.ts';
import { audit, nextId, save, state } from './store.ts';
import type { MandateRun } from './store.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAFT_TEMPLATE = JSON.parse(readFileSync(join(ROOT, 'app', 'mocks', 'chat-mandate-draft.json'), 'utf8'));

const DEMO_PIN = '123456';
const PIN_HASH = process.env.APP_PIN_HASH || sha256(DEMO_PIN);
const MAX_PIN_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const INTENT_TTL_MS = 10 * 60 * 1000;
const NETWORK_FEE_USD = '0.0021';
const BENCHMARK_PCT = 0.0513; // what a remittance corridor charges, used for "fees saved"

const SAVINGS_ADDRESS = process.env.SAVINGS_WALLET_ADDRESS?.trim() || '0x9C2ebEB50975FE0fe475Ed4Fee4c8E6761110fb5';
const SAVINGS: Contact = {
  id: 'savings',
  name: 'Savings',
  address: SAVINGS_ADDRESS,
  addressShort: SAVINGS_ADDRESS.slice(0, 6) + '…' + SAVINGS_ADDRESS.slice(-4),
  verifiedAt: '2026-10-01T03:00:00Z',
};

const ALIASES: Record<string, string> = {
  mama: 'c-ibu',
  mamah: 'c-ibu',
  mom: 'c-ibu',
  adek: 'c-adik',
  dik: 'c-adik',
  tabungan: 'savings',
};

export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

const n = (v: string) => Number.parseFloat(v);
const fmt = (v: number) => v.toFixed(2);

/** Money input is a positive decimal string; never let NaN reach the signer. */
function amountInput(value: string | undefined, label: string): number {
  const parsed = n(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed <= 0) throw new ApiError('VALIDATION_ERROR', label + ' must be more than 0.', 400);
  if (parsed > 1_000_000) throw new ApiError('VALIDATION_ERROR', label + ' is too large.', 400);
  return parsed;
}

function balanceInput(value: string | undefined): number {
  const parsed = n(String(value ?? '0'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new ApiError('VALIDATION_ERROR', 'Minimum balance must be 0 or more.', 400);
  return parsed;
}
const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// --- auth (TMG-50) -------------------------------------------------------------

export function checkToken(header: string | undefined): void {
  const expected = process.env.DEVICE_TOKEN || 'demo-device';
  const got = (header ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!got || got !== expected) throw new ApiError('UNAUTHORIZED', 'This device is not linked to the wallet.', 401);
}

export function checkPin(pin: string | undefined): void {
  if (state.pin.lockedUntil > Date.now()) {
    const mins = Math.ceil((state.pin.lockedUntil - Date.now()) / 60000);
    throw new ApiError('PIN_LOCKED', 'Too many wrong PINs. Try again in ' + mins + ' minutes.', 423);
  }
  if (!pin) throw new ApiError('PIN_REQUIRED', 'Enter your PIN to continue.', 401);
  if (sha256(pin) !== PIN_HASH) {
    state.pin.fails += 1;
    const left = MAX_PIN_FAILS - state.pin.fails;
    audit('pin_failed', { left });
    if (left <= 0) {
      state.pin.lockedUntil = Date.now() + LOCK_MS;
      state.pin.fails = 0;
      save();
      throw new ApiError('PIN_LOCKED', 'Too many wrong PINs. Try again in 15 minutes.', 423);
    }
    save();
    throw new ApiError('PIN_INVALID', 'Wrong PIN. ' + left + ' attempts left.', 401);
  }
  state.pin.fails = 0;
  save();
}

// --- contacts and policy -------------------------------------------------------

function allContacts(): Contact[] {
  return [...state.contacts, SAVINGS];
}

function byAddress(address: string): Contact | undefined {
  return allContacts().find((c) => c.address.toLowerCase() === address.toLowerCase());
}

function byName(text: string): Contact | undefined {
  const t = text.toLowerCase();
  for (const c of allContacts()) if (t.includes(c.name.toLowerCase())) return c;
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (new RegExp('\\b' + alias + '\\b').test(t)) return allContacts().find((c) => c.id === id);
  }
  return undefined;
}

/** FR-17: policy/lookalike.ts owns the comparison; this only supplies the known addresses. */
function lookalikeOf(address: string): { contact: Contact; message: string } | undefined {
  const known: KnownAddress[] = allContacts().map((c) => ({ id: c.id, name: c.name, address: c.address }));
  const hit = findLookalike(address, known);
  if (!hit) return undefined;
  const contact = allContacts().find((c) => c.id === hit.contact.id) as Contact;
  return { contact, message: hit.message };
}

function sentToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return state.activity
    .filter((e) => e.type === 'transfer_sent' && Date.parse(e.at) >= start.getTime())
    .reduce((sum, e) => sum + n(e.amount ?? '0'), 0);
}

/** FR-20: owner limits are clamped to the compiled-in ceilings, never the other way round. */
function policyConfig(): PolicyConfig {
  const limits = clampConfig(n(state.settings.perTxLimit), n(state.settings.dailyLimit), n(state.settings.confirmAbove));
  return { ...limits, allowlist: allContacts().map((c) => c.address) };
}

/** USDC is a dollar stablecoin, so 1 USDC counts as 1 USD for the limits. */
function gate(to: string, amountUsdc: number, stage = 'check'): PolicyResult {
  const intent: TxIntent = { action: 'transfer', chainId: chain.chainId, to, token: 'USDC', amountUsd: amountUsdc };
  const result = checkPolicy(intent, policyConfig(), { spentTodayUsd: sentToday(), paused: state.settings.paused });
  // FR-22: every decision is recorded, not only the ones that blocked something.
  audit('policy_decision', { stage, to, amount: fmt(amountUsdc), decision: result.decision, reasons: result.reasons });
  return result;
}

/** policy/ owns the rules; this owns the wording the app shows. */
function toReason(policyReason: string, amount: number, addressShort?: string): Reason {
  const s = state.settings;
  if (/paused/i.test(policyReason))
    return { code: 'AGENT_PAUSED', message: 'Tam is paused. Turn it back on in Settings first.' };
  if (/allowlist|malformed/i.test(policyReason))
    return { code: 'NOT_IN_ALLOWLIST', message: (addressShort ?? 'That address') + ' is not one of your trusted contacts.' };
  if (/per-transaction/i.test(policyReason))
    return {
      code: 'OVER_PER_TX_LIMIT',
      message: fmt(amount) + ' USDC is above your ' + s.perTxLimit + ' USDC per-transfer limit.',
    };
  if (/daily/i.test(policyReason))
    return { code: 'OVER_DAILY_LIMIT', message: 'This would go over your ' + s.dailyLimit + ' USDC daily limit.' };
  if (/chain/i.test(policyReason)) return { code: 'CHAIN_NOT_ALLOWED', message: 'That network is not allowed.' };
  if (/action/i.test(policyReason))
    return { code: 'ACTION_NOT_ALLOWED', message: 'That kind of transaction is not allowed.' };
  if (/confirmation/i.test(policyReason))
    return {
      code: 'ABOVE_CONFIRM_THRESHOLD',
      message: 'Transfers above ' + s.confirmAbove + ' USDC need your confirmation.',
    };
  if (/approvals/i.test(policyReason))
    return { code: 'APPROVAL_REQUIRED', message: 'Token approvals need your confirmation.' };
  return { code: 'ACTION_NOT_ALLOWED', message: policyReason };
}

// --- activity ------------------------------------------------------------------

function logEvent(event: Partial<ActivityEvent> & Pick<ActivityEvent, 'type' | 'title'>): ActivityEvent {
  const full = {
    id: event.id ?? nextId('e'),
    at: event.at ?? new Date().toISOString(),
    read: event.read ?? false,
    ...event,
  } as ActivityEvent;
  state.activity.unshift(full);
  return full;
}

function logBlocked(title: string, reasons: Reason[], amount?: string, excerpt?: string): void {
  logEvent({
    type: 'attempt_blocked',
    read: false,
    title,
    amount,
    source: excerpt ? 'external' : 'chat',
    excerpt,
    reasons,
  });
  state.wallet.protection.blocked += 1;
  state.wallet.protection.checked += 1;
  audit('blocked', { title, reasons: reasons.map((r) => r.code), amount });
}

function isTxRef(value: unknown): value is TxRef {
  if (!value || typeof value !== 'object') return false;
  const tx = value as Partial<TxRef>;
  return (
    typeof tx.hash === 'string' &&
    tx.hash.startsWith('0x') &&
    typeof tx.explorerUrl === 'string' &&
    (tx.status === 'pending' || tx.status === 'confirmed' || tx.status === 'failed' || tx.status === 'unknown')
  );
}

/** In live mode the source of truth is the chain, not the seed balance in app/mocks. */
async function refreshBalances(): Promise<void> {
  if (chain.simulated()) return;
  if (chain.agentAddress) {
    state.wallet.address = chain.agentAddress;
    state.wallet.addressShort = short(chain.agentAddress);
  }
  const [agent, savings] = await Promise.all([
    chain.getUsdcBalance(state.wallet.address),
    chain.getUsdcBalance(SAVINGS.address),
  ]);
  if (agent !== null) state.wallet.balance = fmt(agent);
  if (savings !== null) state.wallet.savings.balance = fmt(savings);
  save();
}

async function settlePending(): Promise<void> {
  const now = Date.now();
  for (const e of state.activity) {
    if (!e.tx || e.tx.status !== 'pending') continue;
    if (chain.simulated()) {
      if (now - Date.parse(e.at) > 4000) e.tx.status = 'confirmed';
      continue;
    }
    e.tx.status = await chain.receiptStatus(e.tx.hash);
  }
  for (const m of state.mandates) {
    if (!m.lastRun) continue;
    for (const tx of m.lastRun.txs) {
      if (tx.status !== 'pending') continue;
      if (chain.simulated()) {
        if (now - Date.parse(m.lastRun.at) > 4000) tx.status = 'confirmed';
        continue;
      }
      tx.status = await chain.receiptStatus(tx.hash);
    }
  }
  save();
}

interface TransferContext {
  /** Persisted key so a replayed mandate run never broadcasts the same transfer twice. */
  idempotencyKey?: string;
  runId?: string;
  /** Human-readable line for docs/EXECUTION_EVIDENCE.md. */
  scenario?: string;
}

/** The only path that moves money. Re-runs the gate, so no caller can skip it. */
async function executeTransfer(
  contact: Contact,
  amount: number,
  source: 'chat' | 'mandate',
  ctx: TransferContext = {},
): Promise<TxRef> {
  // A replay of a run that already broadcast this recipient is not a new transfer.
  if (ctx.idempotencyKey) {
    const prior = state.idempotency[ctx.idempotencyKey];
    if (isTxRef(prior)) return clone(prior);
  }

  const verdict = gate(contact.address, amount, 'pre-sign');
  if (verdict.decision === 'deny') {
    const reasons = verdict.reasons.map((r) => toReason(r, amount, contact.addressShort));
    logBlocked('Transfer to ' + contact.name + ' blocked', reasons, fmt(amount));
    save();
    throw new ApiError('VALIDATION_ERROR', reasons[0].message, 400);
  }
  // FR-16: decode what will actually be signed and refuse any gap with what was promised.
  const calldata = chain.buildCalldata(contact.address, amount);
  const match = intentCheck(decodeTx(calldata), { action: 'transfer', to: contact.address, amount });
  if (!match.ok) {
    const reasons: Reason[] = match.mismatches.map((m) => ({ code: 'INTENT_MISMATCH', message: m }));
    logBlocked('Transaction did not match what you confirmed', reasons, fmt(amount));
    audit('intent_mismatch', { to: contact.id, amount: fmt(amount), mismatches: match.mismatches });
    save();
    throw new ApiError('VALIDATION_ERROR', reasons[0].message, 400);
  }

  let tx: TxRef;
  try {
    tx = await chain.transfer(contact.address, amount);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Base Sepolia did not accept the transaction.';
    logEvent({
      type: 'transfer_failed',
      read: false,
      title: 'Could not send ' + fmt(amount) + ' USDC to ' + contact.name,
      amount: fmt(amount),
      recipient: toRecipient(contact),
      source,
    });
    audit('transfer_failed', { to: contact.id, amount: fmt(amount), source, error: message });
    save();
    throw new ApiError('NETWORK_ERROR', message, 502);
  }

  // Persist the hash before touching the balance: if the process dies now, a replay
  // of the same mandate run finds this hash and does not send a second transfer.
  if (ctx.idempotencyKey) state.idempotency[ctx.idempotencyKey] = tx;

  const saved = amount * BENCHMARK_PCT - n(NETWORK_FEE_USD);
  logEvent({
    type: 'transfer_sent',
    read: true,
    title: fmt(amount) + ' USDC ' + (contact.id === 'savings' ? 'moved to ' : 'sent to ') + contact.name,
    amount: fmt(amount),
    recipient: toRecipient(contact),
    source,
    tx,
    feeUsd: NETWORK_FEE_USD,
    savedVsBenchmarkUsd: fmt(saved),
  });
  state.wallet.balance = fmt(n(state.wallet.balance) - amount);
  if (contact.id === 'savings') state.wallet.savings.balance = fmt(n(state.wallet.savings.balance) + amount);
  state.wallet.feesSaved.totalUsd = fmt(n(state.wallet.feesSaved.totalUsd) + saved);
  state.wallet.protection.checked += 1;
  audit('transfer', {
    to: contact.id,
    amount: fmt(amount),
    hash: tx.hash,
    source,
    runId: ctx.runId,
    simulated: chain.simulated(),
  });

  // TMG-19: only real broadcasts reach the evidence file; the benchmark and the simulator never do.
  if (chain.live && !chain.simulated() && chain.agentAddress) {
    appendEvidence({
      at: new Date().toISOString(),
      scenario: ctx.scenario ?? source + ' transfer to ' + contact.name,
      decision: 'allow',
      amount: fmt(amount),
      hash: tx.hash,
      explorerUrl: tx.explorerUrl,
      agentAddress: chain.agentAddress,
    });
  }

  save();
  return tx;
}

function toRecipient(c: Contact): Recipient {
  return { contactId: c.id, name: c.name, addressShort: c.addressShort };
}

// --- endpoints -----------------------------------------------------------------

export async function getWallet(): Promise<Wallet> {
  await refreshBalances();
  await settlePending();
  const w = state.wallet;
  const upcoming = state.mandates
    .filter((m) => m.status !== 'paused' && m.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt as string) - Date.parse(b.nextRunAt as string))[0];
  w.nextRun = upcoming
    ? {
        mandateId: upcoming.id,
        label: upcoming.label,
        schedule: upcoming.schedule,
        at: upcoming.nextRunAt as string,
        total: upcoming.total,
        status: upcoming.status,
        recipients: upcoming.recipients.map((r) => ({ name: r.name, amount: r.amount })),
      }
    : null;
  w.mandates = { active: state.mandates.filter((m) => m.status === 'active').length, total: state.mandates.length };
  w.paused = state.settings.paused;
  w.savings.target = state.settings.savingsTarget;
  w.unreadEvents = state.activity.filter((e) => !e.read).length;
  save();
  return clone(w);
}

export async function chat(message: string, declared: Provenance = 'USER'): Promise<ChatResponse> {
  await refreshBalances();
  const messageId = nextId('m');
  const intent = parseIntent(message ?? '');
  const s = state.settings;

  // FR-15: an order to move money found in forwarded text is never the owner speaking.
  const provenance = checkProvenance(message ?? '', declared);

  if (intent.kind === 'blocked_report') {
    const blocked = state.activity.filter((e) => e.type === 'attempt_blocked');
    return {
      messageId,
      reply: blocked.length
        ? 'I blocked ' +
          state.wallet.protection.blocked +
          ' requests this month. The latest one was "' +
          blocked[0].title +
          '". Open Activity to see the reasons.'
        : 'Nothing blocked this month.',
      card: null,
    };
  }

  if (intent.kind === 'mandate') {
    const card = clone(DRAFT_TEMPLATE.card) as MandateDraftCard;
    card.intentId = nextId('i');
    card.expiresAt = new Date(Date.now() + INTENT_TTL_MS).toISOString();
    state.intents[card.intentId] = card;
    save();
    return { messageId, reply: DRAFT_TEMPLATE.reply, card };
  }

  if (intent.kind === 'help') {
    return {
      messageId,
      reply:
        'I can send money to your contacts, set up an auto-send, or tell you what I blocked. Try "send 10 USDC to Adik".',
      card: null,
    };
  }

  // A confusably written address never counts as "known", even if it folds onto a contact.
  const known = intent.address && !intent.addressConfusable ? byAddress(intent.address) : undefined;
  const target = known ?? byName(intent.text);
  const reasons: Reason[] = [];

  if (intent.injection.length > 0)
    reasons.push({ code: 'INJECTION_DETECTED', message: 'The message tried to override your safety rules.' });

  if (provenance.blocked)
    reasons.push({ code: 'EXTERNAL_PROVENANCE', message: provenance.message });

  if (intent.address && !known) {
    // A confusably typed address folds onto a real contact, which is exactly the trap:
    // it reads as Adik, it is not Adik, and the owner should hear why.
    const folded = intent.addressConfusable ? byAddress(intent.address) : undefined;
    const look = lookalikeOf(intent.address);
    if (folded)
      reasons.push({
        code: 'LOOKALIKE_ADDRESS',
        message: "That address is written with characters that imitate " + folded.name + "'s wallet.",
      });
    else
      reasons.push(
        look
          ? { code: 'LOOKALIKE_ADDRESS', message: look.message }
          : { code: 'NOT_IN_ALLOWLIST', message: short(intent.address) + ' is not one of your trusted contacts.' },
      );
  }

  // An injection with no amount is read as "take everything", which is what the attacker meant.
  const amount = intent.amount ?? (intent.injection.length > 0 ? n(state.wallet.balance) : null);

  if (amount !== null && target) {
    const pre = gate(target.address, amount);
    if (pre.decision === 'deny') {
      for (const r of pre.reasons) {
        const mapped = toReason(r, amount, target.addressShort);
        if (!reasons.some((x) => x.code === mapped.code)) reasons.push(mapped);
      }
    }
  } else if (s.paused) {
    reasons.push({ code: 'AGENT_PAUSED', message: 'Tam is paused. Turn it back on in Settings first.' });
  }

  if (reasons.length > 0) {
    const card: DecisionCard = {
      type: 'decision',
      intentId: nextId('i'),
      decision: 'deny',
      summary: 'No money moved. This request was blocked.',
      action: 'transfer',
      amount: amount === null ? '0.00' : fmt(amount),
      token: 'USDC',
      recipient: target ? toRecipient(target) : null,
      rawAddressShort: intent.address && !known ? short(intent.address) : undefined,
      networkFeeUsd: NETWORK_FEE_USD,
      savedVsBenchmarkUsd: '0.00',
      reasons,
      expiresAt: null,
      tx: null,
    };
    logBlocked(
      intent.address && !known ? 'Transfer to unknown address blocked' : 'Transfer blocked',
      reasons,
      card.amount,
      provenance.excerpt ?? (intent.injection.length > 0 ? intent.text.slice(0, 120) : undefined),
    );
    save();
    return { messageId, reply: "I can't do that. Nothing left your wallet.", card };
  }

  if (!target) {
    const name = intent.nameHint;
    return {
      messageId,
      reply: name
        ? "I don't have a contact called " + name[0].toUpperCase() + name.slice(1) + ' yet.'
        : 'Who should I send it to?',
      card: {
        type: 'clarify',
        question: 'Who should get this money?',
        options: [...state.contacts.map((c) => c.name), 'Add a contact'],
      },
    };
  }

  if (amount === null) {
    return {
      messageId,
      reply: 'How much should I send to ' + target.name + '?',
      card: {
        type: 'clarify',
        question: 'How much for ' + target.name + '?',
        options: ['10 USDC', '25 USDC', '50 USDC'],
      },
    };
  }

  const verdict = gate(target.address, amount);
  const savedUsd = fmt(amount * BENCHMARK_PCT - n(NETWORK_FEE_USD));

  if (verdict.decision === 'confirm') {
    const card: DecisionCard = {
      type: 'decision',
      intentId: nextId('i'),
      decision: 'confirm',
      summary: fmt(amount) + ' USDC will go to ' + target.name + ' after you confirm.',
      action: 'transfer',
      amount: fmt(amount),
      token: 'USDC',
      recipient: toRecipient(target),
      networkFeeUsd: NETWORK_FEE_USD,
      savedVsBenchmarkUsd: savedUsd,
      reasons: verdict.reasons.map((r) => toReason(r, amount, target.addressShort)),
      expiresAt: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
      tx: null,
    };
    state.intents[card.intentId] = card;
    save();
    return {
      messageId,
      reply: "That's above your " + s.confirmAbove + ' USDC confirm threshold, so I need your OK first.',
      card,
    };
  }

  const tx = await executeTransfer(target, amount, 'chat');
  return {
    messageId,
    reply: 'Done. ' + fmt(amount) + ' USDC is on its way to ' + target.name + '.',
    card: {
      type: 'decision',
      intentId: nextId('i'),
      decision: 'allow',
      summary: fmt(amount) + ' USDC is being sent to ' + target.name + '.',
      action: 'transfer',
      amount: fmt(amount),
      token: 'USDC',
      recipient: toRecipient(target),
      networkFeeUsd: NETWORK_FEE_USD,
      savedVsBenchmarkUsd: savedUsd,
      reasons: [{ code: 'WITHIN_LIMITS', message: 'Within all your limits, to a trusted contact.' }],
      expiresAt: null,
      tx,
    },
  };
}

export async function confirm(intentId: string, approve: boolean, pin?: string): Promise<ConfirmResponse> {
  const intent = state.intents[intentId];
  if (!intent) throw new ApiError('NOT_FOUND', 'This request is no longer available.', 404);

  if (!approve) {
    delete state.intents[intentId];
    save();
    audit('intent_rejected', { intentId });
    return { intentId, status: 'rejected', tx: null, mandate: null };
  }

  checkPin(pin);

  if (intent.expiresAt && Date.parse(intent.expiresAt) < Date.now()) {
    delete state.intents[intentId];
    save();
    throw new ApiError('INTENT_EXPIRED', 'This request expired. Ask Tam again.', 409);
  }
  delete state.intents[intentId];

  if (intent.type === 'mandate_draft') {
    const mandate = createMandate(intent.mandate);
    audit('mandate_created', { intentId, mandateId: mandate.id, total: mandate.total });
    return { intentId, status: 'executed', tx: null, mandate: clone(mandate) };
  }

  const contact = allContacts().find((c) => c.id === intent.recipient?.contactId);
  if (!contact) throw new ApiError('NOT_FOUND', 'That contact is gone. Add it again before sending.', 404);

  const amount = n(intent.amount);
  const verdict = gate(contact.address, amount);
  if (verdict.decision === 'deny') {
    const reasons = verdict.reasons.map((r) => toReason(r, amount, contact.addressShort));
    logBlocked('Transfer to ' + contact.name + ' blocked', reasons, fmt(amount));
    save();
    return { intentId, status: 'denied', tx: null, mandate: null, reasons };
  }

  const tx = await executeTransfer(contact, amount, 'chat');
  return { intentId, status: 'executed', tx: clone(tx), mandate: null };
}

export async function getActivity(cursor?: string, limit = 50): Promise<ActivityPage> {
  await settlePending();
  const start = cursor ? state.activity.findIndex((e) => e.id === cursor) + 1 : 0;
  const items = state.activity.slice(start, start + limit);
  const more = start + limit < state.activity.length;
  save();
  return {
    items: clone(items),
    nextCursor: more && items.length ? items[items.length - 1].id : null,
    unread: state.activity.filter((e) => !e.read).length,
  };
}

export function markRead(upTo: string): { unread: number } {
  const idx = state.activity.findIndex((e) => e.id === upTo);
  state.activity.forEach((e, i) => {
    if (idx === -1 || i >= idx) e.read = true;
  });
  save();
  return { unread: state.activity.filter((e) => !e.read).length };
}

export function getMandates(): { items: Mandate[] } {
  return { items: clone(state.mandates) };
}

function nextMonthly(day: number): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(Math.max(day, 1), 28), 2, 0, 0));
  if (next.getTime() <= Date.now()) next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString();
}

function nextRunFor(m: Mandate): string {
  return m.schedule.type === 'interval'
    ? new Date(Date.now() + (m.schedule.minutes ?? 2) * 60000).toISOString()
    : nextMonthly(m.schedule.dayOfMonth ?? 1);
}

export function createMandate(input: MandateInput): Mandate {
  if (!input || !Array.isArray(input.recipients) || input.recipients.length < 1 || input.recipients.length > 5)
    throw new ApiError('VALIDATION_ERROR', 'An auto-send needs between 1 and 5 recipients.', 400);

  const recipients = input.recipients.map((r) => {
    const c = allContacts().find((x) => x.id === r.contactId);
    if (!c) throw new ApiError('NOT_FOUND', 'One of those contacts no longer exists.', 404);
    return { ...toRecipient(c), amount: fmt(amountInput(r.amount, c.name + "'s amount")) };
  });

  const mandate: Mandate = {
    id: nextId('md'),
    label: (input.label ?? '').trim() || 'Monthly · ' + recipients.length + ' recipients',
    recipients,
    total: fmt(recipients.reduce((sum, r) => sum + n(r.amount), 0)),
    schedule: input.schedule ?? { type: 'monthly', dayOfMonth: 1 },
    minBalance: fmt(balanceInput(input.minBalance)),
    status: 'active',
    nextRunAt: null,
    lastRun: null,
    consecutivePostpones: 0,
  };
  mandate.nextRunAt = nextRunFor(mandate);
  state.mandates.unshift(mandate);
  save();
  return mandate;
}

export function patchMandate(id: string, body: Partial<MandateInput> & { status?: MandateStatus }): Mandate {
  const m = state.mandates.find((x) => x.id === id);
  if (!m) throw new ApiError('NOT_FOUND', 'Auto-send not found.', 404);

  if (body.recipients) {
    m.recipients = body.recipients.map((r) => {
      const c = allContacts().find((x) => x.id === r.contactId);
      if (!c) throw new ApiError('NOT_FOUND', 'One of those contacts no longer exists.', 404);
      return { ...toRecipient(c), amount: fmt(amountInput(r.amount, c.name + "'s amount")) };
    });
    m.total = fmt(m.recipients.reduce((sum, r) => sum + n(r.amount), 0));
  }
  if (body.label !== undefined) m.label = body.label.trim() || m.label;
  if (body.schedule) m.schedule = body.schedule;
  if (body.minBalance !== undefined) m.minBalance = fmt(balanceInput(body.minBalance));

  if (body.status) {
    m.status = body.status;
    if (body.status === 'paused') {
      m.nextRunAt = null;
      logEvent({ type: 'mandate_paused', read: true, title: m.label + ' paused', mandateId: m.id });
    } else {
      m.consecutivePostpones = body.status === 'active' ? 0 : m.consecutivePostpones;
      m.nextRunAt = nextRunFor(m);
    }
  } else if (body.schedule) {
    m.nextRunAt = m.status === 'paused' ? null : nextRunFor(m);
  }

  audit('mandate_updated', { mandateId: m.id, status: m.status });
  save();
  return clone(m);
}

export function deleteMandate(id: string): void {
  const before = state.mandates.length;
  state.mandates = state.mandates.filter((m) => m.id !== id);
  if (state.mandates.length === before) throw new ApiError('NOT_FOUND', 'Auto-send not found.', 404);
  audit('mandate_deleted', { mandateId: id });
  save();
}

export function getContacts(): { items: Contact[] } {
  return { items: clone(state.contacts) };
}

export function addContact(name: string, address: string): Contact {
  const cleanName = (name ?? '').trim();
  const a = (address ?? '').trim();
  if (!cleanName) throw new ApiError('VALIDATION_ERROR', 'Add a name for this contact.', 400);
  if (!/^0x[0-9a-fA-F]{40}$/.test(a))
    throw new ApiError('VALIDATION_ERROR', 'That address should start with 0x and have 42 characters.', 400);

  const look = lookalikeOf(a);
  if (look) {
    audit('blocked', { title: 'Look-alike contact rejected', address: a, like: look.contact.id });
    throw new ApiError('LOOKALIKE_ADDRESS', look.message + ' Check it with them before adding it.', 409);
  }

  const contact: Contact = {
    id: nextId('c'),
    name: cleanName,
    address: a,
    addressShort: short(a),
    verifiedAt: new Date().toISOString(),
  };
  state.contacts.push(contact);
  audit('contact_added', { id: contact.id, address: a });
  save();
  return clone(contact);
}

export function deleteContact(id: string): void {
  if (state.mandates.some((m) => m.status !== 'paused' && m.recipients.some((r) => r.contactId === id)))
    throw new ApiError('CONTACT_IN_USE', 'An active auto-send uses this contact. Pause it first.', 409);
  const before = state.contacts.length;
  state.contacts = state.contacts.filter((c) => c.id !== id);
  if (state.contacts.length === before) throw new ApiError('NOT_FOUND', 'Contact not found.', 404);
  audit('contact_deleted', { id });
  save();
}

export function getSettings(): Settings {
  return clone(state.settings);
}

/** Pausing is the panic button, so it never asks for a PIN. Everything else does. */
export function settingsNeedPin(body: Partial<Settings>): boolean {
  return !(Object.keys(body).length === 1 && body.paused === true);
}

export function patchSettings(body: Partial<Settings>): Settings {
  const amountKeys = ['perTxLimit', 'dailyLimit', 'confirmAbove', 'savingsTarget'] as const;
  for (const key of amountKeys) {
    const v = body[key];
    if (v !== undefined && !/^\d+(\.\d{1,6})?$/.test(String(v)))
      throw new ApiError('VALIDATION_ERROR', 'Limits must be a plain number like 100.00.', 400);
  }
  // FR-20: an owner may tighten their limits, never widen them past the compiled ceilings.
  const bounds = checkLimits(body);
  if (!bounds.ok) {
    audit('permission_denied', { patch: body, violations: bounds.violations });
    throw new ApiError('VALIDATION_ERROR', bounds.violations[0], 400);
  }

  const wasPaused = state.settings.paused;
  state.settings = { ...state.settings, ...body };
  audit('settings_changed', { patch: body });
  if (body.paused !== undefined && body.paused !== wasPaused) {
    logEvent({
      type: body.paused ? 'agent_paused' : 'agent_resumed',
      read: true,
      title: body.paused ? 'Tam paused. No automatic transfers will run.' : 'Tam is back on',
    });
    audit(body.paused ? 'agent_paused' : 'agent_resumed');
  }
  save();
  return clone(state.settings);
}

// --- scheduler (TMG-49) ---------------------------------------------------------

const runningMandates = new Set<string>();

/** Runs every mandate whose time has come. Safe to call as often as you like. */
export async function runDueMandates(now = Date.now()): Promise<string[]> {
  await refreshBalances();
  const ran: string[] = [];
  for (const m of state.mandates) {
    // A postponed mandate keeps its slot: it retries at nextRunAt and auto-pauses after 3.
    if (m.status !== 'active' && m.status !== 'postponed') continue;
    if (!m.nextRunAt || Date.parse(m.nextRunAt) > now) continue;
    if (runningMandates.has(m.id)) continue;
    runningMandates.add(m.id);
    try {
      if (await runMandate(m)) ran.push(m.id);
    } finally {
      runningMandates.delete(m.id);
    }
  }
  return ran;
}

async function runMandate(m: Mandate): Promise<boolean> {
  const at = new Date().toISOString();
  const scheduledAt = m.nextRunAt;
  if (!scheduledAt) return false;

  // Deterministic id: a crash/restart on the same slot resumes the same run instead of
  // treating it as a new one. This is the per-run idempotency key from NFR-06.
  const runId = 'run-' + m.id + '-' + Date.parse(scheduledAt);
  let run: MandateRun | undefined = state.mandateRuns[runId];

  if (run && run.status !== 'pending') {
    // The run already reached a terminal state. Only repair a pointer left behind by a
    // crash; never broadcast its transfers again.
    if (m.nextRunAt === scheduledAt) {
      if (run.status === 'postponed' && m.consecutivePostpones >= 3) {
        m.status = 'paused';
        m.nextRunAt = null;
      } else {
        m.nextRunAt = nextRunFor(m);
      }
      save();
    }
    return false;
  }

  if (!run) {
    run = {
      id: runId,
      mandateId: m.id,
      scheduledAt,
      startedAt: at,
      updatedAt: at,
      status: 'pending',
      txs: [],
      transfers: {},
    };
    state.mandateRuns[runId] = run;
    save();
  }

  if (run.txs.length === 0 && n(state.wallet.balance) - n(m.total) < n(m.minBalance)) {
    run.status = 'postponed';
    run.updatedAt = at;
    m.consecutivePostpones += 1;
    m.status = 'postponed';
    m.nextRunAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    m.lastRun = { id: runId, at, status: 'postponed', txs: [] };
    logEvent({
      type: 'run_postponed',
      read: false,
      title: m.label + ' postponed',
      mandateId: m.id,
      amount: m.total,
      reasons: [
        {
          code: 'BELOW_MIN_BALANCE',
          message: 'Sending ' + m.total + ' USDC would drop you under your ' + m.minBalance + ' USDC buffer.',
        },
      ],
    });

    if (m.consecutivePostpones >= 3) {
      m.status = 'paused';
      m.nextRunAt = null;
      logEvent({
        type: 'mandate_paused',
        read: false,
        title: m.label + ' paused after 3 postponed runs',
        mandateId: m.id,
        reasons: [
          {
            code: 'BELOW_MIN_BALANCE',
            message: 'The balance stayed below the ' + m.minBalance + ' USDC buffer for 3 runs in a row.',
          },
        ],
      });
      audit('mandate_auto_paused', { mandateId: m.id, consecutivePostpones: m.consecutivePostpones });
    }

    audit('mandate_postponed', { mandateId: m.id, total: m.total, runId });
    save();
    return true;
  }

  const txs: TxRef[] = [];
  let failed = false;
  for (const [index, r] of m.recipients.entries()) {
    const key = 'mandate:' + runId + ':' + index;
    const cached = run.transfers[key];
    if (cached) {
      txs.push(cached);
      continue;
    }

    const contact = allContacts().find((c) => c.id === r.contactId);
    if (!contact) {
      failed = true;
      continue;
    }
    try {
      const tx = await executeTransfer(contact, n(r.amount), 'mandate', {
        idempotencyKey: key,
        runId,
        scenario: m.label + ' — ' + contact.name,
      });
      run.transfers[key] = tx;
      run.txs = txs.concat(tx);
      run.updatedAt = new Date().toISOString();
      txs.push(tx);
      save();
    } catch {
      failed = true; // executeTransfer already logged the blocked attempt
    }
  }

  const status = failed ? 'failed' : txs.length > 0 ? 'sent' : 'failed';
  m.status = 'active';
  m.consecutivePostpones = 0;
  m.lastRun = { id: runId, at, status, txs };
  m.nextRunAt = nextRunFor(m);
  run.status = status;
  run.txs = txs;
  run.updatedAt = new Date().toISOString();
  audit('mandate_run', { mandateId: m.id, runId, sent: txs.length, failed });
  save();
  return true;
}
