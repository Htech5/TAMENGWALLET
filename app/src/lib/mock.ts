// In-memory stand-in for server/, built from app/mocks. Used when EXPO_PUBLIC_API_URL is empty.
// It follows the same contract and the same rules the policy layer enforces, so screens behave
// the same way once the real backend is switched on. Demo PIN is 123456.

import activityJson from '../../mocks/activity.json';
import contactsJson from '../../mocks/contacts.json';
import mandatesJson from '../../mocks/mandates.json';
import settingsJson from '../../mocks/settings.json';
import walletJson from '../../mocks/home-wallet.json';
import draftJson from '../../mocks/chat-mandate-draft.json';
import type { Api } from './api';
import {
  ActivityEvent,
  ApiError,
  ChatResponse,
  ConfirmResponse,
  Contact,
  DecisionCard,
  Mandate,
  MandateDraftCard,
  Reason,
  Settings,
  TxRef,
  Wallet,
} from './types';

const DEMO_PIN = '123456';
const SAVINGS: Contact = {
  id: 'savings',
  name: 'Savings',
  address: '0x286d4c1aa2f0b7e9c3d5e8f1a6b2c7d9e0f3b329',
  addressShort: '0x286d…b329',
  verifiedAt: '2026-10-01T03:00:00Z',
};

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const state = {
  wallet: clone(walletJson) as Wallet,
  activity: clone(activityJson.items) as ActivityEvent[],
  contacts: clone(contactsJson.items) as Contact[],
  mandates: clone(mandatesJson.items) as Mandate[],
  settings: clone(settingsJson) as Settings,
  intents: new Map<string, DecisionCard | MandateDraftCard>(),
  pinFails: 0,
  seq: 200,
};

// Extra seed so the Home and Activity screens look like a lived-in month.
state.activity.unshift({
  id: 'e-121',
  type: 'transfer_sent',
  at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
  read: true,
  title: '10.00 USDC sent to Adik',
  amount: '10.00',
  recipient: { contactId: 'c-adik', name: 'Adik', addressShort: '0x0047…62ea' },
  source: 'chat',
  tx: makeTx('confirmed'),
  feeUsd: '0.0019',
  savedVsBenchmarkUsd: '0.51',
});

const wait = (ms = 280) => new Promise((r) => setTimeout(r, ms));
const n = (s: string) => Number.parseFloat(s);
const fmt = (v: number) => v.toFixed(2);

function makeTx(status: TxRef['status'] = 'pending'): TxRef {
  let h = '0x';
  for (let i = 0; i < 64; i++) h += Math.floor(Math.random() * 16).toString(16);
  return { hash: h, explorerUrl: `https://sepolia.basescan.org/tx/${h}`, status };
}

function nextId(prefix: string) {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

function checkPin(pin?: string) {
  if (!pin) throw new ApiError('PIN_REQUIRED', 'Enter your PIN to continue.', 401);
  if (state.pinFails >= 5) throw new ApiError('PIN_LOCKED', 'Too many wrong PINs. Try again in 15 minutes.', 423);
  if (pin !== DEMO_PIN) {
    state.pinFails += 1;
    throw new ApiError('PIN_INVALID', `Wrong PIN. ${5 - state.pinFails} attempts left.`, 401);
  }
  state.pinFails = 0;
}

function allContacts(): Contact[] {
  return [...state.contacts, SAVINGS];
}

function findContact(text: string): Contact | undefined {
  const t = text.toLowerCase();
  const aliases: Record<string, string> = { mama: 'c-ibu', mamah: 'c-ibu', mom: 'c-ibu', adek: 'c-adik', tabungan: 'savings' };
  for (const c of allContacts()) if (t.includes(c.name.toLowerCase())) return c;
  for (const [alias, id] of Object.entries(aliases)) if (t.includes(alias)) return allContacts().find((c) => c.id === id);
  return undefined;
}

function settle() {
  // Pending transactions confirm a few seconds later, like a Base block.
  const now = Date.now();
  for (const e of state.activity) {
    if (e.tx?.status === 'pending' && now - Date.parse(e.at) > 4000) e.tx.status = 'confirmed';
  }
}

function sentToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return state.activity
    .filter((e) => e.type === 'transfer_sent' && Date.parse(e.at) >= start.getTime())
    .reduce((s, e) => s + n(e.amount ?? '0'), 0);
}

