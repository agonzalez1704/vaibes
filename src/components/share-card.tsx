import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LogoMark } from '@/components/logo';

const MINT = '#63E6BE';

export type ShareCardProps = {
  phrase: { text: string; theme: string | null; generated_at: string };
  showWatermark: boolean; // false for Pro tier
};

// Square-ish card rendered offscreen and snapshotted into a PNG.
// Aspect 4:5 for Instagram + native sharing sweet spot.
export function ShareCard({ phrase, showWatermark }: ShareCardProps) {
  return (
    <View style={styles.card} collapsable={false}>
      <LinearGradient
        colors={['#0d1a14', '#0a0a0a', '#000']}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <View style={styles.glow}>
        <LinearGradient
          colors={['rgba(99,230,190,0.18)', 'transparent']}
          style={StyleSheet.absoluteFill as any}
        />
      </View>

      <View style={styles.content}>
        {phrase.theme ? (
          <Text style={styles.theme}>{phrase.theme.toUpperCase()}</Text>
        ) : null}

        <Text style={styles.phrase}>{phrase.text}</Text>

        {showWatermark && (
          <View style={styles.watermark}>
            <View style={styles.watermarkRow}>
              <LogoMark size={20} color={MINT} />
              <Text style={styles.watermarkBrand}>VAIBES</Text>
            </View>
            <Text style={styles.watermarkUrl}>vaibes.app</Text>
          </View>
        )}

        <Text style={styles.date}>
          {new Date(phrase.generated_at).toLocaleDateString([], {
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 1080,
    height: 1350, // 4:5 portrait
    overflow: 'hidden',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: -200,
    left: -200,
    right: -200,
    height: 700,
    borderRadius: 9999,
  },
  content: {
    flex: 1,
    paddingHorizontal: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  theme: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 28,
    letterSpacing: 6,
    fontWeight: '500',
    marginBottom: 60,
    textAlign: 'center',
  },
  phrase: {
    color: '#fff',
    fontSize: 64,
    lineHeight: 86,
    fontWeight: '300',
    textAlign: 'center',
  },
  watermark: {
    marginTop: 80,
    alignItems: 'center',
  },
  watermarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  watermarkBrand: {
    color: MINT,
    fontSize: 30,
    letterSpacing: 8,
    fontWeight: '600',
  },
  watermarkUrl: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 22,
    marginTop: 10,
    letterSpacing: 1,
  },
  date: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 24,
    marginTop: 80,
    letterSpacing: 1,
  },
});
