import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/lib/types';
import { c, f } from '@/theme';
import { Icon } from './Icon';
import { T } from './ui';

interface AskOpts<R> {
  title: string;
  sub?: string;
  run: (pin: string) => Promise<R>;
}

type Ask = <R>(opts: AskOpts<R>) => Promise<R | null>;

const Ctx = createContext<Ask | null>(null);

export function usePin(): Ask {
  const ask = useContext(Ctx);
  if (!ask) throw new Error('usePin must be inside PinProvider');
  return ask;
}

/**
 * Every sensitive action goes through here: the PIN is sent with the request as X-Pin,
 * a wrong PIN keeps the pad open with the server's message, anything else closes it.
 */
export function PinProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copy, setCopy] = useState({ title: '', sub: '' });
  const job = useRef<{ run: (pin: string) => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void } | null>(null);

  const ask = useCallback<Ask>((opts) => {
    setCopy({ title: opts.title, sub: opts.sub ?? 'Enter your 6 digit PIN' });
    setPin('');
    setError(null);
    setOpen(true);
    return new Promise((resolve, reject) => {
      job.current = { run: opts.run, resolve: resolve as (v: unknown) => void, reject };
    });
  }, []);

  const close = (value: unknown = null) => {
    setOpen(false);
    job.current?.resolve(value);
    job.current = null;
  };

  const submit = async (full: string) => {
    if (!job.current) return;
    setBusy(true);
    try {
      const out = await job.current.run(full);
      setBusy(false);
      close(out);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && (e.code === 'PIN_INVALID' || e.code === 'PIN_REQUIRED')) {
        setError(e.message);
        setPin('');
        return;
      }
      setOpen(false);
      const j = job.current;
      job.current = null;
      j?.reject(e);
    }
  };

  const press = (k: string) => {
    if (busy) return;
    setError(null);
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    setPin((p) => {
      if (p.length >= 6) return p;
      const next = p + k;
      if (next.length === 6) setTimeout(() => submit(next), 120);
      return next;
    });
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => close()}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={() => !busy && close()} accessibilityLabel="Cancel" />
          <View style={[st.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={st.grab} />
            <View style={{ alignItems: 'center', gap: 6 }}>
              <View style={st.lock}>
                <Icon name="lock" size={22} />
              </View>
              <T v="h2" style={{ textAlign: 'center' }}>
                {copy.title}
              </T>
              <T v="small" style={{ textAlign: 'center', color: error ? c.pinkInk : c.ink2 }}>
                {error ?? copy.sub}
              </T>
            </View>
            <View style={st.dots} accessibilityLabel={`${pin.length} of 6 digits entered`}>
              {busy ? (
                <ActivityIndicator color={c.ink} />
              ) : (
                Array.from({ length: 6 }).map((_, i) => <View key={i} style={[st.dot, i < pin.length && { backgroundColor: c.ink, borderColor: c.ink }]} />)
              )}
            </View>
            <View style={st.pad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'del'].map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={k === 'del' ? 'Delete' : k === 'cancel' ? 'Cancel' : k}
                  onPress={() => (k === 'cancel' ? !busy && close() : press(k))}
                  style={({ pressed }) => [st.key, pressed && { backgroundColor: c.soft }]}
                >
                  {k === 'del' ? (
                    <Icon name="delete" size={24} />
                  ) : (
                    <Text style={{ fontFamily: k === 'cancel' ? f.medium : f.regular, fontSize: k === 'cancel' ? 15 : 26, color: c.ink }}>
                      {k === 'cancel' ? 'Cancel' : k}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const st = StyleSheet.create({
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10, gap: 18 },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D5D5D5', alignSelf: 'center', marginBottom: 4 },
  lock: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.stabilo, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 14, height: 24, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#BDBDBD' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 4 },
  key: { width: '32%', height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
