import { useEffect, useMemo } from 'react';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Particle = {
  cx: number;      // center origin x
  cy: number;      // center origin y
  tx: number;      // target x (lotus)
  ty: number;      // target y
  delay: number;   // 0..1 stagger
  r: number;       // dot radius
  color: string;
};

function buildLotus(size: number): Particle[] {
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.36;
  const out: Particle[] = [];

  const layers = [
    { petals: 8, len: R, width: R * 0.46, rot: 0, samples: 6, color: 'rgba(255,255,255,0.95)' },
    { petals: 8, len: R * 0.66, width: R * 0.34, rot: Math.PI / 8, samples: 5, color: 'rgba(255,228,168,0.95)' },
    { petals: 6, len: R * 0.36, width: R * 0.22, rot: Math.PI / 6, samples: 4, color: 'rgba(255,205,110,0.95)' },
  ];

  layers.forEach((layer, li) => {
    const step = (Math.PI * 2) / layer.petals;
    for (let k = 0; k < layer.petals; k++) {
      const a = -Math.PI / 2 + layer.rot + step * k;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let s = 1; s <= layer.samples; s++) {
        const t = s / layer.samples;                 // 0..1 along the vein
        const along = t * layer.len;
        const halfW = Math.sin(Math.PI * t) * layer.width * (1 - t * 0.25);
        // two edge particles + occasional tip
        const offsets = s === layer.samples ? [0] : [halfW, -halfW];
        for (const off of offsets) {
          const px = cx + ca * along - sa * off;
          const py = cy + sa * along + ca * off;
          const delay = Math.min(0.85, (along / R) * 0.55 + li * 0.06);
          out.push({
            cx, cy,
            tx: px, ty: py,
            delay,
            r: 1.5 + (1 - t) * 1.4,
            color: layer.color,
          });
        }
      }
    }
  });

  // seed of dots at the very center (carpel)
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * 2 / 7) * i;
    out.push({
      cx, cy,
      tx: cx + Math.cos(a) * R * 0.06,
      ty: cy + Math.sin(a) * R * 0.06,
      delay: 0,
      r: 1.8,
      color: 'rgba(255,222,140,0.95)',
    });
  }

  return out;
}

function ParticleDot({ p, t }: { p: Particle; t: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const local = interpolate(
      t.value,
      [p.delay, Math.min(1, p.delay + 0.4)],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const eased = local * local * (3 - 2 * local); // smoothstep
    const cx = p.cx + (p.tx - p.cx) * eased;
    const cy = p.cy + (p.ty - p.cy) * eased;
    // twinkle once formed
    const twinkle = 0.55 + 0.45 * Math.sin((t.value * 6.28 + p.delay * 9));
    const opacity = eased * (0.6 + 0.4 * twinkle);
    return { cx, cy, opacity, r: p.r * (0.4 + 0.6 * eased) };
  });

  return <AnimatedCircle animatedProps={animatedProps} fill={p.color} />;
}

export function LotusParticles({ size = 280 }: { size?: number }) {
  const particles = useMemo(() => buildLotus(size), [size]);
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true, // reverse → bloom in, settle out, breathing loop
    );
    return () => cancelAnimation(t);
  }, [t]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {particles.map((p, i) => (
        <ParticleDot key={i} p={p} t={t} />
      ))}
    </Svg>
  );
}
