import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { c, f, r } from '@/theme';
import { Icon, IconName } from './Icon';

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'bodyMedium' | 'small' | 'smallMedium' | 'caption' | 'label' | 'mono';

const tv: Record<Variant, TextStyle> = {
  display: { fontFamily: f.semibold, fontSize: 38, letterSpacing: -0.8, color: c.ink },
  title: { fontFamily: f.medium, fontSize: 24, letterSpacing: -0.3, color: c.ink },
  h2: { fontFamily: f.semibold, fontSize: 20, letterSpacing: -0.2, color: c.ink },
  h3: { fontFamily: f.medium, fontSize: 17, color: c.ink },
  body: { fontFamily: f.regular, fontSize: 15, lineHeight: 21, color: c.ink },
  bodyMedium: { fontFamily: f.medium, fontSize: 15, lineHeight: 21, color: c.ink },
  small: { fontFamily: f.regular, fontSize: 13, lineHeight: 18, color: c.silver },
  smallMedium: { fontFamily: f.medium, fontSize: 13, lineHeight: 18, color: c.ink },
  caption: { fontFamily: f.regular, fontSize: 12, lineHeight: 16, color: c.silver },
  label: { fontFamily: f.medium, fontSize: 13, color: c.silver, letterSpacing: 0.2 },
  mono: { fontFamily: f.mono, fontSize: 12, color: c.ink2 },
};

export function T({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  return <Text {...rest} style={[tv[v], style]} />;
}

type BtnKind = 'black' | 'white' | 'pink' | 'stabilo' | 'soft';

export function Button({
  label,
  icon,
  kind = 'black',
  onPress,
  disabled,
  loading,
  style,
  height = 52,
}: {
  label: string;
  icon?: IconName;
  kind?: BtnKind;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  const bg = { black: c.ink, white: c.bg, pink: c.pink, stabilo: c.stabilo, soft: c.soft }[kind];
  const fg = kind === 'black' ? c.white : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, height, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        kind === 'white' && { borderWidth: 1, borderColor: c.line },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} color={fg} size={20} />}
          <Text style={[s.btnText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  icon,
  kind = 'soft',
  onPress,
  small,
  disabled,
}: {
  label: string;
  icon?: IconName;
  kind?: 'pink' | 'soft' | 'line' | 'ink' | 'stabilo';
  onPress?: () => void;
  small?: boolean;
  disabled?: boolean;
}) {
  const bg = { pink: c.pink, soft: c.soft, line: c.bg, ink: c.ink, stabilo: c.stabilo }[kind];
  const fg = kind === 'ink' ? c.white : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.pill,
        { backgroundColor: bg, height: small ? 34 : 44, paddingHorizontal: small ? 12 : 18, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        kind === 'line' && { borderWidth: 1, borderColor: c.line },
      ]}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} color={fg} stroke={2.2} />}
      <Text style={{ fontFamily: f.medium, fontSize: small ? 13 : 16, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export type BadgeKind = 'ok' | 'confirm' | 'block' | 'added' | 'muted' | 'warn';

export function Badge({ label, kind }: { label: string; kind: BadgeKind }) {
  const m = {
    ok: [c.soft, c.ink],
    confirm: [c.blueTint, c.blueInk],
    block: [c.pinkTint, c.pinkInk],
    added: [c.addedTint, c.addedInk],
    muted: [c.soft, c.silver],
    warn: ['#FFF1D1', '#7A5000'],
  }[kind];
  return (
    <View style={[s.badge, { backgroundColor: m[0] }]}>
      <Text style={{ fontFamily: f.medium, fontSize: 12, color: m[1] }}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.9 }]}>
        {children}
      </Pressable>
    );
  return <View style={[s.card, style]}>{children}</View>;
}

export function CircleButton({
  icon,
  onPress,
  bg = c.soft,
  size = 56,
  label,
  dot,
}: {
  icon: IconName;
  onPress?: () => void;
  bg?: string;
  size?: number;
  label: string;
  dot?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }]}
    >
      <Icon name={icon} size={24} />
      {dot && <View style={s.dot} />}
    </Pressable>
  );
}

