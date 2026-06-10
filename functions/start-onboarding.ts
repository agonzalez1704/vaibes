import { createAdminClient } from 'npm:@insforge/sdk';

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

const APIFY_ACTORS: Record<string, string> = {
  instagram: 'apify~instagram-post-scraper',
  tiktok: 'clockworks~tiktok-scraper',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function (req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[start-onboarding] uncaught:', err);
    return json({ error: 'uncaught', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!userToken) return json({ error: 'unauthorized' }, 401);

  const claims = decodeJwt(userToken);
  const userId = claims?.sub as string | undefined;
  const userEmail = (claims?.email as string | undefined) ?? null;
  if (!userId) return json({ error: 'unauthorized', detail: 'no_sub_claim' }, 401);

  let body: { handle?: string; platform?: 'instagram' | 'tiktok'; consent?: boolean; timezone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const handle = (body.handle ?? '').replace(/^@/, '').trim().toLowerCase();
  const platform = body.platform;
  const timezone = body.timezone || 'UTC';
  if (!handle || !platform || !APIFY_ACTORS[platform]) return json({ error: 'invalid_input' }, 400);
  if (!body.consent) return json({ error: 'consent_required' }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const { error: userErr2 } = await admin.database
    .from('users')
    .upsert([{ id: userId, email: userEmail }], { onConflict: 'id' });
  if (userErr2) return json({ error: 'user_upsert_failed', detail: userErr2.message }, 500);

  const { data: handleRow, error: handleErr } = await admin.database
    .from('social_handles')
    .upsert([{ user_id: userId, platform, handle, status: 'pending' }], { onConflict: 'user_id,platform' })
    .select()
    .single();
  if (handleErr) return json({ error: 'handle_save_failed', detail: handleErr.message }, 500);

  await admin.database.from('consents').upsert([{
    user_id: userId,
    handle_id: handleRow.id,
    scope: 'public_post_analysis',
    policy_version: 'v1',
    ip: req.headers.get('x-forwarded-for') ?? null,
  }], { onConflict: 'user_id,scope,policy_version', ignoreDuplicates: true });

  await admin.database.from('preferences').upsert([{
    user_id: userId,
    frequency: 'once',
    send_times: ['08:00'],
    timezone,
    notifications_enabled: true,
  }], { onConflict: 'user_id' });

  const { data: jobRow, error: jobErr } = await admin.database
    .from('scrape_jobs')
    .insert([{ user_id: userId, handle_id: handleRow.id, platform, status: 'queued' }])
    .select()
    .single();
  if (jobErr) return json({ error: 'job_create_failed', detail: jobErr.message }, 500);

  const apifyToken = Deno.env.get('APIFY_TOKEN');
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  const webhookUrl = `${baseUrl}/functions/apify-webhook?job_id=${jobRow.id}`;

  const actorInput = platform === 'instagram'
    ? { username: [handle], resultsLimit: 50 }
    : { profiles: [handle], resultsPerPage: 50, shouldDownloadVideos: false };

  // Apify ad-hoc webhooks must be a base64-encoded JSON array passed as the
  // `webhooks` QUERY param — NOT inside the actor input body.
  const webhooksParam = btoa(JSON.stringify([{
    eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'],
    requestUrl: webhookUrl,
  }]));

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTORS[platform]}/runs?token=${apifyToken}&webhooks=${encodeURIComponent(webhooksParam)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    },
  );

  if (!runRes.ok) {
    await admin.database.from('scrape_jobs')
      .update({ status: 'failed', error: `apify_${runRes.status}`, finished_at: new Date().toISOString() })
      .eq('id', jobRow.id);
    return json({ error: 'apify_start_failed' }, 502);
  }

  const runJson = await runRes.json();
  const apifyRunId = runJson?.data?.id;

  await admin.database.from('scrape_jobs')
    .update({ apify_run_id: apifyRunId, status: 'running' })
    .eq('id', jobRow.id);

  return json({ job_id: jobRow.id, apify_run_id: apifyRunId }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
