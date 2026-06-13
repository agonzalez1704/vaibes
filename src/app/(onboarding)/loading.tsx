import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ImageBackground } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useInsforgeClient } from '@/lib/insforge';
import { LotusParticles } from '@/components/lotus-particles';
import { Typewriter } from '@/components/typewriter';

const PHRASES: Record<string, string[]> = {
  queued: [
    'Finding your corner of the internet…',
    'Warming up the lens…',
  ],
  running: [
    'Reading between your posts…',
    'Noticing what lights you up…',
    'Listening to how you speak…',
    'Tracing the threads of your interests…',
  ],
  succeeded: [
    'Distilling your essence…',
    'Shaping words just for you…',
    'Almost there…',
  ],
};

// Job error codes that mean "we can't read this account's public posts"
// (private, media-only, or blocked) — resolution is the quiz fallback.
const UNREADABLE_CODES = ['private_or_empty', 'no_captions'];
function isUnreadable(code: string | null | undefined): boolean {
  if (!code) return false;
  const c = code.toLowerCase();
  return UNREADABLE_CODES.includes(c) || c.includes('private') || c.includes('empty');
}

export default function LoadingScreen() {
  const router = useRouter();
  const { jobId, handle, platform } = useLocalSearchParams<{ jobId: string; handle?: string; platform?: string }>();
  const { client, isReady } = useInsforgeClient();
  const [status, setStatus] = useState<string>('queued');
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    if (!isReady || !jobId) return;
    let cancelled = false;
    let succeededAt: number | null = null;
    let recoveryAttempts = 0;
    let nextRecoveryAt = 0;

    const poll = async () => {
      while (!cancelled) {
        const { data } = await client.database
          .from('scrape_jobs')
          .select('status, error')
          .eq('id', jobId)
          .maybeSingle();
        if (data?.status) setStatus(data.status);

        if (data?.status === 'failed') {
          if (isUnreadable(data.error)) {
            setUnreadable(true);
          } else {
            setError(data.error ?? 'Scrape failed');
          }
          return;
        }

        if (data?.status === 'succeeded') {
          const { data: profile } = await client.database
            .from('profiles')
            .select('user_id')
            .maybeSingle();
          if (profile) {
            router.replace('/(app)/home');
            return;
          }

          // Start the post-scrape clock the first time we see succeeded.
          if (succeededAt === null) {
            succeededAt = Date.now();
            nextRecoveryAt = succeededAt + 8_000; // first recovery after 8s
          }

          // Fire recover-profile periodically until profile appears OR we hit the cap.
          if (recoveryAttempts < 4 && Date.now() >= nextRecoveryAt) {
            recoveryAttempts += 1;
            console.log(`[loading] recover-profile attempt ${recoveryAttempts}`);
            try {
              const { data: rec, error: recErr } = await client.functions.invoke('recover-profile', {});
              console.log('[loading] recover result:', JSON.stringify(rec), JSON.stringify(recErr));
            } catch (e) {
              console.log('[loading] recover threw', String(e));
            }
            // exponential-ish backoff: 8s, 14s, 22s, 32s between attempts
            nextRecoveryAt = Date.now() + 6_000 + recoveryAttempts * 6_000;
          }

          // Hard stop after 90s of post-scrape waiting.
          if (Date.now() - (succeededAt ?? Date.now()) > 90_000) {
            setError('We had trouble building your profile. Please try again.');
            return;
          }
        }

        await new Promise((r) => setTimeout(r, 2000));
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [isReady, jobId, client, router]);

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1474557157379-8aa74a6ef541?w=1400&q=80' }}
      style={styles.bg}
      resizeMode="cover"
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.72)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      {unreadable ? (
        <View style={styles.content}>
          <Text style={styles.lock}>🔒</Text>
          <Text style={styles.title}>
            {handle ? `@${handle} looks private` : 'That account looks private'}
          </Text>
          <Text style={styles.subtitle}>
            We can only read public posts, so we couldn’t learn your vibe from{' '}
            {platform ? platform : 'that account'}. Answer a few quick questions instead — it takes about a minute.
          </Text>

          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(onboarding)/quiz')}>
            <Text style={styles.primaryText}>Answer a few questions</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => router.replace('/(onboarding)/handle')}>
            <Text style={styles.retryText}>Try a public account</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.content}>
          <LotusParticles size={300} />

          <Text style={styles.title}>Reading your vibes</Text>
          {error ? (
            <Text style={styles.subtitle}>Couldn’t finish: {error}</Text>
          ) : (
            <Typewriter
              phrases={PHRASES[status] ?? PHRASES.queued}
              style={styles.subtitle}
            />
          )}

          {error && (
            <Pressable style={styles.retryBtn} onPress={() => router.replace('/(onboarding)/handle')}>
              <Text style={styles.retryText}>Try a different handle</Text>
            </Pressable>
          )}
        </View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 24, fontWeight: '300', letterSpacing: 3, marginTop: 24 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 12, textAlign: 'center' },
  retryBtn: { marginTop: 32, borderWidth: 1, borderColor: '#fff', borderRadius: 999, paddingVertical: 14, paddingHorizontal: 24 },
  retryText: { color: '#fff' },
  lock: { fontSize: 48, marginBottom: 8 },
  primaryBtn: { marginTop: 32, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 16, paddingHorizontal: 36 },
  primaryText: { color: '#000', fontSize: 16, fontWeight: '600' },
  ghostBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24 },
});
