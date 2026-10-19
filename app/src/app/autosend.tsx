import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { TxLink } from '@/components/ChatCards';
import { usePin } from '@/components/Pin';
import { Screen } from '@/components/Screen';
import { Badge, Card, CircleButton, ErrorBox, KV, Loading, Note, Pill, T } from '@/components/ui';
import { api } from '@/lib/api';
import { scheduleLabel, shortDate, untilLabel, usdc, whenLabel } from '@/lib/format';
import { useLoad, useNow } from '@/lib/hooks';
import { ApiError, Mandate } from '@/lib/types';
import { c } from '@/theme';

const SPLIT = [c.ink, c.blue, c.stabilo, c.pink, c.silver];

export default function AutoSend() {
  const now = useNow();
  const ask = usePin();
  const [msg, setMsg] = useState<string | null>(null);
  const q = useLoad(
    useCallback(async () => {
      const [m, s] = await Promise.all([api.getMandates(), api.getSettings()]);
      return { items: m.items, settings: s };
    }, []),
    { pollMs: 20000 },
  );

  const setStatus = async (m: Mandate, status: 'active' | 'paused') => {
    setMsg(null);
    try {
      const out = await ask({
        title: status === 'paused' ? 'Pause auto-send' : 'Resume auto-send',
        sub: m.label,
        run: (pin) => api.patchMandate(m.id, { status }, pin),
      });
      if (out) {
        setMsg(status === 'paused' ? `${m.label} is paused.` : `${m.label} is running again.`);
        q.reload();
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    }
  };

  return (
    <Screen
      title="Auto-send"
      refreshing={q.refreshing}
      onRefresh={q.refresh}
      right={<CircleButton icon="plus" label="New auto-send" bg={c.bg} onPress={() => router.push({ pathname: '/chat', params: { prefill: 'Set up a monthly auto-send to Ibu, Adik and Savings', auto: '1' } })} />}
    >
      {!q.data && !q.error && <Loading />}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {msg && <Note icon="check">{msg}</Note>}
      {q.data?.items.map((m) => (
        <MandateCard key={m.id} m={m} now={now} onPause={() => setStatus(m, 'paused')} onResume={() => setStatus(m, 'active')} />
      ))}
      {q.data && (
        <Card style={{ backgroundColor: c.soft, borderColor: 'transparent' }} onPress={() => router.push('/settings')}>
          <T v="h3">Limits for every auto-send</T>
          <KV
            rows={[
              ['Sends without asking up to', `${usdc(q.data.settings.confirmAbove)} USDC`],
              ['Per transfer limit', `${usdc(q.data.settings.perTxLimit)} USDC`],
              ['Daily limit', `${usdc(q.data.settings.dailyLimit)} USDC`],
              ['Recipients', 'Contacts only'],
            ]}
          />
        </Card>
      )}
      <Note icon="lock">Changes need your PIN. Tam can draft an auto-send in chat, but only you can turn it on.</Note>
    </Screen>
  );
}

function MandateCard({ m, now, onPause, onResume }: { m: Mandate; now: Date; onPause: () => void; onResume: () => void }) {
  const total = Number.parseFloat(m.total) || 1;
  const soon = m.nextRunAt && Date.parse(m.nextRunAt) - now.getTime() < 3600000;
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">{m.label}</T>
          <T v="small">
            {usdc(m.total)} USDC · {scheduleLabel(m.schedule)}
          </T>
        </View>
        {m.status === 'paused' ? (
          <Badge label="Paused" kind="block" />
        ) : m.status === 'postponed' ? (
          <Badge label="Postponed" kind="warn" />
        ) : m.nextRunAt ? (
          <View style={{ backgroundColor: soon ? c.stabilo : c.soft, borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: 'center' }}>
            <T v="smallMedium">{untilLabel(m.nextRunAt, now)}</T>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', height: 8, gap: 3, borderRadius: 999, overflow: 'hidden' }}>
        {m.recipients.map((x, i) => (
          <View key={x.contactId} style={{ flex: Number.parseFloat(x.amount) / total, backgroundColor: SPLIT[i % SPLIT.length] }} />
        ))}
      </View>
      <View style={{ gap: 8 }}>
        {m.recipients.map((x, i) => (
          <View key={x.contactId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: SPLIT[i % SPLIT.length] }} />
            <T v="body" style={{ flex: 1 }}>
              {x.name}
            </T>
            <T v="bodyMedium">{usdc(x.amount)} USDC</T>
          </View>
        ))}
      </View>

      <View style={{ height: 1, backgroundColor: c.line }} />
      <KV
        rows={[
          ['Next run', m.status === 'paused' || !m.nextRunAt ? 'Paused' : whenLabel(m.nextRunAt, now)],
          ['Keeps at least', `${usdc(m.minBalance)} USDC`],
          ['Last run', m.lastRun ? `${shortDate(m.lastRun.at)} · ${m.lastRun.status === 'sent' ? 'Sent' : m.lastRun.status === 'postponed' ? 'Postponed' : 'Failed'}` : 'Not yet'],
        ]}
      />
      {m.status === 'postponed' && (
        <Note icon="clock" tone="soft">
          {`The last run waited because your balance would drop below ${usdc(m.minBalance)} USDC. It tries again on the next run.${m.consecutivePostpones >= 2 ? ' After 3 waits in a row it pauses itself.' : ''}`}
        </Note>
      )}
      {m.lastRun?.txs[0] && <TxLink tx={m.lastRun.txs[0]} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {m.status === 'paused' ? <Pill label="Resume" icon="play" kind="stabilo" onPress={onResume} /> : <Pill label="Pause" icon="pause" kind="pink" onPress={onPause} />}
      </View>
    </Card>
  );
}

