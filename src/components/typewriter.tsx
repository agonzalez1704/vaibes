import { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, type TextStyle } from 'react-native';

type Props = {
  phrases: string[];
  style?: TextStyle;
  typeMs?: number;     // per-char type speed
  holdMs?: number;     // pause once fully typed
  eraseMs?: number;    // per-char erase speed
};

export function Typewriter({ phrases, style, typeMs = 45, holdMs = 1400, eraseMs = 22 }: Props) {
  const [text, setText] = useState('');
  const idx = useRef(0);
  const char = useRef(0);
  const phase = useRef<'type' | 'hold' | 'erase'>('type');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phrases.length === 0) return;
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const full = phrases[idx.current % phrases.length];

      if (phase.current === 'type') {
        char.current += 1;
        setText(full.slice(0, char.current));
        if (char.current >= full.length) {
          phase.current = 'hold';
          timer.current = setTimeout(tick, holdMs);
        } else {
          timer.current = setTimeout(tick, typeMs);
        }
      } else if (phase.current === 'hold') {
        phase.current = 'erase';
        timer.current = setTimeout(tick, eraseMs);
      } else {
        char.current -= 1;
        setText(full.slice(0, Math.max(0, char.current)));
        if (char.current <= 0) {
          phase.current = 'type';
          idx.current += 1;
          timer.current = setTimeout(tick, 350);
        } else {
          timer.current = setTimeout(tick, eraseMs);
        }
      }
    };

    timer.current = setTimeout(tick, typeMs);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [phrases, typeMs, holdMs, eraseMs]);

  return (
    <Text style={[styles.base, style]}>
      {text}
      <Text style={styles.caret}>▍</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  base: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center' },
  caret: { color: 'rgba(255,255,255,0.45)' },
});
