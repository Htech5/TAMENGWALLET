import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Avatar, Button, Loading, Note, T } from '@/components/ui';
import { api } from '@/lib/api';
import { rupiah, usdc } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { c, f } from '@/theme';

export default function Send() {
  const params = useLocalSearchParams<{ to?: string }>();
  const [to, setTo] = useState<string | undefined>(params.to);
  const [amount, setAmount] = useState('');
  const q = useLoad(
    useCallback(async () => {
      const [ct, w, s] = await Promise.all([api.getContacts(), api.getWallet(), api.getSettings()]);
      return { contacts: [...ct.items, { id: 'savings', name: 'Savings', address: '', addressShort: '', verifiedAt: '' }], w, s };
    }, []),
  );

  const press = (k: string) => {
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.' && (a.includes('.') || a === '')) return a === '' ? '0.' : a;
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (a === '0' && k !== '.') return k;
      if (a.replace('.', '').length >= 7) return a;
      return a + k;
    });
  };

  const amt = Number.parseFloat(amount || '0');
  const d = q.data;
  const recipient = d?.contacts.find((x) => x.id === to);
  const over = d ? amt > Number.parseFloat(d.w.balance) : false;
  const overLimit = d ? amt > Number.parseFloat(d.s.perTxLimit) : false;
  const needsOk = d ? amt > Number.parseFloat(d.s.confirmAbove) : false;
  const ready = !!recipient && amt > 0 && !over;

  const review = () => {
    if (!recipient) return;
    router.replace({ pathname: '/chat', params: { prefill: `Send ${amt.toFixed(2)} USDC to ${recipient.name}`, auto: '1' } });
  };

  return (
    <Screen title="Send money" footer={<Button label="Review transfer" disabled={!ready} onPress={review} />} bodyGap={16}>
      {!d && <Loading />}
      {d && (
        <>
          <T v="label">To</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {d.contacts.map((ct) => (
              <Pressable key={ct.id} accessibilityRole="button" accessibilityState={{ selected: to === ct.id }} onPress={() => setTo(ct.id)} style={st.recip}>
                <View style={[st.ring, to === ct.id && { borderColor: c.ink }]}>
                  <Avatar name={ct.name} size={54} color={ct.id === 'savings' ? c.stabilo : undefined} />
                </View>
                <T v="smallMedium" numberOfLines={1}>
                  {ct.name}
                </T>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => router.push('/contacts/new')} style={st.recip}>
              <View style={[st.ring, { borderStyle: 'dashed', borderColor: '#B5B5B5' }]}>
                <View style={{ width: 54, height: 54, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" />
                </View>
              </View>
              <T v="smallMedium">New</T>
            </Pressable>
          </ScrollView>

          <View style={{ alignItems: 'center', gap: 4, paddingVertical: 4 }}>
            <Text style={{ fontFamily: f.medium, fontSize: 52, letterSpacing: -1.2, color: amount ? c.ink : '#C4C4C4' }}>
              {amount || '0'}
              <Text style={{ fontSize: 22, color: c.ink2, fontFamily: f.regular }}> USDC</Text>
            </Text>
            <T v="small">
              You have {usdc(d.w.balance)} USDC{amt > 0 ? ` · About ${rupiah(amt)}` : ''}
            </T>
          </View>

          {over ? (
            <Note icon="block" tone="pink">
              That is more than your balance.
            </Note>
          ) : overLimit ? (
            <Note icon="block" tone="pink">
              {`Above your ${usdc(d.s.perTxLimit)} USDC per transfer limit, so Tam will block it. Change the limit in Settings first.`}
            </Note>
          ) : needsOk ? (
            <Note icon="shield" tone="blue">
              {`Above ${usdc(d.s.confirmAbove)} USDC, so Tam will ask you to confirm before it sends.`}
            </Note>
          ) : (
            <Note icon="shield">Tam checks your limits and contacts first, then sends it on Base.</Note>
          )}

          <View style={st.pad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
              <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete' : k} onPress={() => press(k)} style={({ pressed }) => [st.key, pressed && { backgroundColor: c.soft }]}>
                {k === 'del' ? <Icon name="delete" size={24} /> : <Text style={{ fontFamily: f.regular, fontSize: 26, color: c.ink }}>{k}</Text>}
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  recip: { width: 66, alignItems: 'center', gap: 6 },
  ring: { borderWidth: 2.5, borderColor: 'transparent', borderRadius: 34, padding: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 2 },
  key: { width: '32%', height: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
