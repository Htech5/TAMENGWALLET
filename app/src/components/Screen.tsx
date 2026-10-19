import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { c, r } from '@/theme';
import { CircleButton, T } from './ui';

/** Grey band header with Back + title, white rounded body below. */
export function Screen({
  title,
  sub,
  right,
  children,
  refreshing,
  onRefresh,
  footer,
  header,
  bodyGap = 14,
}: {
  title?: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  footer?: ReactNode;
  header?: ReactNode;
  bodyGap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.band }}>
      {/* Header stays put; only the white body scrolls underneath its rounded edge. */}
      <View style={[st.band, { paddingTop: insets.top + 16 }]}>
          {header ?? (
            <View style={st.bandRow}>
              <CircleButton icon="back" label="Back" bg={c.bg} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T v="title" numberOfLines={1}>
                  {title}
                </T>
                {sub ? (
                  <T v="small" style={{ color: c.ink2, marginTop: 2 }} numberOfLines={1}>
                    {sub}
                  </T>
                ) : null}
              </View>
              {right}
            </View>
          )}
      </View>
      <ScrollView
        style={st.scroller}
        contentContainerStyle={[st.body, { gap: bodyGap, paddingBottom: (footer ? 24 : 40) + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.ink} /> : undefined}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[st.footer, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
    </View>
  );
}

/** Bottom sheet used by transparent modal routes. Tap outside to close. */
export function Sheet({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Close" style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={() => router.back()} />
      <View style={[st.sheet, { paddingBottom: 24 + insets.bottom }]}>
        <View style={st.grab} />
        <ScrollView bounces={false} contentContainerStyle={{ gap: 16 }} style={{ maxHeight: '100%' }}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  band: { backgroundColor: c.band, paddingHorizontal: 20, paddingBottom: 44 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scroller: { flex: 1, backgroundColor: c.bg, borderTopLeftRadius: r.xxl, borderTopRightRadius: r.xxl, marginTop: -24, overflow: 'hidden' },
  body: { padding: 20, flexGrow: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg },
  sheet: { backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10, maxHeight: '92%' },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#D5D5D5', alignSelf: 'center', marginBottom: 14 },
});