const avatarColors = [c.pink, c.blue, c.stabilo, c.soft];
export function Avatar({ name, size = 44, color, icon, iconColor }: { name?: string; size?: number; color?: string; icon?: IconName; iconColor?: string }) {
  const seed = name ? name.charCodeAt(0) % avatarColors.length : 3;
  const bg = color ?? avatarColors[seed];
  const fg = bg === c.blue || bg === c.ink ? c.white : c.ink;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {icon ? (
        <Icon name={icon} size={size * 0.45} color={iconColor ?? fg} />
      ) : (
        <Text style={{ fontFamily: f.medium, fontSize: size * 0.38, color: fg }}>{(name ?? '?').charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[s.tg, { backgroundColor: value ? c.ink : '#D5D5D5' }]}
    >
      <View style={[s.knob, { transform: [{ translateX: value ? 18 : 0 }], backgroundColor: value ? c.stabilo : c.white }]} />
    </Pressable>
  );
}

export function Row({
  left,
  title,
  sub,
  right,
  onPress,
  first,
}: {
  left?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const body = (
    <View style={[s.row, first && { borderTopWidth: 0, paddingTop: 2 }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {typeof title === 'string' ? (
          <T v="bodyMedium" numberOfLines={1}>
            {title}
          </T>
        ) : (
          title
        )}
        {typeof sub === 'string' ? (
          <T v="small" numberOfLines={1}>
            {sub}
          </T>
        ) : (
          sub
        )}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return <T v="label" style={{ marginTop: 6, marginBottom: -2, marginLeft: 2 }}>{children}</T>;
}

export function Note({ icon = 'lock', children, tone = 'soft' }: { icon?: IconName; children: ReactNode; tone?: 'soft' | 'blue' | 'pink' }) {
  const bg = tone === 'blue' ? c.blueTint : tone === 'pink' ? c.pinkTint : c.soft;
  const fg = tone === 'blue' ? c.blueInk : tone === 'pink' ? c.pinkInk : c.ink2;
  return (
    <View style={[s.note, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color={tone === 'soft' ? c.ink : fg} />
      <Text style={{ flex: 1, fontFamily: f.regular, fontSize: 13, lineHeight: 19, color: fg }}>{children}</Text>
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress?: () => void } & Pick<PressableProps, 'onPress'>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: on ? c.ink : c.soft }]}
    >
      <Text style={{ fontFamily: f.medium, fontSize: 14, color: on ? c.white : c.ink }}>{label}</Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={c.ink} />
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={[s.card, { alignItems: 'flex-start', gap: 10 }]}>
      <T v="bodyMedium">Couldn't load this</T>
      <T v="small" style={{ color: c.ink2 }}>
        {message}
      </T>
      {onRetry && <Pill label="Try again" kind="line" small onPress={onRetry} />}
    </View>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <T v="small">{k}</T>
          {typeof v === 'string' ? (
            <T v="smallMedium" style={{ textAlign: 'right', flexShrink: 1 }}>
              {v}
            </T>
          ) : (
            v
          )}
        </View>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  btn: { borderRadius: r.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
  btnText: { fontFamily: f.medium, fontSize: 16 },
  pill: { borderRadius: r.pill, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  badge: { height: 22, paddingHorizontal: 9, borderRadius: r.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  card: { borderWidth: 1, borderColor: c.line, borderRadius: r.xl, padding: 18, gap: 14, backgroundColor: c.bg },
  dot: { position: 'absolute', top: 14, right: 15, width: 9, height: 9, borderRadius: 5, backgroundColor: c.stabilo, borderWidth: 1.5, borderColor: c.ink },
  tg: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line },
  note: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: r.lg, alignItems: 'flex-start' },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: r.pill, alignItems: 'center', justifyContent: 'center' },
});
