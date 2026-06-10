import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useInsforgeClient } from '@/lib/insforge';
import { BubbleField, type Weights } from '@/components/bubble-field';
import { QUIZ_PAGES } from '@/lib/quiz-data';

const bgVideo = require('../../../assets/videos/grass_field.mp4');

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
];

function deviceLang(): string {
  const tag = (Intl.DateTimeFormat().resolvedOptions().locale ?? 'en').slice(0, 2);
  return LANGUAGES.some((l) => l.code === tag) ? tag : 'en';
}

export default function QuizScreen() {
  const router = useRouter();
  const { client, isReady } = useInsforgeClient();
  const [page, setPage] = useState(0);
  const [weights, setWeights] = useState<Weights>({});
  const [language, setLanguage] = useState<string>(deviceLang());
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const current = QUIZ_PAGES[page];
  const isLast = page === QUIZ_PAGES.length - 1;

  // require at least 1 pick on the current page
  const pickedOnPage = current.items.some((it) => (weights[it.key] ?? 0) > 0);

  const next = async () => {
    if (!pickedOnPage) return;
    if (!isLast) {
      setPage((p) => p + 1);
      return;
    }
    // submit
    if (!isReady || busy) return;
    setBusy(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const answers = QUIZ_PAGES.map((pg) => ({
        page: pg.id,
        picks: pg.items
          .map((it) => ({ key: it.key, label: it.label, weight: weights[it.key] ?? 0 }))
          .filter((x) => x.weight > 0),
      }));
      const { data, error } = await client.functions.invoke('submit-quiz', {
        body: { answers, timezone, language },
      });
      if (error || !data?.ok) {
        Alert.alert('Couldn’t save', error?.message ?? JSON.stringify(data));
        setBusy(false);
        return;
      }
      router.replace('/(app)/home');
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
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <View style={styles.header}>
        <Text style={styles.step}>{page + 1} / {QUIZ_PAGES.length}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.hint}>{current.hint}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.langRow}
        style={styles.langScroll}
      >
        {LANGUAGES.map((l) => {
          const active = language === l.code;
          return (
            <Pressable
              key={l.code}
              style={[styles.langPill, active && styles.langPillActive]}
              onPress={() => setLanguage(l.code)}
            >
              <Text style={[styles.langText, active && styles.langTextActive]}>{l.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.field}>
        <BubbleField items={current.items} weights={weights} onChange={setWeights} />
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[styles.nextBtn, !pickedOnPage && styles.btnDisabled]}
          onPress={next}
          disabled={!pickedOnPage || busy}
        >
          {busy ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.nextText}>{isLast ? 'Create my vibes' : 'Next'}</Text>
          )}
        </Pressable>
        <Pressable style={styles.back} onPress={() => (page === 0 ? router.back() : setPage((p) => p - 1))}>
          <Text style={styles.backText}>{page === 0 ? 'Back' : 'Previous'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  header: { paddingHorizontal: 24, paddingTop: 72, alignItems: 'center' },
  step: { color: 'rgba(255,255,255,0.4)', fontSize: 12, letterSpacing: 2, marginBottom: 10 },
  title: { color: '#fff', fontSize: 26, fontWeight: '300', letterSpacing: 0.5, textAlign: 'center' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 8, textAlign: 'center' },
  langScroll: { maxHeight: 44, marginTop: 16 },
  langRow: { paddingHorizontal: 24, gap: 8, alignItems: 'center' },
  langPill: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  langPillActive: { backgroundColor: '#FF2D78', borderColor: '#FF2D78' },
  langText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  langTextActive: { color: '#fff', fontWeight: '600' },
  field: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 40 },
  nextBtn: { backgroundColor: '#fff', borderRadius: 999, paddingVertical: 18, alignItems: 'center' },
  btnDisabled: { opacity: 0.35 },
  nextText: { color: '#000', fontSize: 17, fontWeight: '600' },
  back: { marginTop: 14, alignItems: 'center' },
  backText: { color: 'rgba(255,255,255,0.6)' },
});
