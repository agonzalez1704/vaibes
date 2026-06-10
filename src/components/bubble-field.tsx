import { useEffect, useMemo } from 'react';
import { Pressable, Text, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { HugeiconsIcon } from '@hugeicons/react-native';
import type { Bubble } from '@/lib/quiz-data';

export type Weights = Record<string, number>; // 0..3

const MAX_WEIGHT = 3;

// Rose-red / magenta. Starts deep/dark, each "like" brightens one step.
const SHADES = ['#7E0A38', '#B30E4E', '#E01563', '#FF2D78']; // weight 0,1,2,3
const shadeFor = (w: number) => SHADES[Math.min(w, SHADES.length - 1)];

type Pos = { x: number; y: number; base: number };

// Phyllotaxis (sunflower) packing → even, organic disc cluster.
function layout(n: number, w: number, h: number): Pos[] {
  const cx = w / 2;
  const cy = h / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const spread = Math.min(w, h) * 0.38;
  const base = Math.max(50, Math.min(76, (w * 0.95) / Math.sqrt(n) / 1.15));
  const out: Pos[] = [];
  for (let i = 0; i < n; i++) {
    const r = spread * Math.sqrt((i + 0.5) / n);
    const a = i * golden;
    out.push({
      x: cx + r * Math.cos(a) - base / 2,
      y: cy + r * Math.sin(a) - base / 2,
      base: base * (0.9 + ((i * 37) % 5) / 22),
    });
  }
  return out;
}

function BubbleDot({
  item,
  pos,
  weight,
  index,
  onTap,
  onReset,
}: {
  item: Bubble;
  pos: Pos;
  weight: number;
  index: number;
  onTap: () => void;
  onReset: () => void;
}) {
  const press = useSharedValue(0.8 + weight * 0.22);
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withDelay(
      index * 120,
      withRepeat(withTiming(1, { duration: 2600 + (index % 5) * 240, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(float);
  }, [float, index]);

  useEffect(() => {
    press.value = withSpring(0.8 + weight * 0.22, { damping: 9, stiffness: 140 });
  }, [press, weight]);

  const style = useAnimatedStyle(() => {
    const bob = (float.value - 0.5) * 8;
    return {
      transform: [{ translateY: bob }, { scale: press.value }],
      opacity: weight === 0 ? 0.6 : 1,
    };
  });

  const iconSize = pos.base * 0.42;

  return (
    <Animated.View
      style={[
        styles.bubbleWrap,
        { left: pos.x, top: pos.y, width: pos.base, height: pos.base, zIndex: 1 + weight, elevation: 1 + weight },
        style,
      ]}
    >
      <Pressable
        onPress={onTap}
        onLongPress={onReset}
        style={[
          styles.bubble,
          { width: pos.base, height: pos.base, borderRadius: pos.base / 2, backgroundColor: shadeFor(weight) },
        ]}
      >
        <HugeiconsIcon icon={item.icon} size={iconSize} color="#fff" strokeWidth={1.8} />
        <Text style={styles.label} numberOfLines={1}>{item.label}</Text>
        {weight >= 2 && (
          <View style={styles.loveDot}>
            <Text style={styles.loveDotText}>{weight >= 3 ? '♥♥' : '♥'}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function BubbleField({
  items,
  weights,
  onChange,
}: {
  items: Bubble[];
  weights: Weights;
  onChange: (w: Weights) => void;
}) {
  const { width } = useWindowDimensions();
  const fieldW = width;
  const fieldH = Math.max(360, width * 1.1);
  const positions = useMemo(() => layout(items.length, fieldW, fieldH), [items.length, fieldW, fieldH]);

  const tap = (key: string) => {
    const cur = weights[key] ?? 0;
    onChange({ ...weights, [key]: cur >= MAX_WEIGHT ? 1 : cur + 1 });
  };
  const reset = (key: string) => onChange({ ...weights, [key]: 0 });

  return (
    <View style={{ width: fieldW, height: fieldH }}>
      {items.map((item, i) => (
        <BubbleDot
          key={item.key}
          item={item}
          pos={positions[i]}
          weight={weights[item.key] ?? 0}
          index={i}
          onTap={() => tap(item.key)}
          onReset={() => reset(item.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubbleWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bubble: { alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
  label: { color: '#fff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  loveDot: { position: 'absolute', bottom: 5 },
  loveDotText: { color: 'rgba(255,255,255,0.95)', fontSize: 9 },
});
