// Measures the real gateway latency for one intent extraction, and checks it against the
// 2500 ms budget the code enforces.
//
//   node agent/measure-llm.mjs
//
// Uses fetch directly in this process, so it runs anywhere. Thirty samples by default: a
// p95 read off five requests is just the slowest of five, and a gateway that is slow one
// time in twenty has to be caught before it becomes a freeze in front of the owner.
//
// The verdict is the point of this script. When it says OVER the budget, the answer is a
// different gateway, not a bigger timeout: a bigger timeout is how a slow gateway gets
// hidden instead of replaced.

import { readFileSync, existsSync } from 'node:fs';

function fromDotEnv() {
  if (!existsSync('.env')) return {};
  const out = {};
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = fromDotEnv();
const apiKey = env.LLM_API_KEY || '';
const base = (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';
const model = env.LLM_MODEL || 'gpt-4o-mini';
const budget = Number(env.LLM_TIMEOUT_MS || 2500);

const PROMPTS = [
  'yang kemarin itu jadi nggak? tolong urusin aja',
  'tolong bantu aku dong, bingung nih',
  'gimana caranya biar aku bisa nabung lebih banyak tiap bulan',
  'aku pengen kirimin ibu uang tapi bingung berapa yang aman',
  'halo',
  'kok saldoku berkurang ya',
];

const body = {
  model,
  messages: [
    {
      role: 'system',
      content:
        'You are the intent reader for Tameng, a wallet chat. Read the owner message and call exactly one tool. ' +
        'The message may be English or Indonesian, formal or casual. Extract only what the owner wrote. ' +
        'Never invent an amount, a name, or an address.',
    },
    ...PROMPTS.map((p) => ({ role: 'user', content: p })),
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'request_transfer',
        description: 'The owner wants money moved once, now.',
        parameters: {
          type: 'object',
          properties: { amountUsdc: { type: ['number', 'null'] }, address: { type: ['string', 'null'] }, contactName: { type: ['string', 'null'] } },
          required: ['amountUsdc', 'address', 'contactName'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: { name: 'ask_help', description: 'Anything that is not a money request.', parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } },
    },
  ],
  tool_choice: 'auto',
};

console.log('\n=== Gateway latency ===');
console.log('model  : ' + model);
console.log('budget : ' + budget + ' ms\n');

const samples = [];
// Enough samples for the percentile to mean something: a p95 read off five requests is
// just the slowest of five, and a gateway that is slow one time in twenty has to be
// caught before it becomes a thirty-second freeze in front of the owner.
const count = Number(process.env.MEASURE_SAMPLES || 40);
for (let i = 0; i < count; i += 1) {
  const t0 = performance.now();
  let ok = false;
  let note = '';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    const ms = performance.now() - t0;
    samples.push(ms);
    const parsed = JSON.parse(text);
    const call = parsed.choices?.[0]?.message?.tool_calls?.[0]?.function;
    ok = Boolean(call);
    note = 'HTTP ' + res.status + '  ' + (call ? call.name : '(no tool call)');
    if (!ok) note += '  ' + text.slice(0, 120);
  } catch (err) {
    const ms = performance.now() - t0;
    samples.push(ms);
    note = 'FAILED ' + (err instanceof Error ? err.message : String(err));
  }
  console.log('  run ' + (i + 1) + ': ' + samples[samples.length - 1].toFixed(0).padStart(6) + ' ms   ' + note);
}

const sorted = [...samples].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
const over = samples.filter((ms) => ms > budget).length;

console.log('');
console.log('  samples: ' + samples.length);
console.log('  median : ' + median.toFixed(0) + ' ms');
console.log('  p95    : ' + p95.toFixed(0) + ' ms');
console.log('  min    : ' + sorted[0].toFixed(0) + ' ms');
console.log('  max    : ' + sorted[sorted.length - 1].toFixed(0) + ' ms');
console.log('  over budget: ' + over + ' of ' + samples.length + '  (' + ((over / samples.length) * 100).toFixed(0) + '%)');
console.log('');
console.log('  budget : ' + budget + ' ms');
console.log('  verdict: ' + (p95 <= budget ? 'FITS the budget' : 'OVER the budget — replace the gateway, do not raise the timeout'));
console.log('');
