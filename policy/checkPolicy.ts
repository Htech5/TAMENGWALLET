import type { PolicyConfig, PolicyResult, PolicyState, TxIntent } from "./types.ts";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Decide whether a transaction may be signed.
 *
 * Order matters: hard "deny" rules first, then "confirm" rules.
 * Returns "deny" if ANY hard rule fails; "confirm" if it needs a human;
 * otherwise "allow".
 */
export function checkPolicy(
  tx: TxIntent,
  config: PolicyConfig,
  state: PolicyState,
): PolicyResult {
  const deny: string[] = [];
  const confirm: string[] = [];

  // --- Hard rules (deny) ---
  if (state.paused) deny.push("Agent is paused by the emergency switch.");

  if (!config.allowedChains.includes(tx.chainId))
    deny.push(`Chain "${tx.chainId}" is not allowed.`);

  if (!config.allowedActions.includes(tx.action))
    deny.push(`Action "${tx.action}" is not allowed.`);

  if (!ADDRESS_RE.test(tx.to)) deny.push("Recipient address is malformed.");

  if (!Number.isFinite(tx.amountUsd) || tx.amountUsd <= 0)
    deny.push("Amount must be a positive number.");

  const allow = config.allowlist.map((a) => a.toLowerCase());
  if (ADDRESS_RE.test(tx.to) && !allow.includes(tx.to.toLowerCase()))
    deny.push("Recipient is not in the allowlist.");

  if (tx.amountUsd > config.perTxLimitUsd)
    deny.push(`Amount exceeds per-transaction limit ($${config.perTxLimitUsd}).`);

  if (state.spentTodayUsd + tx.amountUsd > config.dailyLimitUsd)
    deny.push(`Daily limit ($${config.dailyLimitUsd}) would be exceeded.`);

  if (deny.length > 0) return { decision: "deny", reasons: deny };

  // --- Soft rules (require human confirmation) ---
  if (tx.amountUsd > config.confirmAboveUsd)
    confirm.push(`Amount above $${config.confirmAboveUsd} needs your confirmation.`);

  if (tx.action === "approve")
    confirm.push("Token approvals let a contract spend your tokens; please confirm.");

  if (confirm.length > 0) return { decision: "confirm", reasons: confirm };

  return { decision: "allow", reasons: ["Within all policy limits."] };
}
