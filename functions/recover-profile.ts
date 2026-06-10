// Self-heal: if scrape_jobs succeeded but profiles row missing, re-fetch the
// Apify dataset and re-invoke profile-build. Called by the loading screen
// after ~25s of "succeeded but no profile" to recover from transient failures.

import { createAdminClient } from 'npm:@insforge/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[recover-profile] uncaught:', err);
    return json({ error: 'uncaught', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const userId = decodeJwt(userToken)?.sub as string | undefined;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  // Already have a profile? Nothing to do.
  const { data: existing } = await admin.database
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return json({ ok: true, status: 'already_built' }, 200);

  // Latest succeeded scrape for this user
  const { data: jobs } = await admin.database
    .from('scrape_jobs')
    .select('id, result_url, posts_count')
    .eq('user_id', userId)
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1);
  const job = jobs?.[0];
  if (!job?.result_url?.startsWith('apify://dataset/')) {
    return json({ error: 'no_succeeded_scrape', detail: 'wait for scrape to finish' }, 404);
  }
  const datasetId = job.result_url.replace('apify://dataset/', '');

  // Re-fetch dataset and re-fire profile-build
  const apifyToken = Deno.env.get('APIFY_TOKEN');
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&clean=true&limit=50`,
  );
  if (!itemsRes.ok) return json({ error: 'apify_fetch_failed', status: itemsRes.status }, 502);
  const items: any[] = await itemsRes.json();
  const posts = items
    .map((it) => ({
      caption: it.caption ?? it.text ?? it.desc ?? null,
      hashtags: it.hashtags ?? [],
    }))
    .filter((p) => p.caption);

  if (posts.length === 0) return json({ error: 'no_captions' }, 422);

  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  const pbRes = await fetch(`${baseUrl}/functions/profile-build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': Deno.env.get('INTERNAL_FN_KEY') ?? '',
    },
    body: JSON.stringify({ user_id: userId, posts }),
  });
  const pbBody = await pbRes.text();
  if (!pbRes.ok) return json({ error: 'profile_build_failed', status: pbRes.status, body: pbBody }, 502);

  return json({ ok: true, status: 'rebuilt', posts: posts.length }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