function logBlocked(title: string, reasons: Reason[], amount?: string, excerpt?: string) {
  state.activity.unshift({
    id: nextId('e'),
    type: 'attempt_blocked',
    at: new Date().toISOString(),
    read: false,
    title,
    amount,
    source: excerpt ? 'external' : 'chat',
    excerpt,
    reasons,
  });
  state.wallet.protection.blocked += 1;
  state.wallet.protection.checked += 1;
}

function send(contact: Contact, amount: number, source: 'chat' | 'mandate'): TxRef {
  const tx = makeTx('pending');
  const saved = amount * 0.0513 - 0.0021;
  state.activity.unshift({
    id: nextId('e'),
    type: 'transfer_sent',
    at: new Date().toISOString(),
    read: true,
    title: `${fmt(amount)} USDC ${contact.id === 'savings' ? 'moved to' : 'sent to'} ${contact.name}`,
    amount: fmt(amount),
    recipient: { contactId: contact.id, name: contact.name, addressShort: contact.addressShort },
    source,
    tx,
    feeUsd: '0.0021',
    savedVsBenchmarkUsd: fmt(saved),
  });
  state.wallet.balance = fmt(n(state.wallet.balance) - amount);
  state.wallet.feesSaved.totalUsd = fmt(n(state.wallet.feesSaved.totalUsd) + saved);
  state.wallet.protection.checked += 1;
  return tx;
}

function computeWallet(): Wallet {
  const w = state.wallet;
  const upcoming = state.mandates
    .filter((m) => m.status !== 'paused' && m.nextRunAt)
    .sort((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))[0];
  w.nextRun = upcoming
    ? {
        mandateId: upcoming.id,
        label: upcoming.label,
        schedule: upcoming.schedule,
        at: upcoming.nextRunAt!,
        total: upcoming.total,
        status: upcoming.status,
        recipients: upcoming.recipients.map((r) => ({ name: r.name, amount: r.amount })),
      }
    : null;
  w.mandates = { active: state.mandates.filter((m) => m.status === 'active').length, total: state.mandates.length };
  w.paused = state.settings.paused;
  w.savings.target = state.settings.savingsTarget;
  w.unreadEvents = state.activity.filter((e) => !e.read).length;
  return clone(w);
}

const INJECTION = /(ignore|override|disable|bypass|system:|admin|forget (your|the) rules|private key|seed phrase|all (my |the )?(funds|money|balance)|semua (uang|saldo))/i;
const ADDRESS = /0x[0-9a-f]{4,40}/i;

function chat(message: string): ChatResponse {
  // The mock has no model, so the rule reader answers every message. The reader is added
  // once, here, so no path can answer without saying who answered.
  return { ...decide(message), reader: 'rules' };
}

