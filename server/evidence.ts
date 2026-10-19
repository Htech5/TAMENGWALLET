// TMG-19: every live demo transfer appends itself to docs/EXECUTION_EVIDENCE.md.
//
// Simulated transfers, tests and the attack benchmark never write here: the file is the
// record of real Base Sepolia transactions that the judges can open on BaseScan.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'docs', 'EXECUTION_EVIDENCE.md');

const HEADER = `# Execution Evidence

Network: **Base Sepolia** · Token: **USDC** (%token%) · Explorer: https://sepolia.basescan.org

Agent wallet address: \`%\`

| # | Date (UTC+7) | Scenario | Policy decision | Amount | Tx hash |
|---|---|---|---|---|---|

Blocked attempts (no tx sent) are listed in \`SECURITY_REPORT.md\`.
`;

export interface EvidenceRow {
  at: string;
  scenario: string;
  decision: string;
  amount: string;
  hash: string;
  explorerUrl: string;
  agentAddress: string;
}

function jakartaTime(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function sanitize(value: string): string {
  return value.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}

/**
 * Append one real transfer. The row number is derived from the file, so parallel writers
 * would still produce unique ids as long as the caller serialises (the on-chain layer does).
 */
export function appendEvidence(row: EvidenceRow): void {
  if (process.env.NODE_TEST_CONTEXT || process.env.TAMENG_NO_PERSIST === '1') return;

  const token = process.env.USDC_CONTRACT_ADDRESS ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
  const base = existsSync(FILE)
    ? readFileSync(FILE, 'utf8')
    : HEADER.replace('%token%', token).replace('%', row.agentAddress);
  const withWallet = base.includes('Agent wallet address: `0x')
    ? base.replace(/Agent wallet address: `0x[a-fA-F0-9…]+`/, 'Agent wallet address: `' + row.agentAddress + '`')
    : base;

  const used = (withWallet.match(/^\|\s*\d+\s*\|/gm) ?? []).length;
  const line =
    `| ${used + 1} | ${jakartaTime(row.at)} | ${sanitize(row.scenario)} | ` +
    `${sanitize(row.decision)} | ${sanitize(row.amount)} USDC | [${row.hash}](${row.explorerUrl}) |`;

  // Keep the table contiguous: no blank line between the header and the rows.
  const marker = '\nBlocked attempts';
  const at = withWallet.indexOf(marker);
  const head = (at >= 0 ? withWallet.slice(0, at) : withWallet).replace(/\s+$/, '');
  const tail = at >= 0 ? withWallet.slice(at) : '\n\nBlocked attempts (no tx sent) are listed in `SECURITY_REPORT.md`.';
  const next = `${head}\n${line}\n${tail}`;

  writeFileSync(FILE, next);
}
