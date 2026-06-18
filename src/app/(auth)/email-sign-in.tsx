import { useSignIn } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useInsforgeClient } from '@/lib/insforge';

const bgVideo = require('../../../assets/videos/rainy-tree-loop.mp4');

// The App Review demo account signs in by these credentials. Because the Clerk
// instance forces an email-code second factor and has no username identifier,
// we complete this specific account via a server-minted sign-in ticket so the
// reviewer experiences a normal username + password login.
const DEMO_USERNAME = 'appreview';
const DEMO_PASSWORD = 'Vaibes-Review-2026!xQ7';

// Email + password sign-in. Primary use: a reviewer/demo account that already
// completed onboarding. After auth, route to home if the account has a profile,
// otherwise into onboarding.
export default function EmailSignIn() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { client } = useInsforgeClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const canSubmit = isLoaded && email.trim().length > 3 && password.length >= 1 && !busy;

  const onSubmit = async () => {
    if (!canSubmit || !signIn) return;
    setBusy(true);
    try {
      const id = email.trim();
      const isDemo = id.toLowerCase() === DEMO_USERNAME && password === DEMO_PASSWORD;

      let attempt;
      if (isDemo) {
        // Complete the demo account via a server-minted ticket (the instance
        // can't complete it with a plain identifier + password).
        const res = await fetch(`${process.env.EXPO_PUBLIC_INSFORGE_URL}/functions/demo-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_INSFORGE_ANON_KEY}`,
          },
        });
        const data = await res.json();
        if (!data?.token) throw new Error('Demo session unavailable. Please try again.');
        attempt = await signIn.create({ strategy: 'ticket', ticket: data.token });
      } else {
        attempt = await signIn.create({ identifier: id, password });
      }

      if (attempt.status !== 'complete') {
        Alert.alert('Sign-in incomplete', `Status: ${attempt.status}`);
        setBusy(false);
        return;
      }
      await setActive!({ session: attempt.createdSessionId });

      // Route by whether onboarding is already done for this account. The
      // InsForge client picks up the freshly-active Clerk session token.
      let hasProfile = false;
      try {
        const { data } = await client.database
          .from('profiles')
          .select('user_id')
          .maybeSingle();
        hasProfile = !!data;
      } catch { /* fall through to onboarding */ }

      router.replace(hasProfile ? '/(app)/home' : '/(onboarding)/handle');
    } catch (err: any) {
      Alert.alert('Sign-in failed', err?.errors?.[0]?.message ?? err?.message ?? String(err));
      setBusy(false);
    }
  };

  return (
    <View style={styles.bg}>
      <VideoView style={StyleSheet.absoluteFill as any} player={player} contentFit="cover" nativeControls={false} />
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.9)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.top}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Enter your email or username and password.</Text>
        </View>

        <View style={styles.bottom}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email or username"
            placeholderTextColor="rgba(255,255,255,0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            textContentType="username"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.4)"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            textContentType="password"
          />

          <Pressable style={[styles.submitBtn, !canSubmit && styles.btnDisabled]} onPress={onSubmit} disabled={!canSubmit}>
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Sign in</Text>}
          </Pressable>

          <Pressable style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
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
  title: { color: '#fff', fontSize: 32, fontWeight: '300', letterSpacing: 2, marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 16 },
  bottom: { paddingBottom: 40 },
  input: {
    color: '#fff', fontSize: 16, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)',
  },
  submitBtn: { backgroundColor: '#fff', borderRadius: 999, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.4 },
  submitText: { color: '#000', fontSize: 16, fontWeight: '600' },
  back: { marginTop: 16, alignItems: 'center' },
  backText: { color: 'rgba(255,255,255,0.85)' },
});
