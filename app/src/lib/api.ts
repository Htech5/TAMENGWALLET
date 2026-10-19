import * as Crypto from 'expo-crypto';

import { mockApi } from './mock';
import {
  ActivityPage,
  ApiError,
  ChatResponse,
  ConfirmResponse,
  Contact,
  ErrorCode,
  Mandate,
  MandateInput,
  MandateStatus,
  Settings,
  Wallet,
} from './types';

export interface Api {
  mode: 'live' | 'mock';
  getWallet(): Promise<Wallet>;
  chat(message: string, clientMessageId?: string): Promise<ChatResponse>;
  confirm(intentId: string, approve: boolean, pin?: string): Promise<ConfirmResponse>;
  getActivity(cursor?: string): Promise<ActivityPage>;
  markRead(upTo: string): Promise<{ unread: number }>;
  getMandates(): Promise<{ items: Mandate[] }>;
  patchMandate(id: string, body: Partial<MandateInput> & { status?: MandateStatus }, pin?: string): Promise<Mandate>;
  getContacts(): Promise<{ items: Contact[] }>;
  addContact(name: string, address: string, pin?: string): Promise<Contact>;
  deleteContact(id: string, pin?: string): Promise<void>;
  getSettings(): Promise<Settings>;
  patchSettings(body: Partial<Settings>, pin?: string): Promise<Settings>;
}

const BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const TOKEN = process.env.EXPO_PUBLIC_DEVICE_TOKEN || 'demo-device';

interface ReqOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  pin?: string;
  idempotent?: boolean;
}

async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: 'application/json',
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.pin) headers['X-Pin'] = opts.pin;
  if (opts.idempotent) headers['Idempotency-Key'] = Crypto.randomUUID();

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', "Can't reach Tameng's server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = (data?.error?.code as ErrorCode) ?? 'NETWORK_ERROR';
    const message = (data?.error?.message as string) ?? `Something went wrong (${res.status}). Try again.`;
    throw new ApiError(code, message, res.status);
  }
  return data as T;
}

const liveApi: Api = {
  mode: 'live',
  getWallet: () => request('/wallet'),
  chat: (message, clientMessageId) =>
    request('/chat', { method: 'POST', body: { message, clientMessageId: clientMessageId ?? Crypto.randomUUID() }, idempotent: true }),
  confirm: (intentId, approve, pin) =>
    request(`/confirm/${encodeURIComponent(intentId)}`, { method: 'POST', body: { approve }, pin, idempotent: true }),
  getActivity: (cursor) => request(`/activity?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  markRead: (upTo) => request('/activity/read', { method: 'POST', body: { upTo } }),
  getMandates: () => request('/mandates'),
  patchMandate: (id, body, pin) => request(`/mandates/${encodeURIComponent(id)}`, { method: 'PATCH', body, pin }),
  getContacts: () => request('/contacts'),
  addContact: (name, address, pin) => request('/contacts', { method: 'POST', body: { name, address }, pin, idempotent: true }),
  deleteContact: (id, pin) => request(`/contacts/${encodeURIComponent(id)}`, { method: 'DELETE', pin }),
  getSettings: () => request('/settings'),
  patchSettings: (body, pin) => request('/settings', { method: 'PATCH', body, pin }),
};

export const api: Api = BASE ? liveApi : mockApi;
