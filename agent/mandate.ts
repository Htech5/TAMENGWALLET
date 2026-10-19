// Reads an auto-send (mandate) out of the owner's sentence.
//
// The owner writes one line — "Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC"
// — and this turns it into the pieces the draft card needs: who gets how much, on what
// schedule, and how much buffer to keep. The same rule as for a single transfer applies here
// and it is the whole point of the module: never invent a number. When the sentence is
// missing a piece, the answer is a question, not a draft with made-up amounts. A draft with
// invented numbers is worse than a clarify card, because the owner can confirm it with a PIN
// and start sending money they never asked to send.
//
// This module only reads. Limits, allowlist, confirmation and the final gate stay in
// policy/checkPolicy(), and the scheduler and storage stay in server/core.ts.

import type { Schedule } from '../app/src/lib/types.ts';

export interface MandatePart {
  /** The name exactly as the owner wrote it, still unresolved to a contact. */
  nameHint: string;
  amount: number;
}

export interface ParsedMandateText {
  parts: MandatePart[];
  /** Monthly on a day, or an interval for the fast demo. Null when the sentence said nothing. */
  schedule: Schedule | null;
  /** The balance floor the owner asked to keep. Null when they did not ask. */
  minBalance: number | null;
  missing: ('recipients' | 'contact')[];
}

export interface MandateRecipient {
  contactId: string;
  name: string;
  /** USDC as the API contract writes it: two decimals, string. */
  amount: string;
}

export interface MandateDraft {
  ok: true;
  label: string;
  recipients: MandateRecipient[];
  total: string;
  schedule: Schedule;
  minBalance: string;
  /** Read by the owner before they type a PIN, so every number is spelled out. */
  summary: string;
}

export interface MandateNeeds {
  ok: false;
  question: string;
  missing: ('recipients' | 'contact')[];
}

export type MandateResult = MandateDraft | MandateNeeds;

export type ContactResolver = (name: string) => { id: string; name: string } | undefined;

const fmt = (v: number) => v.toFixed(2);

// A number the owner could have written: 10, 12.5, 12,5. An address is never a number.
const AMOUNT = String.raw`(\d+(?:[.,]\d{1,6})?)`;
const ADDRESS = /0x[0-9a-zA-Z]{4,40}/;

// Words that are never a recipient name.
const NOT_A_NAME = new Set([
  'usdc', 'usd', 'dollar', 'dollars', 'token',
  'ke', 'to', 'for', 'buat', 'kepada', 'untuk', 'pada', 'dari', 'from',
  'kirim', 'kirimkan', 'transfer', 'bayar', 'pay', 'send', 'move', 'pindahkan',
  'auto', 'autosend', 'mandate', 'rutin', 'terjadwal', 'scheduled', 'schedule', 'set', 'up', 'a', 'an', 'of',
  'tiap', 'setiap', 'per', 'every', 'each', 'bulan', 'month', 'monthly', 'tanggal', 'tgl', 'hari', 'day',
  'minggu', 'week', 'weekly', 'tahun', 'year', 'yearly', 'menit', 'minute', 'minutes', 'min',
  'sisakan', 'sisa', 'simpan', 'keep', 'at', 'least', 'minimal', 'minimum', 'min.', 'saldo', 'balance',
  'dan', 'and', 'juga', 'also', 'the', 'my', 'saya', 'aku', 'ku', 'nya',
]);

function toNumber(raw: string): number {
  return Number.parseFloat(raw.replace(',', '.'));
}

/** The balance floor: "sisakan minimal 20", "keep at least 50", "saldo minimum 30". */
function readMinBalance(text: string): { value: number | null; rest: string } {
  const patterns = [
    new RegExp(String.raw`(?:sisakan|sisa|simpan|keep|leave)\s+(?:minimal|min\.?|at\s+least|sedikitnya)?\s*` + AMOUNT + String.raw`\s*(?:usdc|usd)?`, 'i'),
    new RegExp(String.raw`(?:saldo|balance)\s+(?:minimal|minimum|min\.?)\s*` + AMOUNT, 'i'),
    new RegExp(String.raw`min(?:imum)?\s+(?:saldo|balance)\s*` + AMOUNT, 'i'),
  ];
  for (const re of patterns) {
    const hit = text.match(re);
    if (hit) return { value: toNumber(hit[1]), rest: text.replace(hit[0], ' ') };
  }
  return { value: null, rest: text };
}

/** The schedule: a day of the month, or an interval for the fast demo. */
function readSchedule(text: string): { schedule: Schedule | null; rest: string } {
  const interval = text.match(new RegExp(String.raw`(?:tiap|setiap|every|per)\s+` + AMOUNT + String.raw`\s*(menit|minute|minutes|min)\b`, 'i'));
  if (interval) {
    return {
      schedule: { type: 'interval', minutes: Math.max(1, Math.round(toNumber(interval[1]))) },
      rest: text.replace(interval[0], ' '),
    };
  }

  const day = text.match(new RegExp(String.raw`(?:tanggal|tgl\.?|on\s+the)\s*` + AMOUNT + String.raw`(?:st|nd|rd|th)?`, 'i'));
  if (day) {
    const value = Math.round(toNumber(day[1]));
    return { schedule: { type: 'monthly', dayOfMonth: Math.min(Math.max(value, 1), 28) }, rest: text.replace(day[0], ' ') };
  }

  // Monthly with no day named: the 1st, which is what server/core.ts already defaults to.
  // The draft summary spells the day out, so the owner still sees what they are confirming.
  if (/\b(every\s+month|monthly|per\s+bulan|tiap\s+bulan|setiap\s+bulan|auto.?send|autosend|mandate|rutin|terjadwal|scheduled)\b/i.test(text)) {
    return { schedule: { type: 'monthly', dayOfMonth: 1 }, rest: text };
  }
  return { schedule: null, rest: text };
}

