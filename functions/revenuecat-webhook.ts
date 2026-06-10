// RevenueCat webhook → updates users.subscription_tier in InsForge.
// RC posts JSON with `event.type` describing what happened. Verify auth via
// shared secret in Authorization header.
//
// Set up:
//   1. In RC dashboard → Integrations → Webhooks
//   2. URL: https://w3fgg5pv.us-east.insforge.app/functions/revenuecat-webhook
//   3. Auth header value: <REVENUECAT_WEBHOOK_SECRET>  (any random string)
//   4. Store the same value via:
//      npx @insforge/cli secrets add REVENUECAT_WEBHOOK_SECRET <value>

import { createAdminClient } from 'npm:@insforge/sdk';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' };
const ENTITLEMENT = 'Vaibes Pro';

// RC's event.period_type is the offer phase (NORMAL/TRIAL/INTRO), not the
// billing duration — derive duration from the product identifier instead.
function periodFromProductId(productId: string | null): 'monthly' | 'yearly' | 'lifetime' | null {
  if (!productId) return null;
  const p = productId.toLowerCase();
  if (p.includes('lifetime')) return 'lifetime';
  if (p.includes('year') || p.includes('annual')) return 'yearly';
  if (p.includes('month')) return 'monthly';
  return null;
}

export default async function (req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[rc-webhook] uncaught', err);
    return json({ error: 'uncaught', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  if (!expected || auth !== expected) {
    console.error('[rc-webhook] auth mismatch');
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const event = payload?.event;
  if (!event) return json({ error: 'no_event' }, 400);

  // RevenueCat uses the app_user_id we set via Purchases.logIn (Clerk user id).
  const userId: string | undefined = event.app_user_id;
  if (!userId) return json({ error: 'no_app_user_id' }, 400);

  const type: string = event.type ?? 'UNKNOWN';
  console.log(`[rc-webhook] ${type} user=${userId}`);

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  // Active entitlement → set Pro. Cancellation/expiration/refund → free.
  // RC event semantics:
  //   INITIAL_PURCHASE / RENEWAL / PRODUCT_CHANGE / UNCANCELLATION / TRANSFER → active
  //   CANCELLATION (user cancelled but still active until period end) → stay Pro
  //   EXPIRATION → free
  //   REFUND / SUBSCRIPTION_PAUSED → free (lose access immediately)
  //   BILLING_ISSUE → keep Pro for grace period
  const expiresMs: number | null = event.expiration_at_ms ?? null;
  const expiresAt = expiresMs ? new Date(expiresMs).toISOString() : null;
  const productId: string | null = event.product_id ?? null;
  const period = periodFromProductId(productId);

  const ACTIVE_EVENTS = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'PRODUCT_CHANGE',
    'UNCANCELLATION',
    'TRANSFER',
    'NON_RENEWING_PURCHASE', // lifetime / one-time
    'CANCELLATION',          // still active until expiry; webhook fires immediately
    'BILLING_ISSUE',         // grace period
  ]);
  const REVOKE_EVENTS = new Set([
    'EXPIRATION',
    'REFUND',
    'SUBSCRIPTION_PAUSED',
    'SUBSCRIBER_ALIAS', // identity merge handled separately
  ]);

  let nextTier: 'pro' | 'free';
  if (ACTIVE_EVENTS.has(type)) {
    // Confirm the user has the entitlement active per the payload entitlements.
    const ent = event.entitlement_ids ?? event.entitlement_id ?? null;
    const hasEnt = Array.isArray(ent) ? ent.includes(ENTITLEMENT) : ent === ENTITLEMENT;
    // For lifetime, no expiry → always pro. For sub, only pro if not yet expired.
    const stillValid = !expiresMs || expiresMs > Date.now();
    nextTier = hasEnt && stillValid ? 'pro' : 'free';
  } else if (REVOKE_EVENTS.has(type)) {
    nextTier = 'free';
  } else {
    // TEST / unknown → no-op
    return json({ ok: true, ignored: type }, 200);
  }

  const { error } = await admin.database
    .from('users')
    .update({
      subscription_tier: nextTier,
      subscription_expires_at: expiresAt,
      subscription_product_id: productId,
      subscription_period: period,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[rc-webhook] db update failed', error.message);
    return json({ error: 'db_update_failed', detail: error.message }, 500);
  }

  return json({ ok: true, type, user_id: userId, tier: nextTier }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
