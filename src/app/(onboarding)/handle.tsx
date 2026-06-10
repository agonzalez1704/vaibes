import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { InstagramIcon, TikTokIcon } from '@/components/icons';

const bgVideo = require('../../../assets/videos/book_reading.mp4');

export default function HandleScreen() {
  const router = useRouter();
  const [platform, setPlatform] = useState<'instagram' | 'tiktok'>('instagram');
  const [handle, setHandle] = useState('');

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const canContinue = handle.trim().length >= 2;

  const next = () => {
    if (!canContinue) return;
    router.push({
      pathname: '/(onboarding)/consent',
      params: { platform, handle: handle.trim().replace(/^@/, '') },
    });
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
        colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.top}>
          <Text style={styles.title}>Pick the one that{'\n'}feels most like you</Text>
          <Text style={styles.subtitle}>
            We read its public posts to learn your vibe — interests, mood, language — and shape your daily phrases.
          </Text>
        </View>

        <View style={styles.bottom}>
          <View style={styles.platformRow}>
            {(['instagram', 'tiktok'] as const).map((p) => {
              const active = platform === p;
              const Icon = p === 'instagram' ? InstagramIcon : TikTokIcon;
              return (
                <Pressable
                  key={p}
                  style={[styles.platformBtn, active && styles.platformBtnActive]}
                  onPress={() => setPlatform(p)}
                >
                  <Icon size={20} color={active ? '#000' : '#fff'} />
                  <Text style={[styles.platformText, active && styles.platformTextActive]}>
                    {p === 'instagram' ? 'Instagram' : 'TikTok'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.at}>@</Text>
            <TextInput
              style={styles.input}
              value={handle}
              onChangeText={setHandle}
              placeholder="your_handle"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Pressable
            style={[styles.continueBtn, !canContinue && styles.btnDisabled]}
            onPress={next}
            disabled={!canContinue}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </Pressable>

          <Pressable style={styles.quizLink} onPress={() => router.push('/(onboarding)/quiz')}>
            <Text style={styles.quizLinkText}>
              Rather not connect?  <Text style={styles.quizLinkStrong}>Answer a few questions</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 24 },
  top: { flex: 1, justifyContent: 'flex-end', paddingBottom: 24 },
  title: { color: '#fff', fontSize: 30, fontWeight: '300', letterSpacing: 1, marginBottom: 12, lineHeight: 38 },
  subtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 15, lineHeight: 22 },
  bottom: { paddingBottom: 40 },
  platformRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  platformBtn: {
    flex: 1, flexDirection: 'row', gap: 8, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  platformBtnActive: { backgroundColor: '#fff', borderColor: '#fff' },
  platformText: { color: 'rgba(255,255,255,0.9)', fontSize: 15 },
  platformTextActive: { color: '#000', fontWeight: '600' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 14, paddingHorizontal: 16, marginBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  at: { color: 'rgba(255,255,255,0.6)', fontSize: 18, marginRight: 8 },
  input: { flex: 1, color: '#fff', fontSize: 18, paddingVertical: 16 },
  continueBtn: { backgroundColor: '#fff', borderRadius: 999, paddingVertical: 18, alignItems: 'center' },
  btnDisabled: { opacity: 0.4 },
  continueBtnText: { color: '#000', fontSize: 18, fontWeight: '500' },
  quizLink: { marginTop: 18, alignItems: 'center' },
  quizLinkText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  quizLinkStrong: { color: '#fff', fontWeight: '600', textDecorationLine: 'underline' },
});
