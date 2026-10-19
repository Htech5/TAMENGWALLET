/**
 * FR-16 part two: does the transaction match what the owner was told?
 *
 * decodeTx() says what the calldata really does. The decision card says what the owner
 * agreed to. This compares them and refuses on any gap: a different recipient, a bigger
 * amount, an approval where a transfer was promised, a function nobody mentioned.
 *
 * This is the check that catches the classic "claim your airdrop" that is really an
 * unlimited approval, and the swapped recipient between showing the card and signing.
 */

import { type DecodedCall, toUsdc, UINT256_MAX } from "../onchain/decodeTx.ts";

export interface PromisedIntent {
  action: "transfer" | "approve";
  to: string;
  /** In USDC, as the card showed it. */
  amount: number;
}

export interface IntentCheckResult {
  ok: boolean;
  mismatches: string[];
}

// A rounding difference below this is the decimal maths, not an attack.
const AMOUNT_TOLERANCE = 0.000001;

export function intentCheck(decoded: DecodedCall, promised: PromisedIntent): IntentCheckResult {
  const mismatches: string[] = [];
  const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  if (decoded.fn === "unknown") {
    mismatches.push("The transaction calls a function the agent does not recognise.");
    return { ok: false, mismatches };
  }

  if (promised.action === "transfer" && decoded.fn !== "transfer") {
    mismatches.push("You were shown a transfer, but the transaction is a " + decoded.fn + ".");
    if (decoded.fn === "approve" && decoded.amount === UINT256_MAX)
      mismatches.push("It asks for unlimited spending access to your tokens.");
    return { ok: false, mismatches };
  }

  if (promised.action === "approve" && decoded.fn !== "approve") {
    mismatches.push("You were shown an approval, but the transaction is a " + decoded.fn + ".");
    return { ok: false, mismatches };
  }

  if (decoded.fn === "approve" && decoded.amount === UINT256_MAX)
    mismatches.push("It asks for unlimited spending access to your tokens.");

  const target = decoded.fn === "approve" ? decoded.spender : decoded.to;
  if (!sameAddress(target, promised.to))
    mismatches.push("The recipient in the transaction is not the one you confirmed.");

  const actual = toUsdc(decoded.amount);
  if (decoded.amount !== UINT256_MAX && Math.abs(actual - promised.amount) > AMOUNT_TOLERANCE)
    mismatches.push("The amount is " + actual.toFixed(2) + " USDC, not the " + promised.amount.toFixed(2) + " you confirmed.");

  if (decoded.fn === "transferFrom")
    mismatches.push("The transaction pulls funds from another wallet, which you did not approve.");

  return { ok: mismatches.length === 0, mismatches };
}
