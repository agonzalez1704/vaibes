import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LogoRipple } from '@/components/logo';

const bgVideo = require('../../assets/videos/tree.mp4');

export default function Splash() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  const player = useVideoPlayer(bgVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/(app)/home');
    }
  }, [isLoaded, isSignedIn]);

  return (
    <View style={styles.bg}>
      <VideoView
        style={StyleSheet.absoluteFill as any}
        player={player}
        contentFit="cover"
        nativeControls={false}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.35)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.8)']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill as any}
      />

      <View style={styles.content}>
        <View style={{ marginBottom: 24 }}>
          <LogoRipple size={132} />
        </View>
        <Text style={styles.title}>VAIBES</Text>
        <Text style={styles.subtitle}>
          A mindfulness space for your{'\n'}sleep, meditation, focus, and relaxation
        </Text>
      </View>
      <View style={styles.bottom}>
        <Pressable
          style={styles.startBtn}
          onPress={() => router.push('/(auth)/sign-in')}
        >
          <Text style={styles.startBtnText}>Start</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.loginText}>Log in</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 120 },
  title: {
    color: '#fff',
    fontSize: 38,
    letterSpacing: 12,
    fontWeight: '300',
    marginBottom: 20,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 40,
  },
  bottom: { paddingBottom: 60, paddingHorizontal: 24, alignItems: 'center' },
  startBtn: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  startBtnText: { color: '#000', fontSize: 18, fontWeight: '500' },
  loginText: { color: '#fff', fontSize: 16 },
});
