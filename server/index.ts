// HTTP layer: routing, device auth, idempotency, rate limit, error shape, scheduler tick.
// Everything that decides anything lives in core.ts. Start with: npm run server
//
// Node runs this TypeScript directly (>= 22.18, type stripping). No build step, no framework.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

import type { Settings } from '../app/src/lib/types.ts';
import * as core from './core.ts';
import { ApiError } from './core.ts';
import { save, state } from './store.ts';

const PORT = Number(process.env.PORT ?? 3000);
const SCHEDULER_MS = 30_000;
const RATE_LIMIT = 240; // requests per minute per IP
const MAX_BODY = 64 * 1024;

const hits = new Map<string, { count: number; until: number }>();

function rateLimit(ip: string): void {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.until < now) {
    hits.set(ip, { count: 1, until: now + 60_000 });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) throw new ApiError('RATE_LIMITED', 'Too many requests. Slow down a moment.', 429);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reject(new ApiError('VALIDATION_ERROR', 'That request is too large.', 400));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ApiError('VALIDATION_ERROR', 'The request body is not valid JSON.', 400));
      }
    });
    req.on('error', () => reject(new ApiError('VALIDATION_ERROR', 'The request body could not be read.', 400)));
  });
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (status === 204 || body === undefined) {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json' });
  res.end(payload);
}

function corsHeaders(): Record<string, string> {
  // The app is a native client, but Expo web and the dev tools call this from a browser.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Pin, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

/** Same Idempotency-Key, same answer: a retried POST never sends money twice. */
function idempotent<T>(key: string | undefined, run: () => T): T {
  if (!key) return run();
  const cached = state.idempotency[key];
  if (cached !== undefined) return cached as T;
  const result = run();
  state.idempotency[key] = result ?? null;
  const keys = Object.keys(state.idempotency);
  if (keys.length > 500) delete state.idempotency[keys[0]];
  save();
  return result;
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method ?? 'GET';
  const pin = (req.headers['x-pin'] as string | undefined)?.trim();
  const key = req.headers['idempotency-key'] as string | undefined;

  if (path === '/health') return send(res, 200, { ok: true, mode: 'live', mandates: state.mandates.length });

  core.checkToken(req.headers.authorization);

  const seg = path.split('/').filter(Boolean);
  const body = method === 'GET' || method === 'DELETE' ? {} : ((await readBody(req)) as Record<string, unknown>);

  // /wallet
  if (path === '/wallet' && method === 'GET') return send(res, 200, core.getWallet());

  // /chat
  if (path === '/chat' && method === 'POST') {
    const message = String(body.message ?? '');
    if (!message.trim()) throw new ApiError('VALIDATION_ERROR', 'Type a message first.', 400);
    // FR-15: the caller may declare where the text came from. Anything but "user" is EXTERNAL.
    const declared = String(body.source ?? 'user').toLowerCase() === 'user' ? 'USER' : 'EXTERNAL';
    return send(res, 200, idempotent(key, () => core.chat(message, declared)));
  }

  // /confirm/:intentId
  if (seg[0] === 'confirm' && seg.length === 2 && method === 'POST') {
    const approve = body.approve !== false;
    return send(res, 200, idempotent(key, () => core.confirm(decodeURIComponent(seg[1]), approve, pin)));
  }

  // /activity
  if (path === '/activity' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 100);
    return send(res, 200, core.getActivity(url.searchParams.get('cursor') ?? undefined, limit));
  }
  if (path === '/activity/read' && method === 'POST') {
    return send(res, 200, core.markRead(String(body.upTo ?? '')));
  }

  // /mandates
  if (path === '/mandates' && method === 'GET') return send(res, 200, core.getMandates());
  if (path === '/mandates' && method === 'POST') {
    core.checkPin(pin);
    return send(res, 200, idempotent(key, () => core.createMandate(body as never)));
  }
  if (seg[0] === 'mandates' && seg.length === 2) {
    const id = decodeURIComponent(seg[1]);
    if (method === 'PATCH') {
      core.checkPin(pin);
      return send(res, 200, core.patchMandate(id, body as never));
    }
    if (method === 'DELETE') {
      core.checkPin(pin);
      core.deleteMandate(id);
      return send(res, 204);
    }
  }

  // /contacts
  if (path === '/contacts' && method === 'GET') return send(res, 200, core.getContacts());
  if (path === '/contacts' && method === 'POST') {
    core.checkPin(pin);
    return send(res, 200, idempotent(key, () => core.addContact(String(body.name ?? ''), String(body.address ?? ''))));
  }
  if (seg[0] === 'contacts' && seg.length === 2 && method === 'DELETE') {
    core.checkPin(pin);
    core.deleteContact(decodeURIComponent(seg[1]));
    return send(res, 204);
  }

  // /settings
  if (path === '/settings' && method === 'GET') return send(res, 200, core.getSettings());
  if (path === '/settings' && method === 'PATCH') {
    const patch = body as Partial<Settings>;
    if (core.settingsNeedPin(patch)) core.checkPin(pin);
    return send(res, 200, core.patchSettings(patch));
  }

  throw new ApiError('NOT_FOUND', 'That endpoint does not exist.', 404);
}

export const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    return res.end();
  }
  const ip = req.socket.remoteAddress ?? 'unknown';
  (async () => {
    rateLimit(ip);
    await route(req, res);
  })().catch((err: unknown) => {
    if (err instanceof ApiError) return send(res, err.status || 400, { error: { code: err.code, message: err.message } });
    console.error('[tameng] unhandled', err);
    send(res, 500, { error: { code: 'NETWORK_ERROR', message: 'Something went wrong on the server. Try again.' } });
  });
});

function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

// Started directly (not imported by a test): listen and run the scheduler.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('[tameng] API on http://localhost:' + PORT);
    console.log('[tameng] phone: EXPO_PUBLIC_API_URL=http://' + lanAddress() + ':' + PORT);
  });

  const timer = setInterval(() => {
    try {
      const ran = core.runDueMandates();
      if (ran.length) console.log('[tameng] ran auto-sends:', ran.join(', '));
    } catch (err) {
      console.error('[tameng] scheduler', err);
    }
  }, SCHEDULER_MS);
  timer.unref();
}
