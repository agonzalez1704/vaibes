import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ImageBackground, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { useInsforgeClient } from '@/lib/insforge';
import { PhrasePlayer } from '@/components/phrase-player';
import { ShareModal } from '@/components/share-modal';
import { useScreenshotDetected } from '@/lib/use-screenshot';
import { useIsPro } from '@/lib/use-pro';
import { presentPaywall } from '@/lib/iap';

const FREE_HISTORY_LIMIT = 7;

const ACCENT = '#FF2D78';

type Phrase = { id: string; text: string; theme: string | null; generated_at: string; audio_url: string | null };

export default function History() {
  const router = useRouter();
  const { client, isReady } = useInsforgeClient();
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { detected: screenshotDetected, clear: clearScreenshot } = useScreenshotDetected();
  const { isPro } = useIsPro();

  const load = useCallback(async () => {
    const { data } = await client.database
      .from('phrases')
      .select('id, text, theme, generated_at, audio_url')
      .order('generated_at', { ascending: false })
      .limit(200);
    setPhrases(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [client]);

  useEffect(() => {
    if (isReady) void load();
  }, [isReady, load]);

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=1400&q=80' }}
      style={styles.bg}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.82)', 'rgba(0,0,0,0.94)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color="#fff" strokeWidth={1.8} />
        </Pressable>
        <Text style={styles.title}>Your vibes</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={ACCENT} /></View>
      ) : phrases.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>No vibes yet.{'\n'}Generate your first on the home screen.</Text>
        </View>
      ) : (
        <FlatList
          data={isPro ? phrases : phrases.slice(0, FREE_HISTORY_LIMIT)}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={!isPro && phrases.length >= FREE_HISTORY_LIMIT ? (
            <Pressable style={styles.upsell} onPress={() => presentPaywall()}>
              <Text style={styles.upsellTitle}>Unlock your full history</Text>
              <Text style={styles.upsellSub}>
                You have {phrases.length} vibes so far. Go Pro to scroll them all.
              </Text>
            </Pressable>
          ) : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
              tintColor={ACCENT}
            />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.theme ? <Text style={styles.theme}>{item.theme.toUpperCase()}</Text> : null}
              <Text style={styles.phrase}>{item.text}</Text>
              <View style={styles.footerRow}>
                <Text style={styles.date}>
                  {new Date(item.generated_at).toLocaleDateString([], {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                  {'  ·  '}
                  {new Date(item.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <PhrasePlayer
                  phraseId={item.id}
                  client={client}
                  cachedAudioUrl={item.audio_url}
                  size={40}
                />
              </View>
            </View>
          )}
        />
      )}
      <ShareModal
        visible={!isPro && screenshotDetected && phrases.length > 0}
        phrase={phrases[0] ?? null}
        isPro={isPro}
        onClose={clearScreenshot}
      />
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 72, marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, letterSpacing: 4, fontWeight: '300' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  list: { padding: 24, paddingTop: 8, paddingBottom: 48 },
  card: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    padding: 22, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  theme: { color: ACCENT, fontSize: 10, letterSpacing: 2.5, marginBottom: 12, fontWeight: '600' },
  phrase: { color: '#fff', fontSize: 19, lineHeight: 28, fontWeight: '300' },
  date: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontVariant: ['tabular-nums'], flex: 1 },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12 },
  upsell: {
    marginTop: 24, padding: 22, borderRadius: 20,
    backgroundColor: 'rgba(99,230,190,0.08)',
    borderWidth: 1, borderColor: 'rgba(99,230,190,0.4)',
    alignItems: 'center',
  },
  upsellTitle: { color: '#63E6BE', fontSize: 18, fontWeight: '600', marginBottom: 6, textAlign: 'center' },
  upsellSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
