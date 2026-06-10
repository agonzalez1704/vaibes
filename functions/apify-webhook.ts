import { createAdminClient } from 'npm:@insforge/sdk';

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const url = new URL(req.url);
  const jobId = url.searchParams.get('job_id');
  if (!jobId) return new Response('missing_job_id', { status: 400 });

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  let payload: {
    eventType?: string;
    resource?: { id?: string; status?: string; defaultDatasetId?: string };
  };
  try {
    payload = await req.json();
  } catch {
    return new Response('invalid_json', { status: 400 });
  }

  const status = payload?.resource?.status;
  const datasetId = payload?.resource?.defaultDatasetId;

  if (status !== 'SUCCEEDED' || !datasetId) {
    await admin.database.from('scrape_jobs')
      .update({
        status: 'failed',
        error: `apify_${payload?.eventType ?? 'unknown'}`,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId);
    return new Response('ok', { status: 200 });
  }

  const apifyToken = Deno.env.get('APIFY_TOKEN');
  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apifyToken}&format=json&clean=true&limit=50`,
  );
  if (!itemsRes.ok) {
    await admin.database.from('scrape_jobs')
      .update({ status: 'failed', error: `dataset_fetch_${itemsRes.status}`, finished_at: new Date().toISOString() })
      .eq('id', jobId);
    return new Response('ok', { status: 200 });
  }
  const items: any[] = await itemsRes.json();

  const minimal = items.map((it) => ({
    caption: it.caption ?? it.text ?? it.desc ?? null,
    hashtags: it.hashtags ?? extractHashtags(it.caption ?? it.text ?? ''),
    timestamp: it.timestamp ?? it.createTimeISO ?? null,
    likes: it.likesCount ?? it.diggCount ?? null,
    type: it.type ?? null,
  })).filter((p) => p.caption);

  const { data: job } = await admin.database
    .from('scrape_jobs')
    .select('user_id, handle_id')
    .eq('id', jobId)
    .single();

  await admin.database.from('scrape_jobs')
    .update({
      status: 'succeeded',
      posts_count: minimal.length,
      finished_at: new Date().toISOString(),
      result_url: `apify://dataset/${datasetId}`,
    })
    .eq('id', jobId);

  if (job?.handle_id) {
    const newStatus = minimal.length === 0 ? 'private' : 'ok';
    await admin.database.from('social_handles')
      .update({ status: newStatus, last_scraped_at: new Date().toISOString() })
      .eq('id', job.handle_id);
  }

  if (job?.user_id && minimal.length > 0) {
    const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
    // Await — edge isolate is torn down after the response, so fire-and-forget
    // would be killed before profile-build runs.
    try {
      const pbRes = await fetch(`${baseUrl}/functions/profile-build`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': Deno.env.get('INTERNAL_FN_KEY') ?? '',
        },
        body: JSON.stringify({ user_id: job.user_id, posts: minimal }),
      });
      if (!pbRes.ok) console.error('[apify-webhook] profile-build failed', pbRes.status, await pbRes.text());
    } catch (e) {
      console.error('[apify-webhook] profile-build threw', e);
    }
  }

  return new Response('ok', { status: 200 });
}

function extractHashtags(text: string): string[] {
  return Array.from(text.matchAll(/#(\w+)/g)).map((m) => m[1]);
}
