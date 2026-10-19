import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ActivityRow } from '@/components/ActivityRow';
import { Icon } from '@/components/Icon';
import { usePin } from '@/components/Pin';
import { Tam } from '@/components/Tam';
import { Badge, Button, Card, CircleButton, ErrorBox, Loading, Note, Pill, T } from '@/components/ui';
import { api } from '@/lib/api';
import { rupiah, untilLabel, usdc, whenLabel } from '@/lib/format';
import { useLoad, useNow } from '@/lib/hooks';
import { ActivityEvent, ApiError, Wallet } from '@/lib/types';
import { c, f, r, shadow } from '@/theme';

export default function Home() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const ask = usePin();
  const [msg, setMsg] = useState<string | null>(null);
  const home = useLoad(
    useCallback(async () => {
      const [wallet, activity] = await Promise.all([api.getWallet(), api.getActivity()]);
      return { wallet, activity: activity.items };
    }, []),
    { pollMs: 15000 },
  );

  const w = home.data?.wallet;
  const items = home.data?.activity ?? [];
  const newBlock = items.find((e) => e.type === 'attempt_blocked' && !e.read);

  const pauseNext = async () => {
    if (!w?.nextRun) return;
    setMsg(null);
    try {
      const done = await ask({
        title: 'Pause this auto-send',
        sub: `${w.nextRun.label} will stop until you resume it`,
        run: (pin) => api.patchMandate(w.nextRun!.mandateId, { status: 'paused' }, pin),
      });
      if (done) {
        setMsg(`${w.nextRun.label} is paused.`);
        home.reload();
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not pause. Try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={home.refreshing} onRefresh={home.refresh} tintColor={c.ink} />}
      >
        <View style={[st.band, { paddingTop: insets.top + 16 }]}>
          <View style={st.bandRow}>
            <View style={st.profilePill}>
              <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} style={st.avatar}>
                <T style={{ fontFamily: f.medium, fontSize: 22, color: c.white }}>{(w?.owner.name ?? 'R').charAt(0)}</T>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Activity" onPress={() => router.push('/activity')} style={st.activityBtn}>
                <Icon name="pulse" size={22} />
                <T v="caption" style={{ color: c.ink2, fontSize: 13 }}>
                  Activity
                </T>
              </Pressable>
            </View>
            <View style={{ flex: 1 }} />
            <CircleButton icon="bell" label="Notifications" bg={w && w.unreadEvents > 0 ? c.pink : c.soft} onPress={() => router.push('/notifications')} />
            <CircleButton icon="sliders" label="Settings" bg={c.soft} onPress={() => router.push('/settings')} />
          </View>
        </View>

        <View style={st.body}>
          {!w && !home.error && <Loading />}
          {home.error && !w && <ErrorBox message={home.error} onRetry={home.reload} />}
          {w && (
            <>
              <BalanceCard w={w} />

              <Pressable accessibilityRole="button" onPress={() => router.push('/savings-info')} style={({ pressed }) => [st.saved, pressed && { opacity: 0.8 }]}>
                <Icon name="gift" size={18} />
                <T v="body" style={{ flex: 1, fontSize: 14 }}>
                  Saved <T style={{ fontFamily: f.semibold, fontSize: 14 }}>{usdc(w.feesSaved.totalUsd)} USD</T> on fees this month
                </T>
                <Icon name="chev" size={16} />
              </Pressable>

              {w.paused && (
                <Note icon="pause" tone="pink">
                  Tam is paused. No automatic transfers will run until you turn it back on in Settings.
                </Note>
              )}

              {newBlock ? <AlertCard e={newBlock} onDismiss={home.reload} /> : <ProtectionCard w={w} />}

              <Upcoming w={w} now={now} onPause={pauseNext} />
              {msg && <Note icon="check">{msg}</Note>}

              <Card style={{ gap: 4 }}>
                <View style={[st.cardHead, { marginBottom: 8 }]}>
                  <T v="h3">Recent activity</T>
                  <Pressable onPress={() => router.push('/activity')} hitSlop={8}>
                    <T v="smallMedium" style={{ textDecorationLine: 'underline' }}>
                      See all
                    </T>
                  </Pressable>
                </View>
                {items.slice(0, 3).map((e, i) => (
                  <ActivityRow key={e.id} e={e} now={now} first={i === 0} />
                ))}
              </Card>
            </>
          )}
        </View>
      </ScrollView>

      <BottomBar bottom={insets.bottom} />
    </View>
  );
}

function BalanceCard({ w }: { w: Wallet }) {
  return (
    <View style={st.balance}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="g" cx="0%" cy="0%" rx="120%" ry="95%" fx="0%" fy="0%">
            <Stop offset="0" stopColor={c.stabilo} stopOpacity={1} />
            <Stop offset="0.38" stopColor={c.stabilo} stopOpacity={0.55} />
            <Stop offset="0.75" stopColor={c.soft} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={c.soft} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#g)" />
      </Svg>
      <View style={st.cardHead}>
        <T style={{ fontFamily: f.light, fontSize: 24, color: '#333' }}>Balance</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="small" style={{ color: c.ink2 }}>
            Base Sepolia testnet
          </T>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.ink }} />
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <T v="display" adjustsFontSizeToFit numberOfLines={1}>
          {usdc(w.balance)} USDC
        </T>
        <T v="small" style={{ color: c.ink2 }}>
          About {rupiah(w.balance)}
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        <Button label="Send" icon="send" style={{ flex: 1 }} onPress={() => router.push('/send')} />
        <Button label="Add" icon="add" kind="white" style={{ flex: 1 }} onPress={() => router.push('/add-funds')} />
      </View>
    </View>
  );
}

