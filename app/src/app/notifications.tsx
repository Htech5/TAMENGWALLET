import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { eventLook } from '@/components/ActivityRow';
import { Screen } from '@/components/Screen';
import { Avatar, ErrorBox, Loading, Pill, Section, T } from '@/components/ui';
import { api } from '@/lib/api';
import { clock, dayLabel, untilLabel, usdc } from '@/lib/format';
import { useLoad, useNow } from '@/lib/hooks';
import { ActivityEvent, Wallet } from '@/lib/types';
import { c } from '@/theme';

function body(e: ActivityEvent) {
  switch (e.type) {
    case 'attempt_blocked':
      return `${e.reasons?.[0]?.message ?? ''} Nothing left your wallet.`.trim();
    case 'run_postponed':
      return e.reasons?.[0]?.message ?? 'Waiting for enough balance.';
    case 'transfer_sent':
      return e.tx?.status === 'confirmed' ? `Confirmed on Base. Network fee ${e.feeUsd ?? '0'} USD.` : 'Waiting for the next block.';
    case 'agent_paused':
      return 'No automatic transfers will run until you turn Tam back on.';
    default:
      return '';
  }
}

export default function Notifications() {
  const now = useNow();
  const [cleared, setCleared] = useState(false);
  const q = useLoad(
    useCallback(async () => {
      const [a, w] = await Promise.all([api.getActivity(), api.getWallet()]);
      return { items: a.items.slice(0, 20), w };
    }, []),
  );
  const items = q.data?.items ?? [];
  const today = items.filter((e) => dayLabel(e.at, now) === 'Today');
  const earlier = items.filter((e) => dayLabel(e.at, now) !== 'Today');

  const markAll = async () => {
    if (!items[0]) return;
    await api.markRead(items[0].id);
    setCleared(true);
    q.reload();
  };

  return (
    <Screen
      title="Notifications"
      right={<Pill label={cleared ? 'All read' : 'Mark all read'} kind="line" small onPress={markAll} disabled={!q.data || q.data.w.unreadEvents === 0} />}
      refreshing={q.refreshing}
      onRefresh={q.refresh}
    >
      {!q.data && !q.error && <Loading />}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.data?.w.nextRun && <Upcoming n={q.data.w.nextRun} now={now} />}
      {today.length > 0 && <Section>Today</Section>}
      <View>{today.map((e, i) => <Item key={e.id} e={e} first={i === 0} />)}</View>
      {earlier.length > 0 && <Section>Earlier</Section>}
      <View>{earlier.map((e, i) => <Item key={e.id} e={e} first={i === 0} />)}</View>
    </Screen>
  );
}

function Upcoming({ n, now }: { n: NonNullable<Wallet['nextRun']>; now: Date }) {
  return (
    <Pressable onPress={() => router.push('/autosend')} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 }}>
      <Avatar color={c.stabilo} icon="clock" />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyMedium">
          {n.label} {untilLabel(n.at, now).toLowerCase()}
        </T>
        <T v="small" style={{ color: c.ink2 }}>
          {`${usdc(n.total)} USDC goes out on its own. Pause it from Auto-send if you need to.`}
        </T>
      </View>
    </Pressable>
  );
}

function Item({ e, first }: { e: ActivityEvent; first?: boolean }) {
  const look = eventLook(e);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: e.id } })}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 14, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}
    >
      <Avatar color={look.bg} icon={look.icon} iconColor={look.fg ?? c.ink} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="bodyMedium">{e.type === 'attempt_blocked' ? 'Tam stopped a transfer' : e.title}</T>
        {body(e) ? (
          <T v="small" style={{ color: c.ink2 }}>
            {body(e)}
          </T>
        ) : null}
        {e.type === 'attempt_blocked' && !e.read ? (
          <View style={{ marginTop: 6 }}>
            <Pill label="Review" kind="ink" small onPress={() => router.push({ pathname: '/activity/[id]', params: { id: e.id } })} />
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <T v="caption">{dayLabel(e.at) === 'Today' ? clock(new Date(e.at)) : dayLabel(e.at)}</T>
        {!e.read && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.pink }} />}
      </View>
    </Pressable>
  );
}
