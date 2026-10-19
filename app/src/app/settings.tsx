import { useCallback, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { usePin } from '@/components/Pin';
import { Screen } from '@/components/Screen';
import { Button, Card, ErrorBox, Loading, Note, Section, T, Toggle } from '@/components/ui';
import { api } from '@/lib/api';
import { usdc } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { ApiError, Settings as S } from '@/lib/types';
import { c, f } from '@/theme';

type NumKey = 'confirmAbove' | 'perTxLimit' | 'dailyLimit' | 'savingsTarget';

const ROWS: { key: NumKey; title: string; sub: string }[] = [
  { key: 'confirmAbove', title: 'Ask me before sending above', sub: 'Smaller transfers to contacts go out on their own' },
  { key: 'perTxLimit', title: 'Per transfer limit', sub: 'Anything bigger is always blocked' },
  { key: 'dailyLimit', title: 'Daily limit', sub: 'All transfers in one day added up' },
  { key: 'savingsTarget', title: 'Savings goal', sub: 'Shown on your savings progress' },
];

export default function Settings() {
  const ask = usePin();
  const q = useLoad(useCallback(() => api.getSettings(), []));
  const [editing, setEditing] = useState<NumKey | null>(null);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [rowErr, setRowErr] = useState<string | null>(null);
  const s = q.data;

  const patch = async (body: Partial<S>, title: string, needsPin = true, inline = false) => {
    setMsg(null);
    setRowErr(null);
    try {
      const out = needsPin ? await ask({ title, run: (pin) => api.patchSettings(body, pin) }) : await api.patchSettings(body);
      if (out) {
        q.setData(out);
        setEditing(null);
        setMsg({ text: 'Saved.' });
      }
    } catch (e) {
      const text = e instanceof ApiError ? e.message : 'Could not save. Try again.';
      // Server-side limit checks (400 VALIDATION_ERROR) stay next to the field being edited.
      if (inline && e instanceof ApiError && e.code === 'VALIDATION_ERROR') setRowErr(text);
      else setMsg({ text, bad: true });
    }
  };

  return (
    <Screen title="Settings">
      {!s && !q.error && <Loading />}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {s && (
        <>
          <Card style={{ borderColor: s.paused ? c.pink : c.line, backgroundColor: s.paused ? c.pinkTint : c.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T v="bodyMedium">Pause Tam</T>
                <T v="small">{s.paused ? 'Paused. No automatic transfers will run.' : 'Stops every automatic transfer right away. Turning it back on needs your PIN.'}</T>
              </View>
              <Toggle
                label="Pause Tam"
                value={s.paused}
                onChange={(v) => (v ? patch({ paused: true }, '', false) : patch({ paused: false }, 'Turn Tam back on'))}
              />
            </View>
          </Card>

          {msg && (
            <Note icon={msg.bad ? 'block' : 'check'} tone={msg.bad ? 'pink' : 'soft'}>
              {msg.text}
            </Note>
          )}

          <Section>Safety limits</Section>
          <View>
            {ROWS.map((row, i) => (
              <View key={row.key} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, paddingVertical: 14, gap: 10 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditing(editing === row.key ? null : row.key);
                    setDraft(s[row.key]);
                    setRowErr(null);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <T v="bodyMedium">{row.title}</T>
                    <T v="small">{row.sub}</T>
                  </View>
                  <T v="body" style={{ color: c.ink2 }}>
                    {usdc(s[row.key])} USDC
                  </T>
                  <Icon name="chev" size={18} />
                </Pressable>
                {editing === row.key && (
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <TextInput
                      value={draft}
                      onChangeText={setDraft}
                      keyboardType="decimal-pad"
                      style={{ flex: 1, height: 48, borderRadius: 12, backgroundColor: c.soft, paddingHorizontal: 14, fontFamily: f.medium, fontSize: 16, color: c.ink }}
                      accessibilityLabel={row.title}
                    />
                    <Button
                      label="Save"
                      height={48}
                      style={{ width: 96 }}
                      disabled={!/^\d+(\.\d{1,6})?$/.test(draft.trim())}
                      onPress={() => patch({ [row.key]: Number.parseFloat(draft).toFixed(2) } as Partial<S>, row.title, true, true)}
                    />
                  </View>
                )}
                {editing === row.key && rowErr && (
                  <T v="small" style={{ color: c.pinkInk }}>
                    {rowErr}
                  </T>
                )}
              </View>
            ))}
            <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T v="bodyMedium">New addresses</T>
                <T v="small">Add them to Contacts first</T>
              </View>
              <T v="body" style={{ color: c.ink2 }}>
                Always blocked
              </T>
            </View>
            <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 3 }}>
                <T v="bodyMedium">Unlimited token approvals</T>
                <T v="small">A site can never get open access to your USDC</T>
              </View>
              <T v="body" style={{ color: c.ink2 }}>
                Never
              </T>
            </View>
          </View>

          <Section>Demo</Section>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <T v="bodyMedium">Demo mode</T>
              <T v="small">Lets an auto-send run every few minutes so you can watch it work</T>
            </View>
            <Toggle label="Demo mode" value={s.demoMode} onChange={(v) => patch({ demoMode: v }, v ? 'Turn on demo mode' : 'Turn off demo mode')} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <T v="bodyMedium" style={{ flex: 1 }}>
              Network
            </T>
            <T v="body" style={{ color: c.ink2 }}>
              Base Sepolia testnet
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <T v="bodyMedium" style={{ flex: 1 }}>
              Server
            </T>
            <T v="body" style={{ color: c.ink2 }}>
              {api.mode === 'mock' ? 'Sample data' : 'Connected'}
            </T>
          </View>

          <Note icon="lock">Every change here needs your PIN except pausing. Tam cannot change these settings from chat.</Note>
        </>
      )}
    </Screen>
  );
}
