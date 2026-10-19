import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Avatar, Card, ErrorBox, KV, Loading, Note, Pill, T } from '@/components/ui';
import { api } from '@/lib/api';
import { usdc } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { c } from '@/theme';

export default function Profile() {
  const [copied, setCopied] = useState(false);
  const q = useLoad(
    useCallback(async () => {
      const [w, a] = await Promise.all([api.getWallet(), api.getActivity()]);
      const sent = a.items.filter((e) => e.type === 'transfer_sent').reduce((s, e) => s + Number.parseFloat(e.amount ?? '0'), 0);
      return { w, sent };
    }, []),
  );
  const d = q.data;

  return (
    <Screen title="Profile">
      {!d && !q.error && <Loading />}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {d && (
        <>
          <View style={{ alignItems: 'center', gap: 6, paddingVertical: 6 }}>
            <Avatar name={d.w.owner.name} size={88} color={c.blue} />
            <T v="h2" style={{ marginTop: 6 }}>
              {d.w.owner.name}
            </T>
            <T v="small">Owner of this wallet</T>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat value={usdc(d.sent)} label="USDC sent" />
            <Stat value={usdc(d.w.feesSaved.totalUsd)} label="USD saved" highlight />
            <Stat value={String(d.w.protection.blocked)} label="Blocked" />
          </View>

          <Card style={{ gap: 10 }}>
            <T v="label">Wallet address</T>
            <T v="mono" selectable style={{ fontSize: 13, color: c.ink }}>
              {d.w.address}
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pill
                label={copied ? 'Copied' : 'Copy'}
                icon={copied ? 'check' : 'copy'}
                kind="soft"
                small
                onPress={async () => {
                  await Clipboard.setStringAsync(d.w.address);
                  setCopied(true);
                }}
              />
              <Pill label="View on BaseScan" icon="external" kind="soft" small onPress={() => WebBrowser.openBrowserAsync(`https://sepolia.basescan.org/address/${d.w.address}`)} />
            </View>
          </Card>

          <Card>
            <KV
              rows={[
                ['Network', 'Base Sepolia testnet'],
                ['Savings', `${usdc(d.w.savings.balance)} of ${usdc(d.w.savings.target)} USDC`],
                ['Auto-sends running', `${d.w.mandates.active} of ${d.w.mandates.total}`],
              ]}
            />
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.soft, overflow: 'hidden' }}>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: c.ink,
                  width: `${Math.min(100, (Number.parseFloat(d.w.savings.balance) / Math.max(1, Number.parseFloat(d.w.savings.target))) * 100)}%`,
                }}
              />
            </View>
          </Card>

          <Note icon="lock">Your keys never live on this phone. Tameng's server signs only what passes your rules.</Note>
        </>
      )}
    </Screen>
  );
}

function Stat({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: highlight ? c.stabilo : c.soft, borderRadius: 16, padding: 14, gap: 4 }}>
      <T v="h3" style={{ fontSize: 18 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T v="caption" style={{ color: highlight ? c.stabiloInk : c.silver }}>
        {label}
      </T>
    </View>
  );
}
