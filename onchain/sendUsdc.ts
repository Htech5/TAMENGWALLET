// On-chain layer. Base Sepolia only.
//
// ponytail: simulated transfers until AGENT_WALLET_PRIVATE_KEY is set — a hash is minted
// locally and flips pending -> confirmed after CONFIRM_MS. Swap transfer() for a viem
// writeContract call on the USDC contract; the rest of the server already treats a TxRef
// as opaque, so nothing above this file changes.

import { randomBytes } from 'node:crypto';

import type { TxRef } from '../app/src/lib/types.ts';
import { encodeTransfer } from './decodeTx.ts';

const EXPLORER = 'https://sepolia.basescan.org/tx/';
const CONFIRM_MS = 4000;

export const chainId = process.env.CHAIN_ID ?? 'base-sepolia';
export const live = Boolean(process.env.AGENT_WALLET_PRIVATE_KEY && process.env.RPC_URL);

/**
 * The exact calldata that would be signed. Policy decodes this and compares it with what
 * the owner confirmed (FR-16), so the check runs on the real bytes rather than on a
 * promise about them, both now and once a real signer replaces transfer().
 */
export function buildCalldata(to: string, amountUsdc: number): string {
  return encodeTransfer(to, amountUsdc);
}

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
