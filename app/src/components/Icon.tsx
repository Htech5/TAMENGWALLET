import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { c } from '@/theme';

export type IconName =
  | 'back'
  | 'chev'
  | 'send'
  | 'add'
  | 'shield'
  | 'block'
  | 'pause'
  | 'play'
  | 'plus'
  | 'search'
  | 'lock'
  | 'copy'
  | 'bell'
  | 'clock'
  | 'pulse'
  | 'paste'
  | 'user'
  | 'globe'
  | 'sliders'
  | 'repeat'
  | 'people'
  | 'gift'
  | 'arrowUp'
  | 'external'
  | 'check'
  | 'close'
  | 'delete';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}

export function Icon({ name, size = 22, color = c.ink, stroke = 1.8 }: Props) {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'back' && <Path d="M15 5 8 12l7 7" {...p} strokeWidth={2} />}
      {name === 'chev' && <Path d="m9 6 6 6-6 6" {...p} strokeWidth={2} />}
      {name === 'send' && <Path d="M7 17 17 7M9 7h8v8" {...p} strokeWidth={2.2} />}
      {name === 'add' && <Path d="M17 7 7 17M15 17H7V9" {...p} strokeWidth={2.2} />}
      {name === 'arrowUp' && <Path d="M12 19V5M6 11l6-6 6 6" {...p} strokeWidth={2.2} />}
      {name === 'shield' && (
        <>
          <Path d="M12 3 19 6v5.5c0 4.6-3 7.8-7 9.5-4-1.7-7-4.9-7-9.5V6z" {...p} />
          <Path d="m9 12 2.2 2.2L15.5 10" {...p} />
        </>
      )}
      {name === 'block' && (
        <>
          <Circle cx={12} cy={12} r={8} {...p} />
          <Path d="m6.5 6.5 11 11" {...p} />
        </>
      )}
      {name === 'pause' && <Path d="M9 6v12M15 6v12" {...p} strokeWidth={2.4} />}
      {name === 'play' && <Path d="M8 5.5v13l10-6.5z" fill={color} />}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} strokeWidth={2} />}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...p} strokeWidth={2} />}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} strokeWidth={2.4} />}
      {name === 'search' && (
        <>
          <Circle cx={11} cy={11} r={6.5} {...p} />
          <Path d="m16 16 4 4" {...p} />
        </>
      )}
      {name === 'lock' && (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2.5} {...p} />
          <Path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" {...p} />
        </>
      )}
      {name === 'copy' && (
        <>
          <Rect x={8} y={8} width={11} height={11} rx={2.5} {...p} />
          <Path d="M5 15V7a2 2 0 0 1 2-2h8" {...p} />
        </>
      )}
      {name === 'bell' && (
        <>
          <Path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" {...p} />
          <Path d="M10 20a2 2 0 0 0 4 0" {...p} />
        </>
      )}
      {name === 'clock' && (
        <>
          <Circle cx={12} cy={12} r={8} {...p} />
          <Path d="M12 8v4.5l3 2" {...p} />
        </>
      )}
      {name === 'pulse' && <Path d="M3 13h4l3-7 4 12 3-5h4" {...p} />}
      {name === 'paste' && (
        <>
          <Rect x={6} y={5} width={12} height={15} rx={2.5} {...p} />
          <Path d="M9.5 3.5h5v3h-5z" {...p} />
        </>
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8.5} r={3.8} {...p} />
          <Path d="M4.5 20c.8-3.8 3.8-6 7.5-6s6.7 2.2 7.5 6" {...p} />
        </>
      )}
      {name === 'globe' && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...p} />
          <Path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5z" {...p} />
        </>
      )}
      {name === 'sliders' && (
        <>
          <Path d="M6 4v16M12 4v16M18 4v16" {...p} />
          <Path d="M3.5 9h5M9.5 15h5M15.5 8h5" {...p} strokeWidth={2.4} />
        </>
      )}
      {name === 'repeat' && <Path d="M4 12a7 7 0 0 1 12-5l2 2M20 12a7 7 0 0 1-12 5l-2-2M18 4v5h-5M6 20v-5h5" {...p} />}
      {name === 'people' && (
        <>
          <Circle cx={9} cy={8} r={3.2} {...p} />
          <Path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5M16 5.2a3 3 0 0 1 0 5.6M18 14.4c1.6.7 2.6 2.3 3 4.6" {...p} />
        </>
      )}
      {name === 'gift' && (
        <>
          <Rect x={4} y={9} width={16} height={11} rx={1.5} {...p} />
          <Path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5-4-5-1.5S10 9 12 9zm0 0c1.5-3.5 5-4 5-1.5S14 9 12 9z" {...p} />
        </>
      )}
      {name === 'external' && <Path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" {...p} />}
      {name === 'delete' && <Path d="M20 7H9l-5 5 5 5h11zM12.5 10l4 4M16.5 10l-4 4" {...p} />}
    </Svg>
  );
}
