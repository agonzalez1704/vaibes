import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text } from 'react-native';
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { tokenCache } from '@/lib/clerk-cache';
import { initPurchases, loginPurchases, logoutPurchases } from '@/lib/iap';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout() {
  if (!publishableKey) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <StatusBar style="light" />
        <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', lineHeight: 24 }}>
          Configuration error: missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY.
          {'\n\n'}This build was created without its environment variables.
        </Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <StatusBar style="light" />
      <PurchasesBridge />
      <NotificationDeepLink />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </ClerkProvider>
  );
}

// Initialize RevenueCat once and keep its app_user_id in sync with Clerk.
// Login → Pro entitlement check + webhook attribution all key off this id.
function PurchasesBridge() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  useEffect(() => {
    void initPurchases();
  }, []);
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && userId) void loginPurchases(userId);
    else void logoutPurchases();
  }, [isLoaded, isSignedIn, userId]);
  return null;
}

// Listens for notification taps (cold start + warm) and routes to home
// with `play=<phrase_id>` so PhrasePlayer auto-starts.
function NotificationDeepLink() {
  const router = useRouter();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier;
    if (handledRef.current === id) return;
    handledRef.current = id;

    const data = lastResponse.notification.request.content.data as { phrase_id?: string } | undefined;
    const phraseId = data?.phrase_id;
    if (phraseId) {
      router.push({ pathname: '/(app)/home', params: { play: phraseId } });
    }
  }, [lastResponse, router]);

  return null;
}
