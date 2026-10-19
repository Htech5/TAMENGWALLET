import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Sheet } from '@/components/Screen';
import { Button, Loading, Pill, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { c } from '@/theme';

const FAUCET = 'https://faucet.circle.com';

export default function AddFunds() {
  const q = useLoad(useCallback(() => api.getWallet(), []));
  const [copied, setCopied] = useState(false);
  const w = q.data;

  return (
    <Sheet>
      <View style={{ gap: 4 }}>
        <T v="h2">Add funds</T>
        <T v="body" style={{ color: c.ink2 }}>
          Send USDC on Base to this address. It usually arrives in under a minute.
        </T>
      </View>
      {!w ? (
        <Loading />
      ) : (
        <>
          <View style={{ alignSelf: 'center', padding: 14, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.white }}>
            <QRCode value={w.address} size={168} color={c.ink} backgroundColor={c.white} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.soft, borderRadius: 14, paddingVertical: 10, paddingLeft: 16, paddingRight: 10 }}>
            <T v="mono" selectable numberOfLines={1} style={{ flex: 1, fontSize: 13 }}>
              {w.address}
            </T>
            <Pill
              label={copied ? 'Copied' : 'Copy'}
              icon={copied ? 'check' : 'copy'}
              kind="ink"
              small
              onPress={async () => {
                await Clipboard.setStringAsync(w.address);
                setCopied(true);
              }}
            />
          </View>
          <View style={{ gap: 10 }}>
            {[
              'Open your exchange and choose withdraw USDC.',
              'Pick Base as the network and paste this address.',
              'Other tokens show up as unverified, and Tam will not use them.',
            ].map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.stabilo, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="smallMedium">{i + 1}</T>
                </View>
                <T v="body" style={{ flex: 1, color: c.ink2 }}>
                  {s}
                </T>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Get test USDC" kind="white" style={{ flex: 1 }} onPress={() => WebBrowser.openBrowserAsync(FAUCET)} />
            <Button label="Done" style={{ flex: 1 }} onPress={() => router.back()} />
          </View>
        </>
      )}
    </Sheet>
  );
}
