import { useEffect } from 'react';
import Svg, { Path, Ellipse } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  cancelAnimation,
  interpolate,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

export const BRAND = '#63E6BE'; // mint

// downward (lower-half) arc path centered at (cx,cy) with radius r
function arc(cx: number, cy: number, r: number): string {
  'worklet';
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`;
}

/**
 * Static logo — a drop above three spreading water arcs.
 * Use in headers / app icon.
 */
export function LogoMark({ size = 64, color = BRAND }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Ellipse cx="50" cy="26" rx="3.6" ry="5.4" fill={color} />
      <Path d="M16 58 A34 34 0 0 0 84 58" stroke={color} strokeWidth="3" strokeOpacity="0.2" fill="none" strokeLinecap="round" />
      <Path d="M26 58 A24 24 0 0 0 74 58" stroke={color} strokeWidth="3" strokeOpacity="0.4" fill="none" strokeLinecap="round" />
      <Path d="M36 58 A14 14 0 0 0 64 58" stroke={color} strokeWidth="3.5" strokeOpacity="0.72" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function Wave({ t, delay, color }: { t: SharedValue<number>; delay: number; color: string }) {
  const props = useAnimatedProps(() => {
    'worklet';
    const local = (t.value + 1 - delay) % 1;
    const r = interpolate(local, [0, 1], [8, 38]);
    const opacity = interpolate(local, [0, 0.15, 1], [0, 0.6, 0]);
    return { d: arc(50, 60, r), strokeOpacity: opacity };
  });
  return <AnimatedPath animatedProps={props} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />;
}

/**
 * Animated logo — a drop falls, hits the surface, sends out waves. Loops.
 * Use on splash / loading.
 */
export function LogoRipple({ size = 120, color = BRAND }: { size?: number; color?: string }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);

  // drop falls from top to the surface, then resets
  const dropProps = useAnimatedProps(() => {
    'worklet';
    const fall = (t.value % 1) / 0.42;
    const cy = interpolate(Math.min(fall, 1), [0, 1], [20, 56]);
    const opacity = interpolate(t.value % 1, [0, 0.38, 0.46], [1, 1, 0]);
    return { cy, opacity };
  });

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Wave t={t} delay={0} color={color} />
      <Wave t={t} delay={0.33} color={color} />
      <Wave t={t} delay={0.66} color={color} />
      <AnimatedEllipse cx={50} rx={3.6} ry={5.4} fill={color} animatedProps={dropProps} />
    </Svg>
  );
}
