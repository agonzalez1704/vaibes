import { useEffect, useState } from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { ActivityIndicator, View } from 'react-native';
import { useInsforgeClient } from '@/lib/insforge';

export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const { client, isReady } = useInsforgeClient();
  const [checked, setChecked] = useState<'pending' | 'onboard' | 'app'>('pending');

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    (async () => {
      // Profile = onboarding complete, whether from social scrape OR the quiz.
      const { data: profile } = await client.database
        .from('profiles')
        .select('user_id')
        .maybeSingle();
      if (cancelled) return;
      setChecked(profile ? 'app' : 'onboard');
    })();
    return () => {
      cancelled = true;
    };
  }, [client, isReady]);

  if (!isLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  }
  if (!isSignedIn) return <Redirect href="/" />;
  if (checked === 'pending') {
    return <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  }
  if (checked === 'onboard') return <Redirect href="/(onboarding)/handle" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
