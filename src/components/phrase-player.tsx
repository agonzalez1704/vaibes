import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, View, Alert } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { PlayIcon, PauseIcon } from '@hugeicons/core-free-icons';
import type { InsForgeClient } from '@insforge/sdk';

const ACCENT = '#63E6BE';

type Props = {
  phraseId: string;
  client: InsForgeClient;
  cachedAudioUrl?: string | null;
  size?: number;
  autoPlay?: boolean;
};

export function PhrasePlayer({ phraseId, client, cachedAudioUrl, size = 56, autoPlay = false }: Props) {
  const [audioUrl, setAudioUrl] = useState<string | null>(cachedAudioUrl ?? null);
  const [fetching, setFetching] = useState(false);
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);

  // When a new url loads, auto-play once ready.
  useEffect(() => {
    if (audioUrl && status?.isLoaded && !status.playing) {
      player.play();
    }
  }, [audioUrl, status?.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-play on mount when deep-linked from a notification tap.
  // Fires once; subsequent renders ignored.
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoFiredRef.current) return;
    autoFiredRef.current = true;
    if (audioUrl) {
      // url already known — playback effect above will trigger
      return;
    }
    // No cached url yet — kick the fetch path.
    void onPress();
  }, [autoPlay]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPress = async () => {
    if (fetching) return;

    if (status?.playing) {
      player.pause();
      return;
    }
    if (audioUrl && status?.isLoaded) {
      player.play();
      return;
    }

    // Fetch / synthesize
    setFetching(true);
    const { data, error } = await client.functions.invoke('synthesize-phrase', {
      body: { phrase_id: phraseId },
    });
    setFetching(false);
    if (error || (data as any)?.error) {
      const body = (data as any) ?? {};
      const code = body.error ?? error?.message;
      if (code === 'tts_daily_cap') {
        Alert.alert('Voice limit reached', "You've used today's voice plays. Cached replays are still free.");
      } else if (code === 'tts_not_configured') {
        Alert.alert('Voice not configured yet', 'Coming soon.');
      } else if (code === 'elevenlabs_failed' && (body.status === 402 || /paid_plan/i.test(body.detail ?? ''))) {
        Alert.alert(
          'Voice unavailable',
          'This voice requires an ElevenLabs paid plan. Pick a different voice in Settings → Voice or upgrade.',
        );
      } else {
        Alert.alert("Couldn't play", `${code ?? 'Try again'}\n${(body.detail ?? '').slice(0, 200)}`);
      }
      return;
    }
    setAudioUrl((data as any).audio_url);
  };

  const playing = !!status?.playing;
  const busy = fetching || (audioUrl && !status?.isLoaded);

  return (
    <Pressable onPress={onPress} style={[styles.btn, { width: size, height: size, borderRadius: size / 2 }]}>
      {busy ? (
        <ActivityIndicator color="#000" />
      ) : (
        <HugeiconsIcon
          icon={playing ? PauseIcon : PlayIcon}
          size={Math.round(size * 0.42)}
          color="#000"
          strokeWidth={2}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
});

// Keep the prop type from being unused if InsForgeClient isn't reachable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _ = View;
