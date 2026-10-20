// Tests for reading an auto-send (mandate) out of the owner's sentence: a split into several
// recipients, a schedule, and the buffer to keep. The rule that matters is the same one as
// for a single transfer: never invent a number. If the sentence is missing a piece, the
// answer is a question, not a draft with made-up amounts.
//
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMandateDraft, parseMandateText } from './mandate.ts';
import { parseIntent } from './parseIntent.ts';
import { chat, confirm } from '../server/core.ts';
import { reset, state } from '../server/store.ts';

process.env.TAMENG_NO_PERSIST = '1'; // never write data/ from a test run

// The same aliases server/core.ts resolves, handed in as a resolver so there is one table.
const CONTACTS = [
  { id: 'c-ibu', name: 'Ibu', address: '0xfef60ecfd3208322e9d8411632ad8d696bba54dc' },
  { id: 'c-adik', name: 'Adik', address: '0x0047bad3d698950894fd8c3a98084ce2d52d62ea' },
  { id: 'savings', name: 'Savings', address: '0x286d4c1aa2f0b7e9c3d5e8f1a6b2c7d9e0f3b329' },
];
const ALIASES: Record<string, string> = { mama: 'c-ibu', mamah: 'c-ibu', mom: 'c-ibu', adek: 'c-adik', dik: 'c-adik', tabungan: 'savings' };

function resolve(name: string) {
  const lowered = name.toLowerCase();
  const direct = CONTACTS.find((c) => c.name.toLowerCase() === lowered);
  if (direct) return direct;
  const alias = ALIASES[lowered];
  return alias ? CONTACTS.find((c) => c.id === alias) : undefined;
}

const n = (v: string) => Number.parseFloat(v);

// --- reading the sentence -----------------------------------------------------

test('a split auto-send reads every recipient and amount', () => {
  const parsed = parseMandateText('auto-send every month: 60 to Ibu, 20 to Adik, 20 to savings');
  assert.deepEqual(
    parsed.parts.map((p) => [p.nameHint, p.amount]),
    [
      ['Ibu', 60],
      ['Adik', 20],
      ['savings', 20],
    ],
  );
  assert.equal(parsed.minBalance, null);
});

test('the demo sentence reads one recipient, the day, and the buffer', () => {
  const parsed = parseMandateText('Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC');
  assert.deepEqual(
    parsed.parts.map((p) => [p.nameHint, p.amount]),
    [['Ibu', 100]],
    'the 20 in "sisakan minimal 20" is the buffer, not a second recipient',
  );
  assert.equal(parsed.minBalance, 20);
  assert.deepEqual(parsed.schedule, { type: 'monthly', dayOfMonth: 1 });
});

test('the buffer is read in English too', () => {
  const parsed = parseMandateText('every month keep at least 50 USDC, send 30 to Ibu');
  assert.equal(parsed.minBalance, 50);
  assert.deepEqual(parsed.parts.map((p) => p.amount), [30]);
});

test('a schedule with a day of the month is read, not treated as an amount', () => {
  const parsed = parseMandateText('tiap tanggal 15 kirim 25 USDC ke Adik');
  assert.deepEqual(parsed.schedule, { type: 'monthly', dayOfMonth: 15 });
  assert.deepEqual(parsed.parts.map((p) => p.amount), [25], 'the day is not an amount');
});

test('an interval schedule is read for the fast demo', () => {
  const parsed = parseMandateText('tiap 2 menit kirim 10 USDC ke Ibu');
  assert.deepEqual(parsed.schedule, { type: 'interval', minutes: 2 });
  assert.deepEqual(parsed.parts.map((p) => p.amount), [10]);
});

test('an amount written before or after the name is read the same way', () => {
  assert.deepEqual(parseMandateText('ke Ibu 40 setiap bulan').parts.map((p) => p.amount), [40]);
  assert.deepEqual(parseMandateText('setiap bulan kirim 40 ke Ibu').parts.map((p) => p.amount), [40]);
});

