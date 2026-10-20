// Mirrors docs/API_CONTRACT.md v0.1. Change both together.

export type Usdc = string;
export type Usd = string;
export type Iso = string;

export type Decision = 'allow' | 'confirm' | 'deny';

export interface Recipient {
  contactId: string;
  name: string;
  addressShort: string;
}

export type ReasonCode =
  | 'WITHIN_LIMITS'
  | 'ABOVE_CONFIRM_THRESHOLD'
  | 'APPROVAL_REQUIRED'
  | 'NOT_IN_ALLOWLIST'
  | 'LOOKALIKE_ADDRESS'
  | 'INTENT_MISMATCH'
  | 'EXTERNAL_PROVENANCE'
  | 'INJECTION_DETECTED'
  | 'OVER_PER_TX_LIMIT'
  | 'OVER_DAILY_LIMIT'
  | 'CHAIN_NOT_ALLOWED'
  | 'ACTION_NOT_ALLOWED'
  | 'AGENT_PAUSED'
  | 'BELOW_MIN_BALANCE';

export interface Reason {
  code: ReasonCode;
  message: string;
}

export interface TxRef {
  hash: string;
  explorerUrl: string;
  status: 'pending' | 'confirmed' | 'failed' | 'unknown';
}

export interface Schedule {
  type: 'monthly' | 'interval';
  dayOfMonth?: number;
  minutes?: number;
}

export interface DecisionCard {
  type: 'decision';
  intentId: string;
  decision: Decision;
  summary: string;
  action: 'transfer' | 'approve';
  amount: Usdc;
  token: 'USDC';
  recipient: Recipient | null;
  rawAddressShort?: string;
  networkFeeUsd: Usd;
  savedVsBenchmarkUsd: Usd;
  reasons: Reason[];
  expiresAt: Iso | null;
  tx: TxRef | null;
}

export interface ClarifyCard {
  type: 'clarify';
  question: string;
  options?: string[];
}

export interface MandateInput {
  label?: string;
  recipients: { contactId: string; amount: Usdc }[];
  schedule: Schedule;
  minBalance: Usdc;
}

export interface MandateDraftCard {
  type: 'mandate_draft';
  intentId: string;
  summary: string;
  mandate: MandateInput;
  expiresAt: Iso;
}

export type Card = DecisionCard | ClarifyCard | MandateDraftCard;

/**
 * Which reader answered the message: the model, the rule reader, or the cache. A fallback
 * that is not recorded is a fallback nobody can prove, so the response carries it.
 */
export type IntentReader = 'llm' | 'rules' | 'cache';

export interface ChatResponse {
  messageId: string;
  reply: string;
  card: Card | null;
  reader: IntentReader;
}

export type ConfirmStatus = 'executed' | 'rejected' | 'denied' | 'expired';

export interface ConfirmResponse {
  intentId: string;
  status: ConfirmStatus;
  tx: TxRef | null;
  mandate: Mandate | null;
  reasons?: Reason[];
}

export type MandateStatus = 'active' | 'postponed' | 'paused';

export interface Mandate {
  id: string;
  label: string;
  recipients: (Recipient & { amount: Usdc })[];
  total: Usdc;
  schedule: Schedule;
  minBalance: Usdc;
  status: MandateStatus;
  nextRunAt: Iso | null;
  lastRun: null | {
    id: string;
    at: Iso;
    status: 'sent' | 'postponed' | 'failed' | 'unknown';
    txs: TxRef[];
  };
  consecutivePostpones: number;
}

export interface Wallet {
  owner: { name: string };
  address: string;
  addressShort: string;
  network: 'base-sepolia';
  balance: Usdc;
  paused: boolean;
  nextRun: null | {
    mandateId: string;
    label: string;
    schedule: Schedule;
    at: Iso;
    total: Usdc;
    status: MandateStatus;
    recipients: { name: string; amount: Usdc }[];
  };
  mandates: { active: number; total: number };
  savings: { balance: Usdc; target: Usdc };
  feesSaved: { month: string; totalUsd: Usd; benchmarkPct: string };
  protection: { month: string; checked: number; blocked: number };
  unreadEvents: number;
}

export type ActivityType =
  | 'transfer_sent'
  | 'transfer_failed'
  | 'run_postponed'
  | 'attempt_blocked'
  | 'mandate_paused'
  | 'agent_paused'
  | 'agent_resumed';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  at: Iso;
  read: boolean;
  title: string;
  amount?: Usdc;
  recipient?: Recipient;
  mandateId?: string;
  tx?: TxRef;
  feeUsd?: Usd;
  savedVsBenchmarkUsd?: Usd;
  reasons?: Reason[];
  source?: 'chat' | 'mandate' | 'external';
  excerpt?: string;
}

export interface ActivityPage {
  items: ActivityEvent[];
  nextCursor: string | null;
  unread: number;
}

export interface Contact {
  id: string;
  name: string;
  address: string;
  addressShort: string;
  verifiedAt: Iso;
}

export interface Settings {
  perTxLimit: Usdc;
  dailyLimit: Usdc;
  confirmAbove: Usdc;
  savingsTarget: Usdc;
  demoMode: boolean;
  paused: boolean;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'PIN_REQUIRED'
  | 'PIN_INVALID'
  | 'PIN_LOCKED'
  | 'NOT_FOUND'
  | 'INTENT_EXPIRED'
  | 'LOOKALIKE_ADDRESS'
  | 'CONTACT_IN_USE'
  | 'AGENT_PAUSED'
  | 'RATE_LIMITED'
  | 'RPC_UNAVAILABLE'
  | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}
