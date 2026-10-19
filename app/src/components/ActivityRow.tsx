import { router } from 'expo-router';
import { View } from 'react-native';

import { listStamp, usdc } from '@/lib/format';
import type { ActivityEvent } from '@/lib/types';
import { c } from '@/theme';
import { IconName } from './Icon';
import { Avatar, Badge, BadgeKind, Row, T } from './ui';

export function eventLook(e: ActivityEvent): { icon: IconName; bg: string; fg?: string; badge?: [string, BadgeKind]; amount?: string; strike?: boolean } {
  switch (e.type) {
    case 'attempt_blocked':
      return { icon: 'block', bg: c.pink, badge: ['Blocked', 'block'], amount: e.amount ? usdc(e.amount) : undefined, strike: true };
    case 'run_postponed':
      return { icon: 'clock', bg: c.soft, badge: ['Postponed', 'warn'], amount: e.amount ? usdc(e.amount) : undefined, strike: true };
    case 'transfer_failed':
      return { icon: 'close', bg: c.soft, badge: ['Failed', 'block'], amount: e.amount ? usdc(e.amount) : undefined, strike: true };
    case 'mandate_paused':
    case 'agent_paused':
      return { icon: 'pause', bg: c.pinkTint, fg: c.pinkInk, badge: ['Paused', 'muted'] };
    case 'agent_resumed':
      return { icon: 'play', bg: c.stabilo, badge: ['Resumed', 'added'] };
    case 'transfer_sent':
    default: {
      const viaChat = e.source === 'chat';
      return {
        icon: 'send',
        bg: c.soft,
        badge: viaChat ? ['Sent', 'ok'] : ['Auto-send', 'ok'],
        amount: e.amount ? usdc(e.amount, { sign: '-' }) : undefined,
      };
    }
  }
}

/** Server titles repeat the amount; in lists the amount sits on the right, so shorten. */
export function eventTitle(e: ActivityEvent) {
  if (e.type === 'transfer_sent' && e.recipient) return `${e.recipient.contactId === 'savings' ? 'Moved to' : 'Sent to'} ${e.recipient.name}`;
  return e.title;
}

export function eventSub(e: ActivityEvent, now: Date) {
  const when = listStamp(e.at, now);
  if (e.type === 'attempt_blocked') return `${e.source === 'external' ? 'From a message you got' : 'From chat'} · ${when}`;
  if (e.type === 'run_postponed') return `Not enough balance · ${when}`;
  if (e.type === 'transfer_sent') return `${e.source === 'chat' ? 'You asked Tam' : 'Auto-send'} · ${when}`;
  return when;
}

export function ActivityRow({ e, now, first }: { e: ActivityEvent; now: Date; first?: boolean }) {
  const look = eventLook(e);
  return (
    <Row
      first={first}
      onPress={() => router.push({ pathname: '/activity/[id]', params: { id: e.id } })}
      left={<Avatar size={44} color={look.bg} icon={look.icon} iconColor={look.fg ?? c.ink} />}
      title={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {!e.read && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.pink }} />}
          <T v="bodyMedium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {eventTitle(e)}
          </T>
        </View>
      }
      sub={eventSub(e, now)}
      right={
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          {look.amount ? (
            <T v="bodyMedium" style={[{ fontVariant: ['tabular-nums'] }, look.strike && { textDecorationLine: 'line-through', color: c.silver }]}>
              {look.amount}
            </T>
          ) : null}
          {look.badge ? <Badge label={look.badge[0]} kind={look.badge[1]} /> : null}
        </View>
      }
    />
  );
}
