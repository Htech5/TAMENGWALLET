import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/lib/api';
import { chatStore, ChatItem } from '@/lib/chatStore';
import { scheduleLabel, shortHash, untilLabel, usdc } from '@/lib/format';
import { ApiError, ClarifyCard, Contact, DecisionCard, MandateDraftCard, TxRef } from '@/lib/types';
import { c, r } from '@/theme';
import { Icon } from './Icon';
import { usePin } from './Pin';
import { Badge, Button, Chip, KV, T } from './ui';

export function TxLink({ tx }: { tx: TxRef }) {
  const label = tx.status === 'confirmed' ? 'Confirmed on Base' : tx.status === 'pending' ? 'Waiting for the next block' : tx.status === 'failed' ? 'Failed on chain' : 'Status unknown';
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => WebBrowser.openBrowserAsync(tx.explorerUrl)}
      style={({ pressed }) => [st.tx, pressed && { opacity: 0.8 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <T v="smallMedium">{label}</T>
        <T v="mono">{shortHash(tx.hash)}</T>
      </View>
      <T v="smallMedium" style={{ textDecorationLine: 'underline' }}>
        BaseScan
      </T>
      <Icon name="external" size={16} />
    </Pressable>
  );
}

function useActions(item: ChatItem) {
  const ask = usePin();
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (approve: boolean, intentId: string, title: string, sub: string) => {
    setErr(null);
    try {
      if (!approve) {
        setBusy('no');
        const out = await api.confirm(intentId, false);
        chatStore.update(item.id, { outcome: out });
        return;
      }
      const out = await ask({ title, sub, run: (pin) => api.confirm(intentId, true, pin) });
      if (out) chatStore.update(item.id, { outcome: out });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };
  return { busy, err, run };
}

export function DecisionView({ item, card }: { item: ChatItem; card: DecisionCard }) {
  const { busy, err, run } = useActions(item);
  const out = item.outcome;
  // When the requested address is not the contact's (look-alike), show the address that was asked for,
  // never the trusted contact's, so the card can't make a fake address look legitimate.
  const to = card.rawAddressShort
    ? `${card.rawAddressShort}${card.recipient ? `, not ${card.recipient.name}'s` : ''}`
    : card.recipient
      ? `${card.recipient.name} · ${card.recipient.addressShort}`
      : 'Unknown address';

  let tone: 'allow' | 'confirm' | 'deny' | 'done' | 'cancel' = card.decision;
  if (out?.status === 'executed') tone = 'done';
  if (out && out.status !== 'executed') tone = 'cancel';

  const badge: [string, Parameters<typeof Badge>[0]['kind']] =
    tone === 'allow' || tone === 'done'
      ? ['Sent', 'added']
      : tone === 'confirm'
        ? ['Needs your OK', 'confirm']
        : tone === 'deny'
          ? ['Blocked', 'block']
          : ['Not sent', 'muted'];

  const title =
    tone === 'deny'
      ? 'No money moved'
      : tone === 'cancel'
        ? out?.status === 'expired'
          ? 'This request expired'
          : out?.status === 'denied'
            ? 'Blocked when re-checked'
            : 'Cancelled. Nothing was sent.'
        : `${usdc(card.amount)} USDC to ${card.rawAddressShort ?? card.recipient?.name ?? 'unknown'}`;

  const tx = out?.tx ?? card.tx;

  return (
    <View style={[st.card, tone === 'deny' && { borderColor: c.pink }, (tone === 'allow' || tone === 'done') && { borderColor: '#C9E86A' }]}>
      <View style={st.head}>
        <T v="bodyMedium" style={{ flex: 1 }}>
          {title}
        </T>
        <Badge label={badge[0]} kind={badge[1]} />
      </View>
      {tone !== 'cancel' && (
        <View style={{ paddingHorizontal: 14 }}>
          <KV
            rows={[
              ...(Number.parseFloat(card.amount) > 0 ? ([['Amount', `${usdc(card.amount)} USDC`]] as [string, string][]) : []),
              ['To', to],
              ['Network', 'Base Sepolia'],
              ...(tone !== 'deny'
                ? ([
                    ['Network fee', `${card.networkFeeUsd} USD`],
                    ['Saved vs average fee', `${usdc(card.savedVsBenchmarkUsd)} USD`],
                  ] as [string, string][])
                : []),
            ]}
          />
        </View>
      )}
      {tone === 'confirm' && (
        <View style={[st.why, { backgroundColor: c.blueTint }]}>
          {card.reasons.map((rs) => (
            <T key={rs.code} v="small" style={{ color: c.blueInk }}>
              {rs.message}
            </T>
          ))}
          {card.expiresAt && (
            <T v="caption" style={{ color: c.blueInk, marginTop: 2 }}>
              {untilLabel(card.expiresAt).replace('In', 'Expires in')}
            </T>
          )}
        </View>
      )}
      {(tone === 'deny' || out?.status === 'denied') && (
        <View style={[st.why, { backgroundColor: c.pinkTint }]}>
          <T v="smallMedium" style={{ color: c.pinkInk }}>
            I stopped this because
          </T>
          {(out?.reasons ?? card.reasons).map((rs) => (
            <View key={rs.code} style={{ flexDirection: 'row', gap: 8 }}>
              <T v="small" style={{ color: c.pinkInk }}>
                •
              </T>
              <T v="small" style={{ color: c.pinkInk, flex: 1 }}>
                {rs.message}
              </T>
            </View>
          ))}
        </View>
      )}
      {tx && (tone === 'allow' || tone === 'done') && (
        <View style={{ paddingHorizontal: 14 }}>
          <TxLink tx={tx} />
        </View>
      )}
      {tone === 'confirm' && (
        <View style={st.acts}>
          <Button label="Cancel" kind="white" height={44} style={{ flex: 1 }} loading={busy === 'no'} onPress={() => run(false, card.intentId, '', '')} />
          <Button
            label="Confirm"
            height={44}
            style={{ flex: 1 }}
            loading={busy === 'yes'}
            onPress={() => run(true, card.intentId, `Send ${usdc(card.amount)} USDC`, `To ${card.recipient?.name ?? 'this address'}. Enter your PIN to confirm.`)}
          />
        </View>
      )}
      {tone === 'deny' && (
        <View style={st.acts}>
          <Button label="See in Activity" kind="white" height={44} style={{ flex: 1 }} onPress={() => router.push({ pathname: '/activity', params: { filter: 'blocked' } })} />
        </View>
      )}
      {err && (
        <T v="small" style={{ color: c.pinkInk, paddingHorizontal: 14 }}>
          {err}
        </T>
      )}
      <View style={{ height: 2 }} />
    </View>
  );
}

export function ClarifyView({ card, onPick }: { card: ClarifyCard; onPick: (v: string) => void }) {
  return (
    <View style={[st.card, { paddingVertical: 12, paddingHorizontal: 14 }]}>
      <T v="bodyMedium">{card.question}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(card.options ?? []).map((o) => (
          <Chip
            key={o}
            label={o}
            onPress={() => (/add/i.test(o) ? router.push('/contacts/new') : onPick(o))}
          />
        ))}
      </View>
    </View>
  );
}

export function MandateDraftView({ item, card, contacts }: { item: ChatItem; card: MandateDraftCard; contacts: Contact[] }) {
  const { busy, err, run } = useActions(item);
  const out = item.outcome;
  const name = (id: string) => (id === 'savings' ? 'Savings' : contacts.find((x) => x.id === id)?.name ?? id);
  const total = card.mandate.recipients.reduce((s, x) => s + Number.parseFloat(x.amount), 0);
  const done = out?.status === 'executed';
  return (
    <View style={[st.card, done && { borderColor: '#C9E86A' }]}>
      <View style={st.head}>
        <T v="bodyMedium" style={{ flex: 1 }}>
          {done ? 'Auto-send is on' : out ? 'Not turned on' : 'New auto-send'}
        </T>
        <Badge label={done ? 'Active' : out ? 'Cancelled' : 'Draft'} kind={done ? 'added' : out ? 'muted' : 'confirm'} />
      </View>
      <View style={{ paddingHorizontal: 14, gap: 10 }}>
        <T v="small" style={{ color: c.ink2 }}>
          {card.summary}
        </T>
        {card.mandate.recipients.map((x) => (
          <View key={x.contactId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="body">{name(x.contactId)}</T>
            <T v="bodyMedium">{usdc(x.amount)} USDC</T>
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: c.line }} />
        <KV
          rows={[
            ['Total each run', `${usdc(total)} USDC`],
            ['Schedule', scheduleLabel(card.mandate.schedule)],
            ['Keeps at least', `${usdc(card.mandate.minBalance)} USDC`],
          ]}
        />
      </View>
      {!out && (
        <View style={st.acts}>
          <Button label="Cancel" kind="white" height={44} style={{ flex: 1 }} loading={busy === 'no'} onPress={() => run(false, card.intentId, '', '')} />
          <Button label="Turn on" height={44} style={{ flex: 1 }} onPress={() => run(true, card.intentId, 'Turn on auto-send', 'Enter your PIN. Chat alone can never turn this on.')} />
        </View>
      )}
      {done && (
        <View style={st.acts}>
          <Button label="Open Auto-send" kind="white" height={44} style={{ flex: 1 }} onPress={() => router.push('/autosend')} />
        </View>
      )}
      {err && (
        <T v="small" style={{ color: c.pinkInk, paddingHorizontal: 14 }}>
          {err}
        </T>
      )}
      <View style={{ height: 2 }} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderColor: c.line, borderRadius: 18, gap: 12, backgroundColor: c.bg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  why: { marginHorizontal: 14, padding: 12, borderRadius: r.md, gap: 4 },
  acts: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.soft, borderRadius: r.md, padding: 12 },
});

