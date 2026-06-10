import { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, Modal } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Settings02Icon, Album01Icon } from '@hugeicons/core-free-icons';
import { useInsforgeClient } from '@/lib/insforge';
import { registerForPushNotificationsAsync } from '@/lib/push';
import { PhrasePlayer } from '@/components/phrase-player';
import { ShareModal } from '@/components/share-modal';
import { useScreenshotDetected } from '@/lib/use-screenshot';
import { useIsPro } from '@/lib/use-pro';
import { presentPaywall, presentPaywallIfNeeded } from '@/lib/iap';

const bgVideo = require('../../../assets/videos/waterfall.mp4');

type Phrase = { id: string; text: string; generated_at: string; theme: string | null; audio_url: string | null };

export default function Home() {
  const router = useRouter();
  const { play: playParam } = useLocalSearchParams<{ play?: string }>();
  const { signOut, userId } = useAuth();
  const { client, isReady } = useInsforgeClient();
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showFreqModal, setShowFreqModal] = useState(false);
  const [savingFreq, setSavingFreq] = useState<string | null>(null);
  const { detected: screenshotDetected, clear: clearScreenshot } = useScreenshotDetected();
  const { isPro } = useIsPro();

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const load = useCallback(async () => {
    const { data } = await client.database
      .from('phrases')
      .select('id, text, generated_at, theme, audio_url')
      .order('generated_at', { ascending: false })
      .limit(20);
    setPhrases(data ?? []);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    if (!isReady) return;
    void load();
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (userId) {
        const patch: Record<string, any> = { last_seen_at: new Date().toISOString() };
        if (token) patch.push_token = token;
        await client.database.from('users').update(patch).eq('id', userId);
      }
      // Frequency prompt — only if user hasn't picked one explicitly yet.
      const { data: pref } = await client.database
        .from('preferences')
        .select('frequency_set_by_user')
        .maybeSingle();
      if (pref && pref.frequency_set_by_user === false) {
        setShowFreqModal(true);
      }
    })();
  }, [isReady, load, client, userId]);

  const pickFrequency = async (frequency: 'once' | 'twice' | 'thrice') => {
    if (savingFreq) return;
    // Pro gate: free users get 1/day; 2× and 3× require Pro.
    if (!isPro && frequency !== 'once') {
      const purchased = await presentPaywallIfNeeded();
      if (!purchased) return; // user cancelled — leave modal open
    }
    setSavingFreq(frequency);
    const { error } = await client.database
      .from('preferences')
      .update({ frequency, frequency_set_by_user: true });
    setSavingFreq(null);
    if (error) {
      Alert.alert('Couldn’t save', error.message);
      return;
    }
    setShowFreqModal(false);
  };

  const onGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    const { data, error } = await client.functions.invoke('generate-phrase', {});
    if (error || (data as any)?.error) {
      const body = (data as any) ?? {};
      const code = body.error ?? error?.message;
      if (code === 'too_soon') {
        Alert.alert('Slow down', `Try again in ${body.retry_after_seconds ?? 30}s.`);
      } else if (code === 'daily_soft_cap' || code === 'daily_cap_reached' || code === 'pro_required') {
        // Free user hit their cap (or feature is Pro-only). Show paywall.
        const purchased = await presentPaywallIfNeeded();
        if (purchased) {
          // Try again now they're Pro
          setGenerating(false);
          await onGenerate();
          return;
        }
      } else if (code === 'profile_not_ready') {
        Alert.alert('Almost there', 'Your profile is still being built. Try again in a moment.');
      } else {
        Alert.alert('Couldn’t generate', String(code ?? 'Try again'));
      }
    } else {
      await load();
    }
    setGenerating(false);
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#fff" /></View>;
  }

  const latest = phrases[0];

  return (
    <View style={styles.bg}>
      <VideoView
        style={StyleSheet.absoluteFill as any}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.65)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />
      <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>VAIBES</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => router.push('/(app)/history')} hitSlop={10}>
            <HugeiconsIcon icon={Album01Icon} size={22} color="#fff" strokeWidth={1.8} />
          </Pressable>
          <Pressable onPress={() => router.push('/(app)/settings')} hitSlop={10}>
            <HugeiconsIcon icon={Settings02Icon} size={22} color="#fff" strokeWidth={1.8} />
          </Pressable>
          <Pressable onPress={() => signOut()}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.middle}>
        {latest ? (
          <>
            <Text style={styles.theme}>{(latest.theme ?? 'today').toUpperCase()}</Text>
            <Text style={styles.phrase}>{latest.text}</Text>
            <Text style={styles.date}>{new Date(latest.generated_at).toLocaleDateString([], { month: 'long', day: 'numeric' })}</Text>
            <View style={{ marginTop: 28 }}>
              <PhrasePlayer
                phraseId={latest.id}
                client={client}
                cachedAudioUrl={latest.audio_url}
                size={64}
                autoPlay={playParam === latest.id}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.emptyTitle}>Welcome to Vaibes</Text>
            <Text style={styles.emptyBody}>
              Your first phrase is waiting. Tap below to receive it.
            </Text>
          </>
        )}
      </View>

      <Pressable style={styles.generateBtn} onPress={onGenerate} disabled={generating}>
        {generating ? (
          <ActivityIndicator color="#000" />
        ) : (
          <Text style={styles.generateText}>
            {latest ? 'Generate a new vibe' : 'Get my first vibe'}
          </Text>
        )}
      </Pressable>
      </View>

      <Modal visible={showFreqModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>How many vibes per day?</Text>
            <Text style={styles.modalSub}>
              They land at unexpected moments between 9 AM and 9 PM.
            </Text>
            <View style={styles.freqRow}>
              {([
                { key: 'once' as const, label: '1×' },
                { key: 'twice' as const, label: '2×' },
                { key: 'thrice' as const, label: '3×' },
              ]).map((opt) => (
                <Pressable
                  key={opt.key}
                  style={styles.freqBtn}
                  onPress={() => pickFrequency(opt.key)}
                  disabled={!!savingFreq}
                >
                  {savingFreq === opt.key ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <Text style={styles.freqBtnText}>{opt.label}</Text>
                  )}
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => setShowFreqModal(false)}>
              <Text style={styles.skipText}>Decide later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ShareModal
        visible={!isPro && screenshotDetected && !!latest}
        phrase={latest ?? null}
        isPro={isPro}
        onClose={clearScreenshot}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 24, paddingTop: 72, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#fff', fontSize: 18, letterSpacing: 6, fontWeight: '300' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  signOut: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  theme: { color: 'rgba(255,255,255,0.4)', fontSize: 11, letterSpacing: 3, marginBottom: 24, textAlign: 'center' },
  phrase: { color: '#fff', fontSize: 28, lineHeight: 40, fontWeight: '300', textAlign: 'center' },
  date: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 28, textAlign: 'center' },
  generateBtn: { backgroundColor: '#fff', borderRadius: 999, paddingVertical: 18, alignItems: 'center' },
  generateText: { color: '#000', fontSize: 16, fontWeight: '500' },
  emptyTitle: { color: '#fff', fontSize: 28, fontWeight: '300', letterSpacing: 2, marginBottom: 16, textAlign: 'center' },
  emptyBody: { color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#0f0f0f', borderRadius: 22, padding: 28, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '300', letterSpacing: 1, textAlign: 'center', marginBottom: 10 },
  modalSub: { color: 'rgba(255,255,255,0.65)', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  freqRow: { flexDirection: 'row', gap: 12, marginBottom: 18, width: '100%' },
  freqBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 22, alignItems: 'center' },
  freqBtnText: { color: '#000', fontSize: 22, fontWeight: '600' },
  skipText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 6 },
});