/** The last word in a fragment that could be a recipient name. */
function readNameHint(fragment: string): string | null {
  const words = fragment.match(/[0-9A-Za-z_.'-]+/g) ?? [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const word = words[i];
    if (word.length < 2) continue;
    if (/^\d/.test(word)) continue;
    if (NOT_A_NAME.has(word.toLowerCase())) continue;
    return word;
  }
  return null;
}

/**
 * Reads the sentence without knowing the contact list. parseIntent uses this to decide
 * whether the owner actually described a mandate, so an empty request never becomes a draft.
 */
export function parseMandateText(text: string): ParsedMandateText {
  const raw = (text ?? '').trim();
  if (!raw) return { parts: [], schedule: null, minBalance: null, missing: ['recipients'] };

  const balance = readMinBalance(raw);
  const timing = readSchedule(balance.rest);

  // Fragments split on a comma, a semicolon, or "dan"/"and": one recipient per fragment.
  // A decimal comma is folded to a dot first, so "12,5 ke Ibu" stays one amount instead of
  // becoming "12" and "5 ke Ibu". "60 to Ibu, 20 to Adik" has a space after the comma, so it
  // still splits.
  const fragments = timing.rest.replace(/(\d),(\d)/g, '$1.$2').split(/[,;]|\bdan\b|\band\b/i);

  const parts: MandatePart[] = [];
  for (const fragment of fragments) {
    const address = fragment.match(ADDRESS)?.[0] ?? null;
    const withoutAddress = address ? fragment.replace(address, ' ') : fragment;
    const number = withoutAddress.match(/\d+(?:[.,]\d{1,6})?/);
    if (!number) continue;

    const amount = toNumber(number[0]);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const nameHint = address ?? readNameHint(withoutAddress.replace(number[0], ' '));
    if (!nameHint) continue; // a number with nobody attached is not a recipient

    parts.push({ nameHint, amount });
  }

  return {
    parts,
    schedule: timing.schedule,
    minBalance: balance.value,
    missing: parts.length ? [] : ['recipients'],
  };
}

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return day + 'th';
  if (day % 10 === 1) return day + 'st';
  if (day % 10 === 2) return day + 'nd';
  if (day % 10 === 3) return day + 'rd';
  return day + 'th';
}

function scheduleWords(schedule: Schedule): string {
  if (schedule.type === 'interval') {
    const minutes = schedule.minutes ?? 2;
    return 'Every ' + minutes + (minutes === 1 ? ' minute' : ' minutes');
  }
  return 'Every month on the ' + ordinal(schedule.dayOfMonth ?? 1);
}

/**
 * Turns the sentence into the draft the confirm card shows. Names are resolved by the caller,
 * so server/core.ts keeps its own alias table and there is only one of them.
 */
export function buildMandateDraft(text: string, resolve: ContactResolver): MandateResult {
  const parsed = parseMandateText(text);

  if (parsed.parts.length === 0) {
    return {
      ok: false,
      question: 'An auto-send needs a recipient and an amount. Who should get how much, and how often?',
      missing: ['recipients'],
    };
  }

  // One entry per contact: the same name twice is one recipient, not two transfers.
  const merged = new Map<string, MandateRecipient>();
  for (const part of parsed.parts) {
    const contact = resolve(part.nameHint);
    if (!contact) {
      return {
        ok: false,
        question: "I don't have a contact called " + part.nameHint[0].toUpperCase() + part.nameHint.slice(1) + ' yet.',
        missing: ['contact'],
      };
    }
    const existing = merged.get(contact.id);
    const total = (existing ? Number.parseFloat(existing.amount) : 0) + part.amount;
    merged.set(contact.id, { contactId: contact.id, name: contact.name, amount: fmt(total) });
  }

  const recipients = [...merged.values()];
  const total = recipients.reduce((sum, r) => sum + Number.parseFloat(r.amount), 0);
  const schedule = parsed.schedule ?? { type: 'monthly' as const, dayOfMonth: 1 };
  const minBalance = parsed.minBalance ?? 0;

  const who = recipients.map((r) => r.amount + ' to ' + r.name).join(', ');
  const buffer = minBalance > 0 ? ' Keeps at least ' + fmt(minBalance) + ' USDC.' : '';

  return {
    ok: true,
    label:
      (schedule.type === 'interval' ? 'Every ' + (schedule.minutes ?? 2) + ' min' : 'Monthly') +
      ' · ' +
      recipients.length +
      (recipients.length === 1 ? ' recipient' : ' recipients'),
    recipients,
    total: fmt(total),
    schedule,
    minBalance: fmt(minBalance),
    summary: scheduleWords(schedule) + ': ' + who + '.' + buffer,
  };
}
