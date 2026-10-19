import { router } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/Screen';
import { Button, Loading, T } from '@/components/ui';
import { api } from '@/lib/api';
import { usdc } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { c, f } from '@/theme';

export default function SavingsInfo() {
  const q = useLoad(
    useCallback(async () => {
      const [w, a] = await Promise.all([api.getWallet(), api.getActivity()]);
      const month = w.feesSaved.month;
      const sent = a.items.filter((e) => e.type === 'transfer_sent' && e.at.startsWith(month));
      const total = sent.reduce((s, e) => s + Number.parseFloat(e.amount ?? '0'), 0);
      const fees = sent.reduce((s, e) => s + Number.parseFloat(e.feeUsd ?? '0'), 0);
      return { w, total, fees };
    }, []),
  );
  const d = q.data;
  const pct = d ? Number.parseFloat(d.w.feesSaved.benchmarkPct) : 0;
  const avg = d ? (d.total * pct) / 100 : 0;
  const saved = d ? Number.parseFloat(d.w.feesSaved.totalUsd) : 0;
  const other = d ? Math.max(0, avg - d.fees - saved) : 0;

  return (
    <Sheet>
      <View style={{ gap: 4 }}>
        <T v="h2">How we count your savings</T>
        <T v="body" style={{ color: c.ink2 }}>
          We compare what you paid with the average fee for sending money to Indonesia.
        </T>
      </View>
      {!d ? (
        <Loading />
      ) : (
        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 16, overflow: 'hidden' }}>
          <Line k="Sent this month" v={`${usdc(d.total)} USD`} strong />
          <Line k={`Average fee at ${d.w.feesSaved.benchmarkPct}%`} sub="What a typical transfer would cost" v={`${usdc(avg)} USD`} />
          <Line k="Network fees" sub="Paid on Base" v={`${d.fees.toFixed(4)} USD`} />
          {other >= 0.01 && <Line k="Cash out to rupiah" sub="Estimated" v={`${usdc(other)} USD`} />}
          <Line k="You saved" v={`${usdc(saved)} USD`} total />
        </View>
      )}
      <T v="caption" style={{ lineHeight: 18 }}>
        The average fee comes from the World Bank Remittance Prices Worldwide report, Q3 2025, for sending 200 USD to Indonesia. Your family may pay a little more when they cash out, depending on where they withdraw.
      </T>
      <Button label="Got it" onPress={() => router.back()} />
    </Sheet>
  );
}

function Line({ k, v, sub, strong, total }: { k: string; v: string; sub?: string; strong?: boolean; total?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: total ? c.stabilo : c.bg }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v={strong || total ? 'bodyMedium' : 'body'} style={{ fontSize: 14 }}>
          {k}
        </T>
        {sub ? <T v="caption">{sub}</T> : null}
      </View>
      <T style={{ fontFamily: f.semibold, fontSize: 14, color: c.ink }}>{v}</T>
    </View>
  );
}
