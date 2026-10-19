import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { usePin } from '@/components/Pin';
import { Screen } from '@/components/Screen';
import { Button, Note, Pill, T } from '@/components/ui';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/types';
import { c, f } from '@/theme';

export default function NewContact() {
  const ask = usePin();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const valid = name.trim().length > 0 && /^0x[0-9a-fA-F]{40}$/.test(address.trim());

  const save = async () => {
    setErr(null);
    try {
      const ct = await ask({ title: `Add ${name.trim()}`, sub: 'Tam will be allowed to send to this address', run: (pin) => api.addContact(name.trim(), address.trim(), pin) });
      if (ct) router.back();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not add this contact. Try again.');
    }
  };

  return (
    <Screen title="Add contact" footer={<Button label="Save contact" disabled={!valid} onPress={save} />}>
      <View style={{ gap: 8 }}>
        <T v="label">Name</T>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="For example Bapak"
          placeholderTextColor={c.silver}
          style={inp}
          autoCapitalize="words"
          accessibilityLabel="Contact name"
        />
      </View>
      <View style={{ gap: 8 }}>
        <T v="label">Wallet address on Base</T>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="0x…"
          placeholderTextColor={c.silver}
          style={[inp, { fontFamily: f.mono, fontSize: 14 }]}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Wallet address"
        />
        <Pill
          label="Paste"
          icon="paste"
          kind="line"
          small
          onPress={async () => {
            const t = await Clipboard.getStringAsync();
            if (t) setAddress(t.trim());
          }}
        />
        {address.length > 0 && !/^0x[0-9a-fA-F]{40}$/.test(address.trim()) && (
          <T v="small" style={{ color: c.pinkInk }}>
            An address starts with 0x and has 42 characters.
          </T>
        )}
      </View>
      {err && (
        <Note icon="block" tone="pink">
          {err}
        </Note>
      )}
      <Note icon="shield">Check the address with the person by phone, not by a forwarded message. Tam warns you if it looks like someone you already have.</Note>
    </Screen>
  );
}

const inp = {
  height: 52,
  borderRadius: 14,
  backgroundColor: c.soft,
  paddingHorizontal: 16,
  fontFamily: f.regular,
  fontSize: 16,
  color: c.ink,
} as const;
