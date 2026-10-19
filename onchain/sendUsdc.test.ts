import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeTx, toUsdc } from './decodeTx.ts';
import { buildCalldata, simulated, transfer } from './sendUsdc.ts';

const IBU = '0xfef60ecfd3208322e9d8411632ad8d696bba54dc';

test('USDC calldata decodes back to the exact recipient and amount', () => {
  const decoded = decodeTx(buildCalldata(IBU, 12.34));
  assert.equal(decoded.fn, 'transfer');
  if (decoded.fn !== 'transfer') return;
  assert.equal(decoded.to.toLowerCase(), IBU);
  assert.equal(toUsdc(decoded.amount), 12.34);
});

test('without TAMENG_LIVE the chain layer is simulated and always returns a tx ref', async () => {
  assert.equal(simulated(), true);
  const tx = await transfer(IBU, 1);
  assert.match(tx.hash, /^0x[0-9a-f]{64}$/);
  assert.equal(tx.status, 'pending');
  assert.equal(tx.explorerUrl, 'https://sepolia.basescan.org/tx/' + tx.hash);
});