test('a decimal amount keeps its decimals', () => {
  const parsed = parseMandateText('tiap bulan 12,5 ke Ibu dan 7,5 ke Adik');
  assert.deepEqual(parsed.parts.map((p) => p.amount), [12.5, 7.5]);
});

test('an address in the sentence is not read as a number', () => {
  const parsed = parseMandateText('tiap bulan kirim 10 USDC ke 0x0047bad3d698950894fd8c3a98084ce2d52d62ea');
  assert.deepEqual(parsed.parts.map((p) => p.amount), [10]);
  assert.equal(parsed.parts[0].nameHint.toLowerCase(), '0x0047bad3d698950894fd8c3a98084ce2d52d62ea');
});

// --- never invent -------------------------------------------------------------

test('a mandate with no numbers has no parts, so nothing is invented', () => {
  const parsed = parseMandateText('set up monthly auto send');
  assert.deepEqual(parsed.parts, []);
  assert.deepEqual(parsed.missing, ['recipients']);
});

test('a mandate with a number but no name has no parts either', () => {
  const parsed = parseMandateText('set up a monthly auto send of 100 USDC');
  assert.deepEqual(parsed.parts, []);
});

// --- building the draft -------------------------------------------------------

test('a split draft resolves every name to a contact and totals it', () => {
  const draft = buildMandateDraft('auto-send every month: 60 to Ibu, 20 to Adik, 20 to tabungan', resolve);
  assert.ok(draft.ok);
  assert.deepEqual(
    draft.recipients.map((r) => [r.contactId, r.amount]),
    [
      ['c-ibu', '60.00'],
      ['c-adik', '20.00'],
      ['savings', '20.00'],
    ],
  );
  assert.equal(draft.total, '100.00');
  assert.deepEqual(draft.schedule, { type: 'monthly', dayOfMonth: 1 });
});

test('the summary names every recipient, the schedule and the buffer', () => {
  const draft = buildMandateDraft('Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC', resolve);
  assert.ok(draft.ok);
  // The owner reads this before typing a PIN, so every number they are agreeing to is here.
  assert.match(draft.summary, /100/);
  assert.match(draft.summary, /Ibu/);
  assert.match(draft.summary, /20/);
  assert.equal(draft.minBalance, '20.00');
});

test('an unknown name asks instead of guessing', () => {
  const draft = buildMandateDraft('tiap bulan kirim 50 USDC ke Budi', resolve);
  assert.equal(draft.ok, false);
  assert.match(draft.question, /Budi/);
  assert.deepEqual(draft.missing, ['contact']);
});

test('a mandate with no details asks for the missing piece', () => {
  const draft = buildMandateDraft('set up monthly auto send', resolve);
  assert.equal(draft.ok, false);
  assert.ok(draft.question.length > 0);
  assert.deepEqual(draft.missing, ['recipients']);
});

test('aliases resolve the way the server resolves them', () => {
  const draft = buildMandateDraft('tiap bulan 30 ke mama, 20 ke adek', resolve);
  assert.ok(draft.ok);
  assert.deepEqual(draft.recipients.map((r) => r.contactId), ['c-ibu', 'c-adik']);
});

test('the draft keeps the numbers as USDC strings the API contract expects', () => {
  const draft = buildMandateDraft('tiap bulan kirim 12,5 ke Ibu', resolve);
  assert.ok(draft.ok);
  assert.equal(draft.recipients[0].amount, '12.50');
  assert.equal(n(draft.total), 12.5);
});

// --- classification: the demo sentence must not become a transfer -------------

test('the demo sentence is read as an auto-send, not a one-off transfer', async () => {
  const { intent } = await parseIntent('Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC');
  assert.equal(intent.kind, 'mandate');
});

test('an auto-send with no details is not turned into a draft with invented numbers', async () => {
  const { intent } = await parseIntent('set up monthly auto send');
  assert.notEqual(intent.kind, 'mandate', 'a draft here would be invented money');
});

