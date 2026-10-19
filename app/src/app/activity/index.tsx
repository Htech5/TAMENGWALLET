import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ActivityRow } from '@/components/ActivityRow';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Chip, ErrorBox, Loading, Section, T } from '@/components/ui';
import { api } from '@/lib/api';
import { groupLabel } from '@/lib/format';
import { useLoad, useNow } from '@/lib/hooks';
import { ActivityEvent } from '@/lib/types';
import { c } from '@/theme';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'postponed', label: 'Postponed' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const match = (e: ActivityEvent, k: FilterKey) =>
  k === 'all' ||
  (k === 'sent' && e.type === 'transfer_sent') ||
  (k === 'blocked' && e.type === 'attempt_blocked') ||
  (k === 'postponed' && (e.type === 'run_postponed' || e.type === 'transfer_failed'));

export default function Activity() {
  const params = useLocalSearchParams<{ filter?: FilterKey }>();
  const [filter, setFilter] = useState<FilterKey>(params.filter ?? 'all');
  const now = useNow();
  const q = useLoad(
    useCallback(async () => {
      const [a, w] = await Promise.all([api.getActivity(), api.getWallet()]);
      return { items: a.items, w };
    }, []),
    { pollMs: 15000 },
  );

  const groups = useMemo(() => {
    const out: { label: string; items: ActivityEvent[] }[] = [];
    for (const e of (q.data?.items ?? []).filter((x) => match(x, filter))) {
      const g = groupLabel(e.at, now);
      const last = out[out.length - 1];
      if (last && last.label === g) last.items.push(e);
      else out.push({ label: g, items: [e] });
    }
    return out;
  }, [q.data, filter, now]);

  return (
    <Screen title="Activity" refreshing={q.refreshing} onRefresh={q.refresh}>
      {q.data && (
        <View style={{ backgroundColor: c.stabilo, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" color={c.stabilo} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">
              {q.data.w.protection.blocked} blocked · {q.data.w.protection.checked} checked
            </T>
            <T v="small" style={{ color: c.stabiloInk }}>
              This month. Every transfer has a reason you can read.
            </T>
          </View>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map((x) => (
          <Chip key={x.key} label={x.label} on={filter === x.key} onPress={() => setFilter(x.key)} />
        ))}
      </ScrollView>
      {!q.data && !q.error && <Loading />}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.data && groups.length === 0 && (
        <T v="small" style={{ textAlign: 'center', paddingVertical: 32 }}>
          Nothing here yet.
        </T>
      )}
      {groups.map((g) => (
        <View key={g.label} style={{ gap: 6 }}>
          <Section>{g.label}</Section>
          <View>
            {g.items.map((e, i) => (
              <ActivityRow key={e.id} e={e} now={now} first={i === 0} />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
