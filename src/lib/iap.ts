// RevenueCat client wrapper for Vaibes.
// - One init at app start (in root layout) with the iOS public API key.
// - logIn() called whenever Clerk userId is known so RC ties purchases to that
//   identity (same id surfaces as `app_user_id` in webhooks).
// - Paywall + Customer Center use the prebuilt UI from react-native-purchases-ui
//   so we don't reimplement Apple-policy compliance text + restore + manage.

import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesError } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import { Platform } from 'react-native';

// MUST match the entitlement identifier in the RC dashboard exactly.
export const ENTITLEMENT_ID = 'Vaibes Pro';

// Hardcoded fallback so the app still configures if EAS env vars failed to
// inject at build time. The env var is the source of truth across envs.
const RC_IOS_KEY = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? 'appl_SSZtapFWfgHLTxTmfYHzRRnjDGA';

let initialized = false;

export async function initPurchases(): Promise<void> {
  if (initialized) return;
  if (Platform.OS !== 'ios') return; // android key would go here later

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  await Purchases.configure({ apiKey: RC_IOS_KEY });
  initialized = true;
}

export async function loginPurchases(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!initialized) await initPurchases();
  try {
    const current = await Purchases.getAppUserID();
    if (current === userId) return; // already logged in as this user
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[iap] logIn failed', e);
  }
}

export async function logoutPurchases(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!initialized) return;
  try { await Purchases.logOut(); } catch { /* ignore — was anonymous */ }
}

export function isProActive(info: CustomerInfo | null | undefined): boolean {
  if (!info) return false;
  return !!info.entitlements?.active?.[ENTITLEMENT_ID];
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    if (!initialized) await initPurchases();
    return await Purchases.getCustomerInfo();
  } catch (e) {
    console.warn('[iap] getCustomerInfo failed', e);
    return null;
  }
}

export async function restorePurchases(): Promise<{ pro: boolean; error?: string }> {
  if (Platform.OS !== 'ios') return { pro: false, error: 'unsupported_platform' };
  try {
    if (!initialized) await initPurchases();
    const info = await Purchases.restorePurchases();
    return { pro: isProActive(info) };
  } catch (e) {
    const err = e as PurchasesError;
    return { pro: false, error: err?.message ?? String(e) };
  }
}

/**
 * Show the RevenueCat paywall (configured in the RC dashboard).
 * Returns true if the user purchased or already has the entitlement,
 * false if they cancelled or it errored.
 */
export async function presentPaywall(opts?: { offeringIdentifier?: string }): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (!initialized) await initPurchases();
  try {
    const result = await RevenueCatUI.presentPaywall(
      opts?.offeringIdentifier
        ? { offering: { identifier: opts.offeringIdentifier } as any }
        : undefined,
    );
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (e) {
    console.warn('[iap] presentPaywall failed', e);
    return false;
  }
}

/**
 * Paywall variant that only shows if the user does NOT have the entitlement.
 * Use as the universal trigger for "free user tried to use a Pro feature".
 */
export async function presentPaywallIfNeeded(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (!initialized) await initPurchases();
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: ENTITLEMENT_ID,
    });
    return (
      result === PAYWALL_RESULT.PURCHASED ||
      result === PAYWALL_RESULT.RESTORED ||
      result === PAYWALL_RESULT.NOT_PRESENTED // user already has entitlement
    );
  } catch (e) {
    console.warn('[iap] presentPaywallIfNeeded failed', e);
    return false;
  }
}

/**
 * Show RC's Customer Center — handles cancellation, refund requests,
 * subscription changes, and contact-support. Apple requires apps offering
 * subscriptions to expose a way to manage them.
 */
export async function presentCustomerCenter(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (!initialized) await initPurchases();
  try {
    await RevenueCatUI.presentCustomerCenter();
  } catch (e) {
    console.warn('[iap] presentCustomerCenter failed', e);
  }
}
