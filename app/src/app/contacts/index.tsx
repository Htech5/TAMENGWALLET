import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { usePin } from '@/components/Pin';
import { Screen } from '@/components/Screen';
import { Avatar, CircleButton, ErrorBox, Loading, Note, Pill, Row, Section, T } from '@/components/ui';
import { api } from '@/lib/api';
import { shortDate } from '@/lib/format';
import { useLoad } from '@/lib/hooks';
import { ApiError, Contact } from '@/lib/types';
import { c, f } from '@/theme';

export default function Contacts() {
  const ask = usePin();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useLoad(
    useCallback(async () => {
      const [ct, m] = await Promise.all([api.getContacts(), api.getMandates()]);
      const savings = m.items.flatMap((x) => x.recipients).find((x) => x.contactId === 'savings');
      return { items: ct.items, savings };
    }, []),
  );

  const items = (q.data?.items ?? []).filter((x) => `${x.name} ${x.address}`.toLowerCase().includes(query.toLowerCase()));

  const remove = async (ct: Contact) => {
    setMsg(null);
    try {
      const done = await ask({ title: `Remove ${ct.name}`, sub: 'Tam will no longer send to this address', run: (pin) => api.deleteContact(ct.id, pin).then(() => true) });
      if (done) {
        setMsg(`${ct.name} was removed.`);
        setOpen(null);
        q.reload();
      }
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'Could not remove this contact.');
    }
  };

  return (
    <Screen title="Contacts" right={<CircleButton icon="plus" label="Add contact" bg={c.bg} onPress={() => router.push('/contacts/new')} />} refreshing={q.refreshing} onRefresh={q.refresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.soft, borderRadius: 999, paddingHorizontal: 16, height: 48 }}>
        <Icon name="search" size={18} color={c.silver} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or address"
          placeholderTextColor={c.silver}
          style={{ flex: 1, fontFamily: f.regular, fontSize: 15, color: c.ink }}
          accessibilityLabel="Search contacts"
        />
      </View>
      <Note icon="shield">Tam only sends to people on this list. Adding or removing someone needs your PIN.</Note>
      {msg && <Note icon="check">{msg}</Note>}
      {!q.data && !q.error && <Loading />}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}

      {q.data && (
        <>
          <Section>People</Section>
          <View>
            {items.map((ct, i) => (
              <View key={ct.id}>
                <Row
                  first={i === 0}
                  onPress={() => setOpen(open === ct.id ? null : ct.id)}
                  left={<Avatar name={ct.name} />}
                  title={ct.name}
                  sub={<T v="mono">{ct.addressShort}</T>}
                  right={<Icon name="chev" size={18} />}
                />
                {open === ct.id && (
                  <View style={{ backgroundColor: c.soft, borderRadius: 16, padding: 14, gap: 10, marginBottom: 8 }}>
                    <T v="mono" selectable style={{ fontSize: 12 }}>
                      {ct.address}
                    </T>
                    <T v="caption">Verified {shortDate(ct.verifiedAt)}</T>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pill label="Copy address" icon="copy" kind="line" small onPress={() => Clipboard.setStringAsync(ct.address)} />
                      <Pill label="Send money" icon="send" kind="ink" small onPress={() => router.push({ pathname: '/send', params: { to: ct.id } })} />
                      <Pill label="Remove" kind="pink" small onPress={() => remove(ct)} />
                    </View>
                  </View>
                )}
              </View>
            ))}
            {items.length === 0 && <T v="small">No contacts match.</T>}
          </View>
          {q.data.savings && (
            <>
              <Section>Yours</Section>
              <Row first left={<Avatar name="Savings" color={c.stabilo} />} title="Savings wallet" sub={<T v="mono">{q.data.savings.addressShort}</T>} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
