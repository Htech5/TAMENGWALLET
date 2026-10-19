/**
 * FR-16 part one: read what a transaction actually does, from its calldata.
 *
 * A signature request shows the user a story ("claim your airdrop"). The calldata is the
 * only part that is true. This decodes the ERC-20 calls that matter for a wallet agent,
 * so policy can compare the two before anything is signed.
 *
 * Hand-rolled rather than pulled from a library: three selectors, fixed 32-byte words, no
 * dynamic types. Add an ABI decoder the day this file needs a fourth shape.
 */

export type DecodedCall =
  | { fn: "transfer"; to: string; amount: bigint }
  | { fn: "transferFrom"; from: string; to: string; amount: bigint }
  | { fn: "approve"; spender: string; amount: bigint }
  | { fn: "unknown"; selector: string };

// keccak256 of the signature, first 4 bytes. Fixed values, no hashing needed at runtime.
export const SELECTORS = {
  transfer: "a9059cbb", // transfer(address,uint256)
  transferFrom: "23b872dd", // transferFrom(address,address,uint256)
  approve: "095ea7b3", // approve(address,uint256)
} as const;

/** uint256 max: the "unlimited approval" every drainer asks for. */
export const UINT256_MAX = (1n << 256n) - 1n;

function word(data: string, index: number): string {
  return data.slice(index * 64, index * 64 + 64);
}

function addressFrom(w: string): string {
  return "0x" + w.slice(24);
}

export function decodeTx(calldata: string): DecodedCall {
  const hex = calldata.trim().toLowerCase().replace(/^0x/, "");
  const selector = hex.slice(0, 8);
  const data = hex.slice(8);

  if (selector === SELECTORS.transfer && data.length >= 128)
    return { fn: "transfer", to: addressFrom(word(data, 0)), amount: BigInt("0x" + word(data, 1)) };

  if (selector === SELECTORS.transferFrom && data.length >= 192)
    return {
      fn: "transferFrom",
      from: addressFrom(word(data, 0)),
      to: addressFrom(word(data, 1)),
      amount: BigInt("0x" + word(data, 2)),
    };

  if (selector === SELECTORS.approve && data.length >= 128)
    return { fn: "approve", spender: addressFrom(word(data, 0)), amount: BigInt("0x" + word(data, 1)) };

  return { fn: "unknown", selector };
}

/** USDC has 6 decimals, so 1 USDC is 1_000_000 base units. */
export const USDC_DECIMALS = 6;

export function toUsdc(amount: bigint): number {
  return Number(amount) / 10 ** USDC_DECIMALS;
}

export function fromUsdc(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/** Test and demo helper: build the calldata for a call this module can decode. */
export function encodeTransfer(to: string, amountUsdc: number): string {
  const addr = to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amt = fromUsdc(amountUsdc).toString(16).padStart(64, "0");
  return "0x" + SELECTORS.transfer + addr + amt;
}

export function encodeApprove(spender: string, amount: bigint): string {
  const addr = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amt = amount.toString(16).padStart(64, "0");
  return "0x" + SELECTORS.approve + addr + amt;
}
