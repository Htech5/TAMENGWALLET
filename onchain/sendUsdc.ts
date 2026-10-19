// On-chain layer. Base Sepolia only.
//
// ponytail: simulated transfers until AGENT_WALLET_PRIVATE_KEY is set — a hash is minted
// locally and flips pending -> confirmed after CONFIRM_MS. Swap transfer() for a viem
// writeContract call on the USDC contract; the rest of the server already treats a TxRef
// as opaque, so nothing above this file changes.

import { randomBytes } from 'node:crypto';

import type { TxRef } from '../app/src/lib/types.ts';

const EXPLORER = 'https://sepolia.basescan.org/tx/';
const CONFIRM_MS = 4000;

export const chainId = process.env.CHAIN_ID ?? 'base-sepolia';
export const live = Boolean(process.env.AGENT_WALLET_PRIVATE_KEY && process.env.RPC_URL);

export function transfer(_to: string, _amountUsdc: number): TxRef {
  const hash = `0x${randomBytes(32).toString('hex')}`;
  return { hash, explorerUrl: `${EXPLORER}${hash}`, status: 'pending' };
}

/** Flip pending transactions to confirmed once a block would have passed. */
export function settle(txs: (TxRef | undefined)[], since: (tx: TxRef) => number): void {
  const now = Date.now();
  for (const tx of txs) {
    if (tx && tx.status === 'pending' && now - since(tx) > CONFIRM_MS) tx.status = 'confirmed';
  }
}
