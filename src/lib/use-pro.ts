import { useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';
import { Platform } from 'react-native';
import { ENTITLEMENT_ID, isProActive, initPurchases } from '@/lib/iap';

/**
 * useIsPro — single source of truth for "user has Vaibes Pro right now".
 *
 * - Initial read: Purchases.getCustomerInfo (cached + remote)
 * - Live updates: addCustomerInfoUpdateListener — fires on purchase, restore,
 *   renewal-on-foreground, paywall close, etc.
 * - Returns { isPro, ready } where `ready` is false until the first read lands,
 *   so callers can show a loading state instead of flashing "Free → Pro".
 */
export function useIsPro(): { isPro: boolean; ready: boolean; refresh: () => Promise<void> } {
  const [isPro, setIsPro] = useState(false);
  const [ready, setReady] = useState(false);

  const apply = (info: CustomerInfo | null | undefined) => {
    setIsPro(isProActive(info));
    setReady(true);
  };

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      await initPurchases();
      try {
        const info = await Purchases.getCustomerInfo();
        if (!cancelled) apply(info);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();

    const listener = (info: CustomerInfo) => apply(info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      cancelled = true;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  return {
    isPro,
    ready,
    refresh: async () => {
      try {
        const info = await Purchases.getCustomerInfo();
        apply(info);
      } catch { /* ignore */ }
    },
  };
}

export { ENTITLEMENT_ID };
