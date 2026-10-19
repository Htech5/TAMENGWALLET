import { useSyncExternalStore } from 'react';

import type { Card, ConfirmResponse } from './types';

export interface ChatItem {
  id: string;
  from: 'me' | 'tam';
  text: string;
  card?: Card | null;
  /** Outcome after the owner pressed Confirm or Cancel on a card. */
  outcome?: ConfirmResponse;
  at: number;
  failed?: boolean;
}

let items: ChatItem[] = [
  {
    id: 'welcome',
    from: 'tam',
    text: 'Hi Rudi. Tell me who to send money to and how much. I check every request against your limits and contacts before anything moves.',
    at: Date.now(),
  },
];
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());

export const chatStore = {
  add(item: ChatItem) {
    items = [...items, item];
    emit();
  },
  update(id: string, patch: Partial<ChatItem>) {
    items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    emit();
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
  get: () => items,
};

export function useChat() {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get, chatStore.get);
}
