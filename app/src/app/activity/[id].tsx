import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';

import { eventLook } from '@/components/ActivityRow';
import { TxLink } from '@/components/ChatCards';
import { Screen } from '@/components/Screen';
import { Tam } from '@/components/Tam';
import { Avatar, Badge, Button, Card, ErrorBox, KV, Loading, Note, T } from '@/components/ui';
import { api } from '@/lib/api';
import { fullStamp, usdc } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { c } from '@/theme';

export default function ActivityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useLoad(useCallback(async () => ({ e: (await api.getActivity()).items.find((x) => x.id === id) ?? null }), [id]));
  const e = q.data?.e ?? null;

  useEffect(() => {
    if (e && !e.read) api.markRead(e.id).catch(() => {});
  }, [e]);

  if (!e) {
    return (
      <Screen title="Details">
        {q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : <T v="small">This item is no longer available.</T>}
      </Screen>
    );
  }

  const look = eventLook(e);

  if (e.type === 'attempt_blocked') {
    return (
      <Screen title="Review" sub={fullStamp(e.at)}>
        <View style={{ backgroundColor: c.pinkTint, borderRadius: 20, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Tam size={44} mood="alert" />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">Nothing was sent</T>
            <T v="small" style={{ color: c.pinkInk }}>
              Tam blocked this before it reached your wallet.
            </T>
          </View>
        </View>

        <Card>
          <T v="label">What was asked</T>
          <T v="bodyMedium">{e.title}</T>
          <KV
            rows={[
              ...(e.amount ? ([['Amount', `${usdc(e.amount)} USDC`]] as [string, string][]) : []),
              ['Came from', e.source === 'external' ? 'A message you received' : e.source === 'mandate' ? 'Auto-send' : 'Your chat with Tam'],
              ['When', fullStamp(e.at)],
            ]}
          />
        </Card>

        {e.excerpt ? (
          <Card style={{ gap: 8 }}>
            <T v="label">The message</T>
            <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#BDBDBD', backgroundColor: c.soft, borderRadius: 14, padding: 12 }}>
              <T v="body" style={{ color: c.ink2 }}>
                {e.excerpt}
              </T>
            </View>
            <T v="caption">Text from outside your own messages can never move money.</T>
          </Card>
        ) : null}

        <Card style={{ gap: 10 }}>
          <T v="label">Why Tam stopped it</T>
          {(e.reasons ?? []).map((r) => (
            <View key={r.code} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.pink, marginTop: 6 }} />
              <T v="body" style={{ flex: 1 }}>
                {r.message}
              </T>
            </View>
          ))}
        </Card>

        <Note icon="shield">
          If this really was you, add the person in Contacts with your PIN first, then ask Tam again. There is no way to force a blocked transfer.
        </Note>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Add a contact" kind="white" style={{ flex: 1 }} onPress={() => router.push('/contacts/new')} />
          <Button label="Done" style={{ flex: 1 }} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const label = look.badge?.[0] ?? '';
  return (
    <Screen title="Details" sub={fullStamp(e.at)}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
        <Avatar size={64} color={look.bg} icon={look.icon} iconColor={look.fg ?? c.ink} />
        <T v="h2" style={{ textAlign: 'center' }}>
          {e.title}
        </T>
        {look.badge && <Badge label={label} kind={look.badge[1]} />}
      </View>

      <Card>
        <KV
          rows={[
            ...(e.amount ? ([['Amount', `${usdc(e.amount)} USDC`]] as [string, string][]) : []),
            ...(e.recipient ? ([['To', `${e.recipient.name} · ${e.recipient.addressShort}`]] as [string, string][]) : []),
            ['How', e.source === 'chat' ? 'You asked Tam' : e.mandateId ? 'Auto-send' : 'Tam'],
            ['When', fullStamp(e.at)],
            ...(e.feeUsd ? ([['Network fee', `${e.feeUsd} USD`]] as [string, string][]) : []),
            ...(e.savedVsBenchmarkUsd ? ([['Saved vs average fee', `${usdc(e.savedVsBenchmarkUsd)} USD`]] as [string, string][]) : []),
            ['Network', 'Base Sepolia'],
          ]}
        />
      </Card>

      {e.tx && <TxLink tx={e.tx} />}

      {e.reasons?.length ? (
        <Card style={{ gap: 8 }}>
          <T v="label">Why</T>
          {e.reasons.map((r) => (
            <T key={r.code} v="body">
              {r.message}
            </T>
          ))}
        </Card>
      ) : null}

      {e.mandateId ? <Button label="Open Auto-send" kind="white" onPress={() => router.push('/autosend')} /> : null}
    </Screen>
  );
}
