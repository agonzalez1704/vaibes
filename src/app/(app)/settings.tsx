import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Switch, ActivityIndicator, Alert, ImageBackground,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  ArrowLeft01Icon, Notification03Icon, GlobalIcon, Calendar01Icon, VolumeHighIcon, CrownIcon,
} from '@hugeicons/core-free-icons';
import { useInsforgeClient } from '@/lib/insforge';
import { VOICES, LANGUAGE_DEFAULT_VOICE } from '@/lib/voices';
import { useIsPro } from '@/lib/use-pro';
import { presentPaywall, presentPaywallIfNeeded, presentCustomerCenter, restorePurchases } from '@/lib/iap';

const MINT = '#63E6BE';

const ACCENT = '#FF2D78';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'ja', label: '日本語' },
];

type Prefs = {
  user_id: string;
  frequency: 'once' | 'twice' | 'thrice' | 'on_demand';
  send_times: string[];
  timezone: string;
  notifications_enabled: boolean;
};

export default function Settings() {
  const router = useRouter();
  const { client, isReady } = useInsforgeClient();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [voice, setVoice] = useState<string | null>(null); // null = auto by language
  const { isPro } = useIsPro();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    (async () => {
      const [{ data: pref }, { data: prof }] = await Promise.all([
        client.database.from('preferences').select('*').maybeSingle(),
        client.database.from('profiles').select('language, preferred_voice_id').maybeSingle(),
      ]);
      setPrefs(pref ?? {
        user_id: '',
        frequency: 'once',
        send_times: ['08:00'],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        notifications_enabled: true,
      });
      setLanguage(prof?.language ?? 'en');
      setVoice(prof?.preferred_voice_id ?? null);
      setLoading(false);
    })();
  }, [client, isReady]);

  const save = useCallback(async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    const { error } = await client.database.from('preferences').upsert([{
      ...next,
      timezone: next.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }], { onConflict: 'user_id' });
    setSaving(false);
    if (error) Alert.alert('Couldn’t save', error.message);
  }, [client, prefs]);

  const saveLanguage = async (code: string) => {
    setLanguage(code);
    setSaving(true);
    const { error } = await client.database.from('profiles').update({ language: code });
    setSaving(false);
    if (error) Alert.alert('Couldn’t save', error.message);
  };

  const saveVoice = async (voiceId: string | null) => {
    // Free users get "auto by language" only. Manual voice picking is Pro.
    if (!isPro && voiceId !== null) {
      const purchased = await presentPaywallIfNeeded();
      if (!purchased) return;
    }
    setVoice(voiceId);
    setSaving(true);
    const { error } = await client.database.from('profiles').update({ preferred_voice_id: voiceId });
    setSaving(false);
    if (error) Alert.alert('Couldn’t save', error.message);
  };

  const setFrequency = (frequency: Prefs['frequency']) => {
    if (!prefs) return;
    void save({ frequency, frequency_set_by_user: true } as any);
  };

  if (loading || !prefs) {
    return <View style={styles.center}><ActivityIndicator color={ACCENT} /></View>;
  }

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

      <ScrollView style={styles.container} contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 48 }}>
        <ProBlock />

        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <HugeiconsIcon icon={ArrowLeft01Icon} size={24} color="#fff" strokeWidth={1.8} />
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 24 }}>{saving ? <ActivityIndicator color={ACCENT} /> : null}</View>
        </View>

        <Section icon={Notification03Icon} label="Notifications">
          <Row label="Enabled">
            <Switch
              value={prefs.notifications_enabled}
              onValueChange={(v) => save({ notifications_enabled: v })}
              trackColor={{ true: ACCENT, false: 'rgba(255,255,255,0.2)' }}
              thumbColor="#fff"
            />
          </Row>
        </Section>

        <Section icon={Calendar01Icon} label="Frequency">
          <View style={styles.segment}>
            {(['once', 'twice', 'thrice', 'on_demand'] as const).map((f) => (
              <Pressable
                key={f}
                style={[styles.segmentBtn, prefs.frequency === f && styles.segmentBtnActive]}
                onPress={() => setFrequency(f)}
              >
                <Text style={[styles.segmentText, prefs.frequency === f && styles.segmentTextActive]}>
                  {f === 'once' ? '1×' : f === 'twice' ? '2×' : f === 'thrice' ? '3×' : 'On demand'}
                </Text>
              </Pressable>
            ))}
          </View>
          {prefs.frequency !== 'on_demand' && (
            <Text style={styles.hintText}>
              Vibes land at unexpected moments between 9 AM and 9 PM. Part of the magic is not knowing when.
            </Text>
          )}
        </Section>

        <Section icon={GlobalIcon} label="Language">
          <View style={styles.langWrap}>
            {LANGUAGES.map((l) => {
              const active = language === l.code;
              return (
                <Pressable
                  key={l.code}
                  style={[styles.langPill, active && styles.langPillActive]}
                  onPress={() => saveLanguage(l.code)}
                >
                  <Text style={[styles.langText, active && styles.langTextActive]}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section icon={VolumeHighIcon} label="Voice">
          <View style={styles.voiceList}>
            <Pressable
              style={[styles.voiceRow, voice === null && styles.voiceRowActive]}
              onPress={() => saveVoice(null)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.voiceName}>Auto by language</Text>
                <Text style={styles.voiceVibe}>
                  Picks best voice for {LANGUAGES.find((l) => l.code === language)?.label ?? 'your language'}
                </Text>
              </View>
              {voice === null ? <Text style={styles.voiceCheck}>✓</Text> : null}
            </Pressable>

            {VOICES.map((v) => {
              const active = voice === v.id;
              const isLangDefault = LANGUAGE_DEFAULT_VOICE[language] === v.id;
              return (
                <Pressable
                  key={v.id}
                  style={[styles.voiceRow, active && styles.voiceRowActive]}
                  onPress={() => saveVoice(v.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.voiceName}>
                      {v.name} <Text style={styles.voiceGender}>· {v.gender}</Text>
                      {isLangDefault ? <Text style={styles.voiceDefaultTag}>  · default</Text> : null}
                    </Text>
                    <Text style={styles.voiceVibe}>{v.vibe}</Text>
                  </View>
                  {active ? <Text style={styles.voiceCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Text style={styles.tz}>Timezone · {prefs.timezone}</Text>

        {__DEV__ && (
          <Pressable
            style={styles.testBtn}
            onPress={async () => {
              const { data, error } = await client.functions.invoke('test-push', {});
              Alert.alert('Test push', error?.message ?? JSON.stringify(data));
            }}
          >
            <Text style={styles.testBtnText}>Send test push to myself</Text>
          </Pressable>
        )}
      </ScrollView>
    </ImageBackground>
  );
}

function ProBlock() {
  const { isPro, ready, refresh } = useIsPro();
  const [restoring, setRestoring] = useState(false);

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    const r = await restorePurchases();
    setRestoring(false);
    if (r.error) Alert.alert("Couldn't restore", r.error);
    else if (r.pro) {
      await refresh();
      Alert.alert('Restored', 'Pro is active on this device.');
    } else {
      Alert.alert('No purchases found', 'Nothing to restore on this Apple ID.');
    }
  };

  if (!ready) {
    return (
      <View style={{ height: 90, alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
        <ActivityIndicator color={MINT} />
      </View>
    );
  }

  if (isPro) {
    return (
      <View style={[styles.proCard, { borderColor: MINT, backgroundColor: 'rgba(99,230,190,0.06)' }]}>
        <View style={styles.proHeaderRow}>
          <HugeiconsIcon icon={CrownIcon} size={22} color={MINT} strokeWidth={1.8} />
          <Text style={[styles.proTitle, { color: MINT }]}>You're Pro</Text>
        </View>
        <Text style={styles.proSub}>Thanks for supporting Vaibes.</Text>
        <Pressable style={[styles.proBtn, { backgroundColor: MINT }]} onPress={() => presentCustomerCenter()}>
          <Text style={[styles.proBtnText, { color: '#000' }]}>Manage subscription</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.proCard, { borderColor: 'rgba(255,255,255,0.15)' }]}>
      <View style={styles.proHeaderRow}>
        <HugeiconsIcon icon={CrownIcon} size={22} color={MINT} strokeWidth={1.8} />
        <Text style={styles.proTitle}>Vaibes Pro</Text>
      </View>
      <Text style={styles.proSub}>
        Up to 3 vibes a day, voice playback, full history, every voice. From $1.99/mo.
      </Text>
      <Pressable style={[styles.proBtn, { backgroundColor: MINT }]} onPress={() => presentPaywall()}>
        <Text style={[styles.proBtnText, { color: '#000' }]}>See plans</Text>
      </Pressable>
      <Pressable onPress={onRestore} disabled={restoring} style={{ marginTop: 12, alignItems: 'center' }}>
        {restoring
          ? <ActivityIndicator color="rgba(255,255,255,0.6)" />
          : <Text style={styles.restoreText}>Restore purchases</Text>}
      </Pressable>
    </View>
  );
}

function Section({ icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 30 }}>
      <View style={styles.sectionHead}>
        <HugeiconsIcon icon={icon} size={16} color={ACCENT} strokeWidth={2} />
        <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      </View>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}


const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1 },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 },
  title: { color: '#fff', fontSize: 18, letterSpacing: 4, fontWeight: '300' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, letterSpacing: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rowLabel: { color: '#fff', fontSize: 16 },
  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  segmentBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  segmentText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  hintText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 12, lineHeight: 18, fontStyle: 'italic' },
  langWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langPill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.3)',
  },
  langPillActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  langText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  langTextActive: { color: '#fff', fontWeight: '600' },
  tz: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 8 },
  testBtn: { marginTop: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  testBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  voiceList: { gap: 6 },
  voiceRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  voiceRowActive: { borderColor: ACCENT, backgroundColor: 'rgba(255,45,120,0.12)' },
  voiceName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  voiceGender: { color: 'rgba(255,255,255,0.45)', fontWeight: '400' },
  voiceDefaultTag: { color: ACCENT, fontWeight: '600' },
  voiceVibe: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 },
  voiceCheck: { color: ACCENT, fontSize: 18, fontWeight: '700', marginLeft: 8 },
  proCard: {
    borderWidth: 1, borderRadius: 18, padding: 20, marginBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  proHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  proTitle: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: 1 },
  proSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  proBtn: { borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  proBtnText: { fontSize: 15, fontWeight: '600' },
  restoreText: { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
});