function ProtectionCard({ w }: { w: Wallet }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/activity', params: { filter: 'blocked' } })}
      style={({ pressed }) => [st.stab, pressed && { opacity: 0.9 }]}
    >
      <View style={st.stabIc}>
        <Icon name="shield" size={22} color={c.stabilo} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="h3">
          {w.protection.blocked} blocked · {w.protection.checked} checked
        </T>
        <T v="small" style={{ color: c.stabiloInk }}>
          This month. Tap to see why.
        </T>
      </View>
      <Icon name="chev" size={20} />
    </Pressable>
  );
}

function AlertCard({ e, onDismiss }: { e: ActivityEvent; onDismiss: () => void }) {
  return (
    <View style={[st.stab, { flexDirection: 'column', alignItems: 'stretch', gap: 12 }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Tam size={40} mood="alert" />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="h3">Tam stopped a transfer</T>
          <T v="small" style={{ color: c.stabiloInk }}>
            {e.reasons?.[0]?.message ?? e.title} Nothing left your wallet.
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginLeft: 52 }}>
        <Pill label="Review" kind="ink" small onPress={() => router.push({ pathname: '/activity/[id]', params: { id: e.id } })} />
        <Pill
          label="Dismiss"
          kind="line"
          small
          onPress={async () => {
            await api.markRead(e.id);
            onDismiss();
          }}
        />
      </View>
    </View>
  );
}

function Upcoming({ w, now, onPause }: { w: Wallet; now: Date; onPause: () => void }) {
  const n = w.nextRun;
  return (
    <Card style={{ gap: 12 }}>
      <View style={st.cardHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="h3">Upcoming transfer</T>
          <T v="body" style={{ color: c.silver }}>
            {n ? `${usdc(n.total)} USDC · ${n.label}` : 'Nothing scheduled'}
          </T>
        </View>
        {n && n.status !== 'paused' ? <Pill label="Pause" icon="pause" kind="pink" onPress={onPause} /> : null}
      </View>
      {n && (
        <>
          <View style={st.hr} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={[st.when, n.status === 'postponed' ? { backgroundColor: '#FFF1D1' } : untilMs(n.at, now) < 3600000 ? { backgroundColor: c.stabilo } : null]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.ink }} />
              <T v="smallMedium">{untilLabel(n.at, now)}</T>
            </View>
            <T v="small">{whenLabel(n.at, now)}</T>
          </View>
          {n.recipients.map((rcp) => (
            <View key={rcp.name} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="body">{rcp.name}</T>
              <T v="bodyMedium" style={{ fontVariant: ['tabular-nums'] }}>
                {usdc(rcp.amount)} USDC
              </T>
            </View>
          ))}
          {n.status === 'postponed' && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Badge label="Postponed" kind="warn" />
              <T v="small" style={{ flex: 1 }}>
                Last run waited for enough balance
              </T>
            </View>
          )}
        </>
      )}
      <View style={st.hr} />
      <View style={st.cardHead}>
        <T v="small">Runs on its own within your limits</T>
        <Pressable onPress={() => router.push('/autosend')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <T v="smallMedium">See all</T>
          <Icon name="chev" size={14} />
        </Pressable>
      </View>
    </Card>
  );
}

const untilMs = (iso: string, now: Date) => Date.parse(iso) - now.getTime();

function BottomBar({ bottom }: { bottom: number }) {
  return (
    <View style={[st.bar, { paddingBottom: 10 + bottom }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Auto-send" onPress={() => router.push('/autosend')} style={st.barItem}>
        <Icon name="repeat" size={24} color={c.ink2} />
        <T v="small" style={{ color: c.ink2 }}>
          Auto-send
        </T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Ask Tam" onPress={() => router.push('/chat')} style={st.barItem}>
        <View style={st.tamBtn}>
          <Tam size={30} />
        </View>
        <T v="smallMedium">Ask Tam</T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Contacts" onPress={() => router.push('/contacts')} style={st.barItem}>
        <Icon name="people" size={24} color={c.ink2} />
        <T v="small" style={{ color: c.ink2 }}>
          Contacts
        </T>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  band: { backgroundColor: c.band, paddingHorizontal: 20, paddingBottom: 44 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profilePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.soft, borderRadius: r.pill, paddingRight: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.blue, alignItems: 'center', justifyContent: 'center' },
  activityBtn: { alignItems: 'center', paddingLeft: 12, gap: 2 },
  body: { backgroundColor: c.bg, borderTopLeftRadius: r.xxl, borderTopRightRadius: r.xxl, marginTop: -24, padding: 20, gap: 14, flexGrow: 1 },
  balance: { borderRadius: r.xxl, padding: 22, gap: 10, overflow: 'hidden', backgroundColor: c.soft },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.soft, borderRadius: r.pill, paddingHorizontal: 16, height: 44 },
  stab: { backgroundColor: c.stabilo, borderRadius: r.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  stabIc: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  hr: { height: 1, backgroundColor: c.line },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.soft, borderRadius: r.pill, height: 28, paddingHorizontal: 10 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line, flexDirection: 'row', paddingTop: 10, ...shadow },
  barItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  tamBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.stabilo, alignItems: 'center', justifyContent: 'center', marginTop: -34, borderWidth: 4, borderColor: c.bg, ...shadow },
});