function decide(message: string): Omit<ChatResponse, 'reader'> {
  const text = message.trim();
  const lower = text.toLowerCase();
  const messageId = nextId('m');
  const amountMatch = lower.replace(/0x[0-9a-f]+/gi, ' ').replace(/,/g, '.').match(/(\d+(?:\.\d{1,6})?)/);
  const amount = amountMatch ? Number.parseFloat(amountMatch[1]) : NaN;
  const contact = findContact(lower);
  const addr = text.match(ADDRESS)?.[0];

  if (/what did you block|blocked|diblokir/.test(lower)) {
    const blocked = state.activity.filter((e) => e.type === 'attempt_blocked').slice(0, 3);
    return {
      messageId,
      reply: blocked.length
        ? `I blocked ${state.wallet.protection.blocked} requests this month. The latest one was "${blocked[0].title}". Open Activity to see the reasons.`
        : 'Nothing blocked this month.',
      card: null,
    };
  }

  if (/auto.?send|every month|monthly|tiap bulan|setiap bulan|mandate/.test(lower) && !INJECTION.test(lower)) {
    const card = clone(draftJson.card) as MandateDraftCard;
    card.intentId = nextId('i');
    card.expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    state.intents.set(card.intentId, card);
    return { messageId, reply: draftJson.reply, card };
  }

  const isSend = /send|kirim|transfer|pay|bayar|move|pindah/.test(lower) || !Number.isNaN(amount);
  if (!isSend && !INJECTION.test(lower)) {
    return {
      messageId,
      reply: 'I can send money to your contacts, set up an auto-send, or tell you what I blocked. Try "send 10 USDC to Adik".',
      card: null,
    };
  }

  const reasons: Reason[] = [];
  const known = addr ? allContacts().find((c) => c.address.toLowerCase() === addr.toLowerCase()) : undefined;
  const target = known ?? contact;
  const amt = Number.isNaN(amount) ? (INJECTION.test(lower) ? n(state.wallet.balance) : NaN) : amount;

  if (state.settings.paused) reasons.push({ code: 'AGENT_PAUSED', message: 'Tam is paused. Turn it back on in Settings first.' });
  if (addr && !known) {
    const short = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    const looks = state.contacts.find((c) => c.address.slice(0, 6).toLowerCase() === addr.slice(0, 6).toLowerCase());
    reasons.push(
      looks
        ? { code: 'LOOKALIKE_ADDRESS', message: `This address looks like ${looks.name}'s but is a different wallet.` }
        : { code: 'NOT_IN_ALLOWLIST', message: `${short} is not one of your trusted contacts.` },
    );
  }
  if (INJECTION.test(lower)) reasons.push({ code: 'INJECTION_DETECTED', message: 'The message tried to override your safety rules.' });
  if (!Number.isNaN(amt) && amt > n(state.settings.perTxLimit))
    reasons.push({ code: 'OVER_PER_TX_LIMIT', message: `${fmt(amt)} USDC is above your ${state.settings.perTxLimit} USDC per-transfer limit.` });
  if (!Number.isNaN(amt) && sentToday() + amt > n(state.settings.dailyLimit))
    reasons.push({ code: 'OVER_DAILY_LIMIT', message: `This would go over your ${state.settings.dailyLimit} USDC daily limit.` });

  if (reasons.length) {
    const card: DecisionCard = {
      type: 'decision',
      intentId: nextId('i'),
      decision: 'deny',
      summary: 'No money moved. This request was blocked.',
      action: 'transfer',
      amount: Number.isNaN(amt) ? '0.00' : fmt(amt),
      token: 'USDC',
      recipient: target ? { contactId: target.id, name: target.name, addressShort: target.addressShort } : null,
      rawAddressShort: addr && !known ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : undefined,
      networkFeeUsd: '0.0021',
      savedVsBenchmarkUsd: '0.00',
      reasons,
      expiresAt: null,
      tx: null,
    };
    logBlocked(addr && !known ? 'Transfer to unknown address blocked' : 'Transfer blocked', reasons, card.amount, INJECTION.test(lower) ? text.slice(0, 120) : undefined);
    return { messageId, reply: "I can't do that. Nothing left your wallet.", card };
  }

  if (!target) {
    const name = lower.match(/(?:to|ke|for|buat)\s+([a-z]+)/)?.[1];
    return {
      messageId,
      reply: name ? `I don't have a contact called ${name[0].toUpperCase() + name.slice(1)} yet.` : 'Who should I send it to?',
      card: { type: 'clarify', question: 'Who should get this money?', options: [...state.contacts.map((c) => c.name), 'Add a contact'] },
    };
  }
  if (Number.isNaN(amt)) {
    return {
      messageId,
      reply: `How much should I send to ${target.name}?`,
      card: { type: 'clarify', question: `How much for ${target.name}?`, options: ['10 USDC', '25 USDC', '50 USDC'] },
    };
  }

  const recipient = { contactId: target.id, name: target.name, addressShort: target.addressShort };
  const saved = fmt(amt * 0.0513 - 0.0021);
  if (amt > n(state.settings.confirmAbove)) {
    const card: DecisionCard = {
      type: 'decision',
      intentId: nextId('i'),
      decision: 'confirm',
      summary: `${fmt(amt)} USDC will go to ${target.name} after you confirm.`,
      action: 'transfer',
      amount: fmt(amt),
      token: 'USDC',
      recipient,
      networkFeeUsd: '0.0021',
      savedVsBenchmarkUsd: saved,
      reasons: [{ code: 'ABOVE_CONFIRM_THRESHOLD', message: `Transfers above ${state.settings.confirmAbove} USDC need your confirmation.` }],
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      tx: null,
    };
    state.intents.set(card.intentId, card);
    return { messageId, reply: `That's above your ${state.settings.confirmAbove} USDC confirm threshold, so I need your OK first.`, card };
  }

  const tx = send(target, amt, 'chat');
  return {
    messageId,
    reply: `Done. ${fmt(amt)} USDC is on its way to ${target.name}.`,
    card: {
      type: 'decision',
      intentId: nextId('i'),
      decision: 'allow',
      summary: `${fmt(amt)} USDC is being sent to ${target.name}.`,
      action: 'transfer',
      amount: fmt(amt),
      token: 'USDC',
      recipient,
      networkFeeUsd: '0.0021',
      savedVsBenchmarkUsd: saved,
      reasons: [{ code: 'WITHIN_LIMITS', message: 'Within all your limits, to a trusted contact.' }],
      expiresAt: null,
      tx,
    },
  };
}

