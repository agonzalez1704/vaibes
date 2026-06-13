import { useInsforgeClient } from '@/lib/insforge';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const bgVideo = require('../../../assets/videos/rainy-tree-loop.mp4');

export default function ConsentScreen() {
  const router = useRouter();
  const { platform, handle } = useLocalSearchParams<{ platform: 'instagram' | 'tiktok'; handle: string }>();
  const { client, isReady } = useInsforgeClient();
  const [ownership, setOwnership] = useState(false);
  const [analysis, setAnalysis] = useState(false);
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const canContinue = ownership && analysis && isReady;

  const submit = async () => {
    if (!canContinue || busy) return;
    setBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const { data, error } = await client.functions.invoke('start-onboarding', {
        body: { handle, platform, consent: true, timezone },
      });
      console.log('[start-onboarding] data:', JSON.stringify(data), 'error:', JSON.stringify(error));
      if (error) {
        Alert.alert(
          'Couldn\'t start',
          `${error.message ?? ''}\n${JSON.stringify((error as any).data ?? error)}`.slice(0, 500),
        );
        setBusy(false);
        return;
      }
      if (!data?.job_id) {
        Alert.alert('Couldn\'t start', `No job_id returned:\n${JSON.stringify(data).slice(0, 500)}`);
        setBusy(false);
        return;
      }
      router.replace({ pathname: '/(onboarding)/loading', params: { jobId: data.job_id, handle, platform } });
    } catch (err: any) {
      Alert.alert('Network error', err?.message ?? 'Try again');
      setBusy(false);
    }
  };

  return (
    <View style={styles.bg}>
      <VideoView
        style={StyleSheet.absoluteFill as any}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <Text style={styles.title}>Before we start</Text>

          <Text style={styles.body}>
            We'll read public posts from <Text style={styles.handle}>@{handle}</Text> on{' '}
            <Text style={styles.handle}>{platform}</Text> to learn your interests, mood, and language.
            From this we generate motivational phrases tailored to you.
          </Text>

          <View style={styles.bulletRow}><Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>Only public posts — no DMs, no private data.</Text></View>
          <View style={styles.bulletRow}><Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>Raw posts are deleted after 30 days. Derived interests stay until you delete your account.</Text></View>
          <View style={styles.bulletRow}><Text style={styles.bullet}>•</Text><Text style={styles.bulletText}>You can re-scan or delete your data anytime in settings.</Text></View>
        </View>

        <View style={styles.bottom}>
          <Pressable style={styles.checkRow} onPress={() => setOwnership(!ownership)}>
            <View style={[styles.checkbox, ownership && styles.checkboxChecked]}>
              {ownership && <Text style={styles.check}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>I confirm this handle is mine.</Text>
          </Pressable>

          <Pressable style={styles.checkRow} onPress={() => setAnalysis(!analysis)}>
            <View style={[styles.checkbox, analysis && styles.checkboxChecked]}>
              {analysis && <Text style={styles.check}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>I consent to analysis of my public posts for personalization.</Text>
          </Pressable>

          <Pressable
            style={[styles.continueBtn, !canContinue && styles.btnDisabled]}
            onPress={submit}
            disabled={!canContinue}
          >
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.continueBtnText}>Continue</Text>}
          </Pressable>

          <Pressable style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  container: { flexGrow: 1, padding: 24, paddingTop: 90, paddingBottom: 40, justifyContent: 'space-between' },
  top: { marginBottom: 32 },
  title: { color: '#fff', fontSize: 30, fontWeight: '300', letterSpacing: 1, marginBottom: 20 },
  body: { color: 'rgba(255,255,255,0.85)', fontSize: 16, lineHeight: 24, marginBottom: 24 },
  handle: { color: '#fff', fontWeight: '600' },
  bulletRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  bullet: { color: 'rgba(255,255,255,0.6)', marginRight: 8, fontSize: 16 },
  bulletText: { color: 'rgba(255,255,255,0.75)', flex: 1, fontSize: 14, lineHeight: 20 },
  bottom: {},
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)', marginRight: 12, alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: '#fff', borderColor: '#fff' },
  check: { color: '#000', fontWeight: 'bold' },
  checkLabel: { color: '#fff', flex: 1, fontSize: 15, lineHeight: 22 },
  continueBtn: { backgroundColor: '#fff', borderRadius: 999, paddingVertical: 18, alignItems: 'center', marginTop: 16 },
  btnDisabled: { opacity: 0.4 },
  continueBtnText: { color: '#000', fontSize: 18, fontWeight: '500' },
  back: { marginTop: 16, alignItems: 'center' },
  backText: { color: 'rgba(255,255,255,0.7)' },
});
