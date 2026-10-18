/**
 * Shared types for the Tameng policy engine.
 *
 * The policy engine runs OUTSIDE the LLM: whatever the model says,
 * every transaction must pass checkPolicy() before it is signed.
 */

export type Action = "transfer" | "swap" | "approve" | "contract_call";

/** A transaction the agent WANTS to perform (not yet signed). */
export interface TxIntent {
  action: Action;
  chainId: string;      // e.g. "base-sepolia"
  to: string;           // recipient or contract address (0x...)
  token: string;        // e.g. "ETH", "USDC"
  amountUsd: number;    // value in USD, computed by the on-chain layer
}

export interface PolicyConfig {
  perTxLimitUsd: number;     // hard cap for a single transaction
  dailyLimitUsd: number;     // hard cap for the rolling day
  confirmAboveUsd: number;   // above this, a human must confirm
  allowedChains: string[];
  allowedActions: Action[];
  allowlist: string[];       // recipient addresses the user approved
}

export interface PolicyState {
  spentTodayUsd: number;
  paused: boolean;           // emergency kill switch
}

export type Decision = "allow" | "confirm" | "deny";

export interface PolicyResult {
  decision: Decision;
  reasons: string[];         // human-readable, shown in UI and logs
}
