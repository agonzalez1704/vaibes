import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ShareCard } from '@/components/share-card';

const MINT = '#63E6BE';

type Phrase = { text: string; theme: string | null; generated_at: string };

type Props = {
  visible: boolean;
  phrase: Phrase | null;
  isPro: boolean;
  onClose: () => void;
};

export function ShareModal({ visible, phrase, isPro, onClose }: Props) {
  const cardRef = useRef<View>(null);
  const [pngUri, setPngUri] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  // Render the offscreen card → PNG when phrase changes.
  useEffect(() => {
    if (!visible || !phrase) {
      setPngUri(null);
      return;
    }
    let cancelled = false;
    // Defer so React paints the offscreen ShareCard before we snapshot it.
    const t = setTimeout(async () => {
      try {
        if (!cardRef.current) return;
        const uri = await captureRef(cardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        if (!cancelled) setPngUri(uri);
      } catch (e) {
        console.error('[share] capture failed', e);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [visible, phrase]);

  const onShare = async () => {
    if (!pngUri || sharing) return;
    setSharing(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing not available', 'This device cannot share content.');
        return;
      }
      await Sharing.shareAsync(pngUri, {
        mimeType: 'image/png',
        dialogTitle: 'Share your vibe',
        UTI: 'public.png',
      });
    } catch (e) {
      console.error('[share] share failed', e);
    } finally {
      setSharing(false);
    }
  };

  if (!phrase) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        {/* Offscreen card that view-shot snapshots. Hidden via tiny scale, but
            must be measurable, so we render at 0.01 scale offscreen. */}
        <View pointerEvents="none" style={styles.offscreen}>
          <View ref={cardRef} collapsable={false}>
            <ShareCard phrase={phrase} showWatermark={!isPro} />
          </View>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.title}>Loved this vibe?</Text>
          <Text style={styles.sub}>
            We made a beautiful version for you to share. Tap to send it.
          </Text>

          <ScrollView
            contentContainerStyle={styles.previewWrap}
            showsVerticalScrollIndicator={false}
          >
            {pngUri ? (
              <Image
                source={{ uri: pngUri }}
                style={styles.preview}
                resizeMode="contain"
              />
            ) : (
              <View style={[styles.preview, styles.previewLoading]}>
                <ActivityIndicator color={MINT} />
              </View>
            )}
          </ScrollView>

          <Pressable
            style={[styles.shareBtn, (!pngUri || sharing) && styles.shareBtnDisabled]}
            onPress={onShare}
            disabled={!pngUri || sharing}
          >
            {sharing ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.shareBtnText}>Share</Text>
            )}
          </Pressable>

          <Pressable onPress={onClose}>
            <Text style={styles.cancel}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    // do not set width/height — let the ShareCard expand to its native size
  },
  sheet: {
    flex: 1,
    padding: 24,
    paddingTop: 64,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '300', letterSpacing: 2, textAlign: 'center' },
  sub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  previewWrap: { alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  preview: {
    width: 280,
    height: 350,
    borderRadius: 18,
    backgroundColor: '#0a0a0a',
  },
  previewLoading: { alignItems: 'center', justifyContent: 'center' },
  shareBtn: {
    backgroundColor: MINT,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 24,
  },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnText: { color: '#000', fontSize: 17, fontWeight: '600' },
  cancel: { color: 'rgba(255,255,255,0.55)', marginTop: 14, fontSize: 14 },
});
