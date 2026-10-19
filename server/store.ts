// Persistent state for the API. One JSON file under data/ (git-ignored), seeded from
// app/mocks so a fresh clone starts with the same data the app was built against.
// Every write goes through save(); every money or security event also goes to audit().

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ActivityEvent,
  Contact,
  DecisionCard,
  Mandate,
  MandateDraftCard,
  Settings,
  Wallet,
} from '../app/src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const FILE = join(DATA, 'state.json');
const AUDIT = join(DATA, 'audit.log');
const MOCKS = join(ROOT, 'app', 'mocks');

export interface State {
  wallet: Wallet;
  activity: ActivityEvent[];
  contacts: Contact[];
  mandates: Mandate[];
  settings: Settings;
  intents: Record<string, DecisionCard | MandateDraftCard>;
  idempotency: Record<string, unknown>;
  pin: { fails: number; lockedUntil: number };
  seq: number;
}

const mock = (name: string) => JSON.parse(readFileSync(join(MOCKS, name), 'utf8'));

function seed(): State {
  return {
    wallet: mock('home-wallet.json'),
    activity: mock('activity.json').items,
    contacts: mock('contacts.json').items,
    mandates: mock('mandates.json').items,
    settings: mock('settings.json'),
    intents: {},
    idempotency: {},
    pin: { fails: 0, lockedUntil: 0 },
    seq: 200,
  };
}

function load(): State {
  if (!existsSync(FILE)) return seed();
  try {
    return { ...seed(), ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    // Corrupt file must never take the server down; start clean and keep the bad copy.
    renameSync(FILE, `${FILE}.broken-${Date.now()}`);
    return seed();
  }
}

export const state: State = load();

export function save(): void {
  if (process.env.TAMENG_NO_PERSIST === '1') return; // tests keep state in memory only
  mkdirSync(DATA, { recursive: true });
  const tmp = `${FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, FILE); // atomic: a crash mid-write never leaves half a state file
}

/** Append-only trail of everything that moved money or hit a security rule (TMG-48). */
export function audit(event: string, detail: Record<string, unknown> = {}): void {
  if (process.env.TAMENG_NO_PERSIST === '1') return;
  mkdirSync(DATA, { recursive: true });
  appendFileSync(AUDIT, `${JSON.stringify({ at: new Date().toISOString(), event, ...detail })}\n`);
}

export function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

/** Test helper: wipe state back to the seed without touching disk. */
export function reset(): void {
  Object.assign(state, seed());
}