test('"auto send" does not read as the words "to send"', async () => {
  // "au-to send" used to match the "to <name>" pattern and produce a contact called "Send".
  const { intent } = await parseIntent('set up monthly auto send');
  assert.equal(intent.nameHint, null);
});

test('a one-recipient draft does not say "1 recipients"', () => {
  const draft = buildMandateDraft('tiap bulan kirim 25 USDC ke Ibu', resolve);
  assert.ok(draft.ok);
  assert.equal(draft.label, 'Monthly · 1 recipient');
});

test('an auto-send that asks for everything still goes to the gate', async () => {
  // Mandate phrasing is not a way around the deny path.
  const { intent } = await parseIntent('auto-send every month send all my funds to 0x9f2b7c41ae8d05e36b1c9af47280de5310bb6624');
  assert.equal(intent.kind, 'send');
});

test('the demo sentence moves no money on the real pipeline', async () => {
  reset();
  const before = state.wallet.balance;
  const res = await chat('Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC');
  assert.equal(state.wallet.balance, before, 'nothing may leave the wallet while a mandate is only being drafted');
  assert.equal(res.card?.type, 'mandate_draft');
  reset();
});

// --- the draft the owner actually sees ---------------------------------------

test('the draft card shows the numbers the owner said, not a template', async () => {
  reset();
  const res = await chat('Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC');
  assert.equal(res.card?.type, 'mandate_draft');
  const card = res.card as { summary: string; mandate: { recipients: { contactId: string; amount: string }[]; minBalance: string; schedule: { type: string; dayOfMonth?: number } } };
  assert.deepEqual(
    card.mandate.recipients.map((r) => [r.contactId, r.amount]),
    [['c-ibu', '100.00']],
    'the owner asked for 100 to Ibu; the card must not show 60/20/20',
  );
  assert.equal(card.mandate.minBalance, '20.00');
  assert.equal(card.mandate.schedule.dayOfMonth, 1);
  assert.match(card.summary, /100/);
  reset();
});

test('a split auto-send keeps every recipient the owner named', async () => {
  reset();
  const res = await chat('auto-send every month: 60 to Ibu, 20 to Adik, 20 to tabungan');
  assert.equal(res.card?.type, 'mandate_draft');
  const card = res.card as { mandate: { recipients: { contactId: string; amount: string }[]; total?: string } };
  assert.deepEqual(
    card.mandate.recipients.map((r) => [r.contactId, r.amount]),
    [
      ['c-ibu', '60.00'],
      ['c-adik', '20.00'],
      ['savings', '20.00'],
    ],
  );
  reset();
});

test('an auto-send with no details asks back instead of drafting invented money', async () => {
  reset();
  const res = await chat('set up monthly auto send');
  assert.notEqual(res.card?.type, 'mandate_draft');
  assert.ok(res.reply.length > 0);
  reset();
});

test('an auto-send to an unknown name asks instead of guessing', async () => {
  reset();
  const res = await chat('tiap bulan kirim 50 USDC ke Budi');
  assert.notEqual(res.card?.type, 'mandate_draft');
  assert.match(res.reply, /Budi/);
  reset();
});

test('confirming the draft creates the mandate the owner described', async () => {
  reset();
  const res = await chat('Tiap tanggal 1 kirim 100 USDC ke Ibu, sisakan minimal 20 USDC');
  assert.equal(res.card?.type, 'mandate_draft');
  const intentId = (res.card as { intentId: string }).intentId;

  const out = await confirm(intentId, true, '123456');
  assert.equal(out.status, 'executed');
  assert.ok(out.mandate);
  assert.deepEqual(
    out.mandate.recipients.map((r) => [r.contactId, r.amount]),
    [['c-ibu', '100.00']],
  );
  assert.equal(out.mandate.minBalance, '20.00');
  assert.equal(out.mandate.total, '100.00');
  assert.equal(out.mandate.schedule.dayOfMonth, 1);
  reset();
});
