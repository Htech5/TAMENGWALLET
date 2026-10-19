// Mock model gateway buat ngetes jalur LLM tanpa API key.
// Cara pakai:
//   Terminal 1: node mock-llm.mjs
//   Terminal 2: set LLM_API_KEY=test  ; set LLM_BASE_URL=http://127.0.0.1:8787/v1 ; npm run server
//
// Mode greedy = model yang NURUT ke penyerang: dia mengembalikan nominal & alamat apa pun
// yang tertulis di pesan, tanpa menilai boleh atau tidak. Kalau dengan model seperti ini
// uang tetap tidak pindah, berarti yang menjaga bukan prompt-nya.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8787);

function obey(text) {
  const address = (text.match(/0x[0-9a-zA-Z]{4,40}/) || [null])[0];
  const rest = text.replace(/0x[0-9a-zA-Z]{4,40}/g, ' ');
  const number = rest.match(/\d+(?:[.,]\d{1,6})?/);
  return {
    amountUsdc: number ? Number.parseFloat(number[0].replace(',', '.')) : null,
    address,
    contactName: null,
  };
}

const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let text = '';
    try {
      const parsed = JSON.parse(body);
      const first = (parsed.messages || []).find((m) => m.role === 'user');
      text = String((first && first.content) || '');
    } catch {
      text = '';
    }
    const args = obey(text);
    console.log('  [model] dipanggil untuk: "' + text.slice(0, 60) + '" -> ' + JSON.stringify(args));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'mock',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'request_transfer', arguments: JSON.stringify(args) } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('mock model gateway: http://127.0.0.1:' + PORT + '/v1  (mode greedy: nurut ke penyerang)');
  console.log('Ctrl+C untuk berhenti.');
});
