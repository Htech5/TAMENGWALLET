import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { c } from '@/theme';

/** Tam, the shield mascot. "calm" by default, "alert" when something was blocked. */
export function Tam({ size = 32, mood = 'calm' }: { size?: number; mood?: 'calm' | 'alert' }) {
  const h = (size * 44) / 40;
  return (
    <Svg width={size} height={h} viewBox="0 0 40 44">
      <Path d="M20 2 36 7.5V20c0 11-7.2 18.5-16 22C11.2 38.5 4 31 4 20V7.5z" fill={c.ink} />
      {mood === 'calm' ? (
        <>
          <Ellipse cx={14} cy={18.5} rx={2.6} ry={3.4} fill={c.stabilo} />
          <Ellipse cx={26} cy={18.5} rx={2.6} ry={3.4} fill={c.stabilo} />
          <Path d="M13.5 27c3.8 3.4 9.2 3.4 13 0" fill="none" stroke={c.stabilo} strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx={14} cy={18.5} r={3.6} fill={c.pink} />
          <Circle cx={26} cy={18.5} r={3.6} fill={c.pink} />
          <Rect x={16.5} y={27} width={7} height={3} rx={1.5} fill={c.pink} />
        </>
      )}
    </Svg>
  );
}
