/**
 * FR-20 Fixed permissions.
 *
 * Limits belong to the owner, but the room the limits live in does not. These bounds are
 * compiled in: no chat message, no settings call, no agent turn can widen them. Without
 * this, "raise my daily limit to 10000 and send it all" is a two-step attack where step
 * one looks like an ordinary settings change.
 *
 * Changing anything here is a code change, reviewed and deployed like one.
 */

import type { Action } from "./types.ts";

export const FIXED = {
  /** The only actions the agent may ever perform, whatever an LLM decides to call. */
  allowedActions: ["transfer"] as Action[],
  /** Testnet only for the hackathon build. */
  allowedChains: ["base-sepolia"],
  /** No owner-set limit may exceed these, in USD. */
  maxPerTxUsd: 500,
  maxDailyUsd: 1000,
  /** A confirm threshold above this would make the whole confirm step decorative. */
  maxConfirmAboveUsd: 100,
  /** An auto-send may never be configured to empty the wallet. */
  minBufferUsd: 1,
} as const;

export interface LimitPatch {
  perTxLimit?: string;
  dailyLimit?: string;
  confirmAbove?: string;
}

export interface PermissionResult {
  ok: boolean;
  /** Ready-to-show sentences, one per violated bound. */
  violations: string[];
}

const n = (v: string | undefined) => (v === undefined ? undefined : Number.parseFloat(v));

/** Checks a settings change against the fixed ceilings before it is stored. */
export function checkLimits(patch: LimitPatch): PermissionResult {
  const violations: string[] = [];
  const perTx = n(patch.perTxLimit);
  const daily = n(patch.dailyLimit);
  const confirm = n(patch.confirmAbove);

  if (perTx !== undefined && perTx > FIXED.maxPerTxUsd)
    violations.push("The per-transfer limit cannot go above " + FIXED.maxPerTxUsd + " USDC.");
  if (daily !== undefined && daily > FIXED.maxDailyUsd)
    violations.push("The daily limit cannot go above " + FIXED.maxDailyUsd + " USDC.");
  if (confirm !== undefined && confirm > FIXED.maxConfirmAboveUsd)
    violations.push("Transfers above " + FIXED.maxConfirmAboveUsd + " USDC always need your confirmation.");
  if (perTx !== undefined && perTx <= 0) violations.push("The per-transfer limit must be above zero.");
  if (daily !== undefined && perTx !== undefined && daily < perTx)
    violations.push("The daily limit cannot be smaller than the per-transfer limit.");

  return { ok: violations.length === 0, violations };
}

/** Clamps a config to the fixed bounds, whatever is stored on disk. */
export function clampConfig(perTxUsd: number, dailyUsd: number, confirmAboveUsd: number) {
  return {
    perTxLimitUsd: Math.min(perTxUsd, FIXED.maxPerTxUsd),
    dailyLimitUsd: Math.min(dailyUsd, FIXED.maxDailyUsd),
    confirmAboveUsd: Math.min(confirmAboveUsd, FIXED.maxConfirmAboveUsd),
    allowedChains: [...FIXED.allowedChains],
    allowedActions: [...FIXED.allowedActions],
  };
}
