import { AppleIcon, GoogleIcon } from '@/components/icons';
import { useSSO } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const bgVideo = require('../../../assets/videos/rainy-tree-loop.mp4');

// Auto-derive a username so Clerk's required-field gate doesn't block SSO.
// Priority: local part of OAuth email → first name → 'vibes' + random suffix.
function generateUsername(signUp: any): string {
  const email: string | undefined =
    signUp?.emailAddress ?? signUp?.email_address ?? undefined;
  const first: string | undefined = signUp?.firstName ?? signUp?.first_name;
  const base = (email ? email.split('@')[0] : first ?? 'vibes')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 18) || 'vibes';
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  return `${base}_${suffix}`;
}

function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function SignIn() {
  useWarmUpBrowser();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const { startSSOFlow } = useSSO();

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const onSignIn = useCallback(
    async (provider: 'apple' | 'google') => {
      setBusy(provider);
      try {
        const redirectUrl = Linking.createURL('/oauth-native-callback', { scheme: 'vibes' });
        const result = await startSSOFlow({
          strategy: provider === 'apple' ? 'oauth_apple' : 'oauth_google',
          redirectUrl,
        });
        console.log('[clerk] sso result:', {
          createdSessionId: result.createdSessionId,
          authSession: result.authSessionResult?.type,
          signInStatus: result.signIn?.status,
          signUpStatus: result.signUp?.status,
          signUpMissingFields: result.signUp?.missingFields,
          signUpUnverifiedFields: result.signUp?.unverifiedFields,
        });

        if (result.createdSessionId && result.setActive) {
          await result.setActive({ session: result.createdSessionId });
          router.replace('/(onboarding)/handle');
          return;
        }

        // Transfer flow: Apple/Google returned identity, Clerk made signUp but needs completion.
        // Auto-fill any required fields we can derive so the user never sees a form.
        if (result.signUp && result.signUp.status !== 'complete') {
          const missing = (result.signUp.missingFields ?? []) as string[];
          const patch: Record<string, string> = {};
          if (missing.includes('username')) {
            patch.username = generateUsername(result.signUp);
          }
          try {
            const completed = await result.signUp.update(patch);
            if (completed.status === 'complete' && completed.createdSessionId && result.setActive) {
              await result.setActive({ session: completed.createdSessionId });
              router.replace('/(onboarding)/handle');
              return;
            }
            // Still incomplete — fields we can't auto-fill
            Alert.alert(
              'Sign-up needs more info',
              `Clerk wants: ${(completed.missingFields ?? []).join(', ') || 'unknown'}\nUnverified: ${(completed.unverifiedFields ?? []).join(', ') || 'none'}`,
            );
          } catch (e: any) {
            Alert.alert('Sign-up failed', e?.errors?.[0]?.message ?? e?.message ?? String(e));
          }
          return;
        }

        if (result.authSessionResult?.type === 'cancel') return;

        Alert.alert(
          'Sign-in incomplete',
          `authSession=${result.authSessionResult?.type}, signIn=${result.signIn?.status}, signUp=${result.signUp?.status}\n\nCheck Clerk dashboard:\n• ${provider} provider enabled\n• Bundle ID com.vaibes.app whitelisted\n• Allowed redirect: ${redirectUrl}`,
        );
      } catch (err: any) {
        console.error('[clerk] sso error:', err);
        Alert.alert('Sign-in failed', err?.message ?? String(err));
      } finally {
        setBusy(null);
      }
    },
    [startSSOFlow, router],
  );

  return (
    <View style={styles.bg}>
      <VideoView
        style={StyleSheet.absoluteFill as any}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <View style={styles.container}>
        <View style={styles.top}>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>Sign in to keep your daily vibes.</Text>
        </View>

        <View style={styles.bottom}>
          <Pressable
            style={[styles.btn, styles.appleBtn]}
            disabled={!!busy}
            onPress={() => onSignIn('apple')}
          >
            {busy === 'apple' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <AppleIcon size={20} color="#fff" />
                <Text style={styles.appleText}>Continue with Apple</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[styles.btn, styles.googleBtn]}
            disabled={!!busy}
            onPress={() => onSignIn('google')}
          >
            {busy === 'google' ? (
              <ActivityIndicator />
            ) : (
              <>
                <GoogleIcon size={20} />
                <Text style={styles.googleText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <Pressable style={styles.back} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  container: { flex: 1, padding: 24 },
  top: { flex: 1, justifyContent: 'flex-end', paddingBottom: 24 },
  title: { color: '#fff', fontSize: 36, fontWeight: '300', letterSpacing: 4, marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 16 },
  bottom: { paddingBottom: 40 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 999,
    paddingVertical: 16,
    marginBottom: 12,
  },
  appleBtn: { backgroundColor: 'rgba(0,0,0,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  appleText: { color: '#fff', fontSize: 16, fontWeight: '500' },
  googleBtn: { backgroundColor: '#fff' },
  googleText: { color: '#000', fontSize: 16, fontWeight: '500' },
  back: { marginTop: 16, alignItems: 'center' },
  backText: { color: 'rgba(255,255,255,0.85)' },
});
