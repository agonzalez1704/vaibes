import { createClient, type InsForgeClient } from '@insforge/sdk';
import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useMemo, useState } from 'react';

const TOKEN_REFRESH_MS = 50_000;

let _client: InsForgeClient | null = null;

function getClient(): InsForgeClient {
  if (_client) return _client;
  _client = createClient({
    baseUrl: process.env.EXPO_PUBLIC_INSFORGE_URL!,
    anonKey: process.env.EXPO_PUBLIC_INSFORGE_ANON_KEY!,
  });
  return _client;
}

export function useInsforgeClient(): { client: InsForgeClient; isReady: boolean } {
  const { getToken, isSignedIn } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const client = useMemo(() => getClient(), []);

  useEffect(() => {
    if (!isSignedIn) {
      client.getHttpClient().setAuthToken(null);
      setIsReady(false);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const token = await getToken({ template: 'insforge' });
        if (cancelled) return;
        client.getHttpClient().setAuthToken(token ?? null);
        setIsReady(!!token);
      } catch (err) {
        if (cancelled) return;
        client.getHttpClient().setAuthToken(null);
        setIsReady(false);
        console.error('Token refresh failed', err);
      }
    };
    void refresh();
    const id = setInterval(() => void refresh(), TOKEN_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, getToken, isSignedIn]);

  return { client, isReady };
}