function nextMonthly(day: number): string {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 2, 0, 0));
  if (t.getTime() <= Date.now()) t.setUTCMonth(t.getUTCMonth() + 1);
  return t.toISOString();
}

export const mockApi: Api = {
  mode: 'mock',
  async getWallet() {
    await wait();
    settle();
    return computeWallet();
  },
  async chat(message) {
    await wait(700);
    return clone(chat(message));
  },
  async confirm(intentId, approve, pin) {
    await wait(600);
    const intent = state.intents.get(intentId);
    if (!intent) throw new ApiError('NOT_FOUND', 'This request is no longer available.', 404);
    if (!approve) {
      state.intents.delete(intentId);
      return { intentId, status: 'rejected', tx: null, mandate: null } satisfies ConfirmResponse;
    }
    checkPin(pin);
    if (intent.expiresAt && Date.parse(intent.expiresAt) < Date.now()) {
      state.intents.delete(intentId);
      throw new ApiError('INTENT_EXPIRED', 'This request expired. Ask Tam again.', 409);
    }
    state.intents.delete(intentId);
    if (intent.type === 'mandate_draft') {
      const recipients = intent.mandate.recipients.map((r) => {
        const c = allContacts().find((x) => x.id === r.contactId)!;
        return { contactId: c.id, name: c.name, addressShort: c.addressShort, amount: r.amount };
      });
      const m: Mandate = {
        id: nextId('md'),
        label: `Monthly · ${recipients.length} recipients`,
        recipients,
        total: fmt(recipients.reduce((s, r) => s + n(r.amount), 0)),
        schedule: intent.mandate.schedule,
        minBalance: intent.mandate.minBalance,
        status: 'active',
        nextRunAt: nextMonthly(intent.mandate.schedule.dayOfMonth ?? 1),
        lastRun: null,
        consecutivePostpones: 0,
      };
      state.mandates.unshift(m);
      return { intentId, status: 'executed', tx: null, mandate: clone(m) };
    }
    const c = allContacts().find((x) => x.id === intent.recipient?.contactId)!;
    const tx = send(c, n(intent.amount), 'chat');
    return { intentId, status: 'executed', tx: clone(tx), mandate: null };
  },
  async getActivity() {
    await wait();
    settle();
    return { items: clone(state.activity), nextCursor: null, unread: state.activity.filter((e) => !e.read).length };
  },
  async markRead(upTo) {
    await wait(120);
    const idx = state.activity.findIndex((e) => e.id === upTo);
    state.activity.forEach((e, i) => {
      if (idx === -1 || i >= idx) e.read = true;
    });
    return { unread: state.activity.filter((e) => !e.read).length };
  },
  async getMandates() {
    await wait();
    return { items: clone(state.mandates) };
  },
  async patchMandate(id, body, pin) {
    await wait();
    checkPin(pin);
    const m = state.mandates.find((x) => x.id === id);
    if (!m) throw new ApiError('NOT_FOUND', 'Auto-send not found.', 404);
    if (body.status) {
      m.status = body.status;
      if (body.status === 'active') {
        m.consecutivePostpones = 0;
        m.nextRunAt =
          m.schedule.type === 'interval'
            ? new Date(Date.now() + (m.schedule.minutes ?? 2) * 60000).toISOString()
            : nextMonthly(m.schedule.dayOfMonth ?? 1);
      }
      if (body.status === 'paused') {
        state.activity.unshift({ id: nextId('e'), type: 'mandate_paused', at: new Date().toISOString(), read: true, title: `${m.label} paused`, mandateId: m.id });
      }
    }
    return clone(m);
  },
  async getContacts() {
    await wait();
    return { items: clone(state.contacts) };
  },
  async addContact(name, address, pin) {
    await wait();
    if (!name.trim()) throw new ApiError('VALIDATION_ERROR', 'Add a name for this contact.', 400);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address.trim())) throw new ApiError('VALIDATION_ERROR', 'That address should start with 0x and have 42 characters.', 400);
    checkPin(pin);
    const a = address.trim();
    const look = allContacts().find(
      (c) => c.address.toLowerCase() !== a.toLowerCase() && (c.address.slice(0, 6).toLowerCase() === a.slice(0, 6).toLowerCase() || c.address.slice(-4).toLowerCase() === a.slice(-4).toLowerCase()),
    );
    if (look) throw new ApiError('LOOKALIKE_ADDRESS', `This address looks like ${look.name}'s. Check it with them before adding it.`, 409);
    const c: Contact = { id: nextId('c'), name: name.trim(), address: a, addressShort: `${a.slice(0, 6)}…${a.slice(-4)}`, verifiedAt: new Date().toISOString() };
    state.contacts.push(c);
    return clone(c);
  },
  async deleteContact(id, pin) {
    await wait();
    checkPin(pin);
    if (state.mandates.some((m) => m.status !== 'paused' && m.recipients.some((r) => r.contactId === id)))
      throw new ApiError('CONTACT_IN_USE', 'An active auto-send uses this contact. Pause it first.', 409);
    state.contacts = state.contacts.filter((c) => c.id !== id);
  },
  async getSettings() {
    await wait();
    return clone(state.settings);
  },
  async patchSettings(body, pin) {
    await wait();
    const onlyPausing = Object.keys(body).length === 1 && body.paused === true;
    if (!onlyPausing) checkPin(pin);
    const wasPaused = state.settings.paused;
    state.settings = { ...state.settings, ...body };
    if (body.paused !== undefined && body.paused !== wasPaused) {
      state.activity.unshift({
        id: nextId('e'),
        type: body.paused ? 'agent_paused' : 'agent_resumed',
        at: new Date().toISOString(),
        read: true,
        title: body.paused ? 'Tam paused. No automatic transfers will run.' : 'Tam is back on',
      });
    }
    return clone(state.settings);
  },
};
