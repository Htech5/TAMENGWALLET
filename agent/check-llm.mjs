// Cek apakah sebuah gateway LLM cukup untuk dipakai agent/parseIntent.ts.
//
// Cara pakai (dari root repo):
//   node agent/check-llm.mjs
// atau dengan nilai eksplisit:
//   node agent/check-llm.mjs --base https://api.contoh.com/v1 --model nama-model --key sk-xxx
//
// Kalau LLM_API_KEY / LLM_BASE_URL / LLM_MODEL ada di .env, skrip ini memakainya.
//
// Yang diperiksa bukan "bagus atau tidak" modelnya, tapi apakah bentuk responsnya cocok:
// parseIntent butuh model yang menjawab lewat TOOL CALL, bukan teks bebas. Kalau tidak,
// parser akan menganggap tidak ada jawaban dan diam-diam jatuh ke rule reader.

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

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};

const dotenv = fromDotEnv();
const apiKey = flag('key') || process.env.LLM_API_KEY || dotenv.LLM_API_KEY || '';
const baseRaw = flag('base') || process.env.LLM_BASE_URL || dotenv.LLM_BASE_URL || 'https://api.openai.com/v1';
const model = flag('model') || process.env.LLM_MODEL || dotenv.LLM_MODEL || 'gpt-4o-mini';
const base = baseRaw.trim().replace(/\/+$/, '');
const url = /\/chat\/completions$/i.test(base) ? base : base + '/chat/completions';

const ok = (s) => console.log('  \u2714 ' + s);
const bad = (s) => console.log('  \u2716 ' + s);
const info = (s) => console.log('    ' + s);

console.log('');
console.log('Gateway : ' + base);
console.log('Model   : ' + model);
console.log('Endpoint: ' + url);
console.log('API key : ' + (apiKey ? 'ada (' + apiKey.length + ' karakter, tidak dicetak)' : 'KOSONG'));
console.log('');

if (!apiKey) {
  bad('LLM_API_KEY kosong. Tanpa key, parseIntent akan selalu memakai rule reader.');
  console.log('');
  console.log('Isi dulu di .env:  LLM_API_KEY=...');
  process.exit(1);
}

// Bentuk request yang PERSIS sama dengan yang dikirim parseIntent.
const body = {
  model,
  messages: [
    { role: 'system', content: 'You are an intent reader. Call exactly one tool.' },
    { role: 'user', content: 'send 10 USDC to Adik' },
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'request_transfer',
        description: 'The owner wants money moved once, now.',
        parameters: {
          type: 'object',
          properties: {
            amountUsdc: { type: ['number', 'null'], description: 'Amount the owner stated.' },
            address: { type: ['string', 'null'], description: 'Recipient address as written.' },
            contactName: { type: ['string', 'null'], description: 'Recipient name as written.' },
          },
          required: ['amountUsdc', 'address', 'contactName'],
          additionalProperties: false,
        },
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
  ],
  tool_choice: 'auto',
};

let res;
let raw;
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  raw = await res.text();
} catch (err) {
  bad('Tidak bisa menghubungi endpoint: ' + (err instanceof Error ? err.message : String(err)));
  console.log('');
  info('Periksa: URL benar? butuh internet/VPN? port terbuka?');
  process.exit(1);
}

console.log('HTTP ' + res.status);
if (!res.ok) {
  bad('Endpoint menolak request.');
  info(raw.slice(0, 600));
  console.log('');
  info('Kalau 401/403: key salah atau belum aktif.');
  info('Kalau 404: URL base salah (biasanya harus diakhiri /v1).');
  info('Kalau 400 dan menyebut "tools"/"tool_choice": provider TIDAK mendukung tool calling.');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  bad('Respons bukan JSON.');
  info(raw.slice(0, 300));
  process.exit(1);
}
ok('Respons JSON valid.');

const message = parsed.choices?.[0]?.message;
if (!message) {
  bad('Tidak ada choices[0].message di respons. Bentuk respons tidak cocok.');
  info(JSON.stringify(parsed).slice(0, 400));
  process.exit(1);
}

const calls = Array.isArray(message.tool_calls)
  ? message.tool_calls
  : message.function_call
    ? [{ function: message.function_call }]
    : [];

if (calls.length === 0) {
  bad('Model TIDAK mengembalikan tool call.');
  info('Isi content: ' + JSON.stringify(message.content ?? null).slice(0, 300));
  console.log('');
  info('Artinya: provider ini bisa menjawab, tapi tidak lewat tool calling.');
  info('parseIntent akan menganggap tidak ada jawaban dan memakai rule reader.');
  info('Butuh provider yang mendukung function calling / tools.');
  process.exit(2);
}

ok('Model mengembalikan tool call.');

const fn = calls[0].function ?? {};
console.log('');
console.log('Tool yang dipilih : ' + (fn.name ?? '(tanpa nama)'));
let fnArgs = fn.arguments;
if (typeof fnArgs === 'string') {
  try {
    fnArgs = JSON.parse(fnArgs);
  } catch {
    bad('arguments bukan JSON valid: ' + String(fn.arguments).slice(0, 200));
    process.exit(2);
  }
}
console.log('Arguments         : ' + JSON.stringify(fnArgs));

const known = ['request_transfer', 'create_mandate', 'explain_blocked', 'ask_help'];
if (!known.includes(fn.name)) {
  bad('Nama tool "' + fn.name + '" tidak dikenal parseIntent (kenal: ' + known.join(', ') + ').');
  info('Sebagian provider mengganti nama tool; cek dukungan nama kustom.');
  process.exit(2);
}
ok('Nama tool dikenal parseIntent.');

if (!fnArgs || typeof fnArgs !== 'object' || !('amountUsdc' in fnArgs)) {
  bad('Arguments tidak memuat field amountUsdc. Skema tool tidak dipatuhi.');
  process.exit(2);
}
ok('Field amountUsdc ada di arguments.');

console.log('');
console.log('KESIMPULAN: gateway ini CUKUP untuk agent/parseIntent.ts.');
console.log('');
console.log('Pakai di .env:');
console.log('  LLM_API_KEY=...');
console.log('  LLM_BASE_URL=' + base);
console.log('  LLM_MODEL=' + model);
