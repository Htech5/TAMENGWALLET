// On-chain layer. Base Sepolia only.
//
// Live mode is opt-in twice: a private key must be present *and* TAMENG_LIVE=1.
// Without that, or during the attack benchmark, transfers are simulated with a random
// hash so the app, tests and demo can run without spending testnet funds.

import { randomBytes } from 'node:crypto';

import { createPublicClient, createWalletClient, http, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import type { TxRef } from '../app/src/lib/types.ts';
import { encodeTransfer, fromUsdc, toUsdc } from './decodeTx.ts';

const EXPLORER = 'https://sepolia.basescan.org/tx/';
const DEFAULT_RPC = 'https://sepolia.base.org';
// Circle's official USDC on Base Sepolia.
const DEFAULT_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const RPC_URL = process.env.RPC_URL?.trim() || DEFAULT_RPC;
const USDC_ADDRESS = (process.env.USDC_CONTRACT_ADDRESS?.trim() || DEFAULT_USDC) as `0x${string}`;
const RAW_KEY = process.env.AGENT_WALLET_PRIVATE_KEY?.trim();

const erc20Abi = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export class ChainError extends Error {
  code: 'RPC_UNAVAILABLE' | 'INSUFFICIENT_FUNDS' | 'INVALID_KEY';
  constructor(code: ChainError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

let account: ReturnType<typeof privateKeyToAccount> | null = null;
let keyError = '';
if (RAW_KEY) {
  try {
    account = privateKeyToAccount(RAW_KEY as `0x${string}`);
  } catch {
    keyError = 'AGENT_WALLET_PRIVATE_KEY is not a valid 32-byte hex private key.';
  }
}

const transport = http(RPC_URL, { timeout: 20_000, retryCount: 0 });
const publicClient = createPublicClient({ chain: baseSepolia, transport });
const walletClient = account ? createWalletClient({ account, chain: baseSepolia, transport }) : null;

export const chainId = process.env.CHAIN_ID ?? 'base-sepolia';
export const agentAddress = account?.address ?? null;
const inTestProcess = Boolean(process.env.NODE_TEST_CONTEXT);
/** Live only when explicitly enabled; a key or a TAMENG_LIVE exported into a test shell is not enough. */
export const live = Boolean(account && process.env.TAMENG_LIVE === '1' && !inTestProcess);

let forceSimulation = false;
/** The attack benchmark must never move real funds, even when the server is live. */
export function setSimulation(on: boolean): void {
  forceSimulation = on;
}

export function simulated(): boolean {
  return forceSimulation || !live;
}

/**
 * The exact calldata that would be signed. Policy decodes this and compares it with what
 * the owner confirmed (FR-16), so the check runs on the real bytes rather than on a
 * promise about them, both now and once a real signer replaces transfer().
 */
export function buildCalldata(to: string, amountUsdc: number): string {
  return encodeTransfer(to, amountUsdc);
}

function fakeHash(): string {
  return `0x${randomBytes(32).toString('hex')}`;
}

function toTxRef(hash: string): TxRef {
  return { hash, explorerUrl: `${EXPLORER}${hash}`, status: 'pending' };
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split('\n')[0].slice(0, 240);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One signer, one nonce line: serialize broadcasts so two recipients cannot race for the
// same nonce. The retry reuses the nonce, which makes an ambiguous first broadcast safe.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function sendLive(to: string, amountUsdc: number): Promise<TxRef> {
  if (!account || !walletClient) {
    throw new ChainError('INVALID_KEY', keyError || 'No agent wallet is configured.');
  }
  const value = fromUsdc(amountUsdc);
  let nonce: number;
  try {
    nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
  } catch (err) {
    throw new ChainError('RPC_UNAVAILABLE', 'Could not reach Base Sepolia: ' + errorText(err));
  }

  let last = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const hash = await walletClient.writeContract({
        account,
        chain: baseSepolia,
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as `0x${string}`, value],
        nonce,
      });
      return toTxRef(hash);
    } catch (err) {
      last = errorText(err);
      if (attempt === 0) await sleep(750);
    }
  }

  const lowBalance = /insufficient|exceeds balance|gas required|allowance|funds/i.test(last);
  throw new ChainError(
    lowBalance ? 'INSUFFICIENT_FUNDS' : 'RPC_UNAVAILABLE',
    lowBalance
      ? 'The agent wallet does not have enough Base Sepolia ETH or USDC for this transfer.'
      : 'Base Sepolia did not accept the transaction after one retry: ' + last,
  );
}

/** Broadcast a USDC transfer. Retries exactly once; never retries after a hash exists. */
export function transfer(to: string, amountUsdc: number): Promise<TxRef> {
  if (simulated()) return Promise.resolve(toTxRef(fakeHash()));
  return serialized(() => sendLive(to, amountUsdc));
}

/** USDC balance in whole tokens, or null when the RPC did not answer. */
export async function getUsdcBalance(address: string): Promise<number | null> {
  try {
    const raw = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });
    return toUsdc(raw);
  } catch {
    return null;
  }
}

/** Receipt reconciliation. A missing receipt is still pending, not failed. */
export async function receiptStatus(hash: string): Promise<TxRef['status']> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: hash as Hash });
    if (!receipt) return 'pending';
    return receipt.status === 'success' ? 'confirmed' : 'failed';
  } catch (err) {
    const message = errorText(err);
    if (/not found|could not be found|unknown transaction/i.test(message)) return 'pending';
    return 'unknown';
  }
}
