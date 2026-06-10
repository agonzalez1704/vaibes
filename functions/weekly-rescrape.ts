import { createAdminClient } from 'npm:@insforge/sdk';

const APIFY_ACTORS: Record<string, string> = {
  instagram: 'apify~instagram-post-scraper',
  tiktok: 'clockworks~tiktok-scraper',
};

const STALE_DAYS = 6;
const ACTIVE_DAYS = 14;     // only re-scrape users who opened app in this window
const POSTS_PER_RESCRAPE = 25; // half the onboarding scrape — cheap refresh

export default async function (req: Request): Promise<Response> {
  if (req.headers.get('x-internal-key') !== Deno.env.get('INTERNAL_FN_KEY')) {
    return new Response('forbidden', { status: 403 });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const apifyToken = Deno.env.get('APIFY_TOKEN');
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();

  // Only handles that have succeeded at least once (status ok) and are stale.
  // Skip pending/running (in-flight) and never-ok handles.
  const { data: handles, error } = await admin.database
    .from('social_handles')
    .select('id, user_id, platform, handle, last_scraped_at, status')
    .eq('status', 'ok')
    .or(`last_scraped_at.is.null,last_scraped_at.lt.${staleCutoff}`);

  if (error) return json({ error: 'query_failed', detail: error.message }, 500);

  // Active gate — only refresh users who opened the app in the last N days.
  // Saves Apify $$ on inactive users; their old profile still works for them.
  const activeCutoff = new Date(Date.now() - ACTIVE_DAYS * 86400_000).toISOString();
  const userIds = [...new Set((handles ?? []).map((h: any) => h.user_id))];
  let activeSet = new Set<string>();
  if (userIds.length) {
    const { data: activeUsers } = await admin.database
      .from('users')
      .select('id')
      .in('id', userIds)
      .gte('last_seen_at', activeCutoff);
    activeSet = new Set((activeUsers ?? []).map((u: any) => u.id));
  }
  const skippedInactive = (handles ?? []).filter((h: any) => !activeSet.has(h.user_id)).length;
  const targets = (handles ?? []).filter((h: any) => activeSet.has(h.user_id));
  let started = 0;

  const results = await Promise.allSettled(targets.map(async (h: any) => {
    const { data: jobRow, error: jobErr } = await admin.database
      .from('scrape_jobs')
      .insert([{ user_id: h.user_id, handle_id: h.id, platform: h.platform, status: 'queued' }])
      .select()
      .single();
    if (jobErr || !jobRow) throw new Error(jobErr?.message ?? 'job_insert_failed');

    const webhookUrl = `${baseUrl}/functions/apify-webhook?job_id=${jobRow.id}`;
    const webhooksParam = btoa(JSON.stringify([{
      eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED', 'ACTOR.RUN.TIMED_OUT'],
      requestUrl: webhookUrl,
    }]));
    const actorInput = h.platform === 'instagram'
      ? { username: [h.handle], resultsLimit: POSTS_PER_RESCRAPE }
      : { profiles: [h.handle], resultsPerPage: POSTS_PER_RESCRAPE, shouldDownloadVideos: false };

    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${APIFY_ACTORS[h.platform]}/runs?token=${apifyToken}&webhooks=${encodeURIComponent(webhooksParam)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(actorInput) },
    );
    if (!runRes.ok) {
      await admin.database.from('scrape_jobs')
        .update({ status: 'failed', error: `apify_${runRes.status}`, finished_at: new Date().toISOString() })
        .eq('id', jobRow.id);
      throw new Error(`apify_${runRes.status}`);
    }
    const runJson = await runRes.json();
    await admin.database.from('scrape_jobs')
      .update({ apify_run_id: runJson?.data?.id, status: 'running' })
      .eq('id', jobRow.id);
    started += 1;
  }));

  const failed = results.filter((r) => r.status === 'rejected').length;
  return json({
    stale_candidates: (handles ?? []).length,
    skipped_inactive: skippedInactive,
    started,
    failed,
  }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
}
