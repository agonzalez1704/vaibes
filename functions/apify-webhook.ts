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

  // Private/blocked accounts: the scraper run SUCCEEDS but the dataset is empty
  // or carries an explicit error marker per item (e.g. "Profile is private").
  const hadError = items.some((it) => it?.error || it?.errorDescription);

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

  // No readable public posts → private account, media-only, or blocked.
  // Surface a distinct error code so the client can offer the quiz fallback
  // instead of spinning on the recover-profile loop (there's nothing to build).
  if (minimal.length === 0 || hadError) {
    await admin.database.from('scrape_jobs')
      .update({
        status: 'failed',
        error: 'private_or_empty',
        posts_count: 0,
        finished_at: new Date().toISOString(),
        result_url: `apify://dataset/${datasetId}`,
      })
      .eq('id', jobId);
    if (job?.handle_id) {
      await admin.database.from('social_handles')
        .update({ status: 'private', last_scraped_at: new Date().toISOString() })
        .eq('id', job.handle_id);
    }
    return new Response('ok', { status: 200 });
  }

  await admin.database.from('scrape_jobs')
    .update({
      status: 'succeeded',
      posts_count: minimal.length,
      finished_at: new Date().toISOString(),
      result_url: `apify://dataset/${datasetId}`,
    })
    .eq('id', jobId);

  if (job?.handle_id) {
    await admin.database.from('social_handles')
      .update({ status: 'ok', last_scraped_at: new Date().toISOString() })
      .eq('id', job.handle_id);
  }

  // Build the profile INLINE. Sibling function fetches fail with 508 Loop
  // Detected (same deployment), so we cannot call profile-build over HTTP.
  if (job?.user_id && minimal.length > 0) {
    try {
      await buildAndSaveProfile(admin, job.user_id, minimal);
    } catch (e) {
      console.error('[apify-webhook] profile build threw', e);
    }
  }

  return new Response('ok', { status: 200 });
}

function extractHashtags(text: string): string[] {
  return Array.from(text.matchAll(/#(\w+)/g)).map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// Inlined profile build (mirror of functions/profile-build.ts). Kept in sync
// manually because edge functions can't import each other and can't HTTP-call
// siblings (508 Loop Detected).
// ---------------------------------------------------------------------------

const PROFILE_MODEL = 'anthropic/claude-sonnet-4.5';

async function buildAndSaveProfile(admin: any, userId: string, posts: any[]): Promise<void> {
  const captions = posts.map((p, i) => `[${i + 1}] ${p.caption ?? ''}`).slice(0, 50).join('\n');
  const allTags = posts.flatMap((p) => p.hashtags ?? []);
  const topTags = topN(allTags, 30);

  let profile = await buildWithLLM(captions, topTags);
  let source: 'llm' | 'fallback' = 'llm';
  if (!profile) {
    profile = buildFallback(topTags, captions);
    source = 'fallback';
  }

  await admin.database.from('profiles').upsert([{
    user_id: userId,
    interests: profile.interests ?? [],
    mood_baseline: profile.mood_baseline ?? 'calm',
    language: profile.language ?? 'en',
    tone_preference: profile.tone_preference ?? 'warm',
    themes: profile.themes ?? [],
    raw_signals: { topTags, sampleCount: posts.length, source },
    updated_at: new Date().toISOString(),
  }], { onConflict: 'user_id' });
}

async function buildWithLLM(captions: string, topTags: string[]): Promise<any | null> {
  const prompt = `Analyze these social media posts and return a JSON profile.

Posts (captions):
${captions}

Top hashtags: ${topTags.join(', ')}

Return ONLY valid JSON with this exact shape:
{
  "interests": [string, ...max 12],
  "mood_baseline": "introspective" | "energetic" | "calm" | "intense" | "playful" | "stoic",
  "language": "<ISO 639-1 code>",
  "tone_preference": "minimal" | "poetic" | "direct" | "warm",
  "themes": [string, ...max 8]
}

No prose, no markdown fences. JSON only.`;

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openrouterKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PROFILE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    if (!res.ok) {
      console.error('[apify-webhook] llm http', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return extractJson(data?.choices?.[0]?.message?.content ?? '');
  } catch (e) {
    console.error('[apify-webhook] llm threw', e);
    return null;
  }
}

function extractJson(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try below */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fallthrough */ } }
  return null;
}

function buildFallback(topTags: string[], captions: string): any {
  const interests = topTags.slice(0, 10).map(humanize);
  const text = captions.toLowerCase();

  const moodScores: Record<string, number> = {
    energetic: hits(text, ['workout', 'gym', 'run', 'energy', 'hype', 'party', 'travel']),
    calm: hits(text, ['calm', 'peace', 'quiet', 'morning', 'tea', 'walk', 'nature', 'breathe']),
    introspective: hits(text, ['think', 'reflect', 'reading', 'journal', 'wonder', 'remember']),
    playful: hits(text, ['lol', 'fun', 'haha', '😂', '🤣', 'game', 'play']),
    stoic: hits(text, ['discipline', 'work', 'focus', 'grind', 'build', 'ship']),
    intense: hits(text, ['fire', 'beast', 'never', 'crush', 'goals']),
  };
  const moodBaseline = Object.entries(moodScores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'calm';

  const language = guessLanguage(text);
  const tone = moodBaseline === 'stoic' || moodBaseline === 'intense' ? 'direct'
    : moodBaseline === 'introspective' ? 'poetic' : 'warm';

  return {
    interests,
    mood_baseline: moodBaseline,
    language,
    tone_preference: tone,
    themes: interests.slice(0, 5).concat([moodBaseline]),
  };
}

function hits(text: string, words: string[]): number {
  return words.reduce((n, w) => n + (text.split(w).length - 1), 0);
}

function humanize(tag: string): string {
  return tag.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessLanguage(text: string): string {
  if (/\b(que|para|con|pero|cuando|porque|gracias|así|también|estoy)\b/.test(text)) return 'es';
  if (/\b(et|le|la|les|une|pour|avec|mais|parce|merci)\b/.test(text)) return 'fr';
  if (/\b(und|der|die|das|ich|nicht|mit|aber|wenn|danke)\b/.test(text)) return 'de';
  if (/\b(que|para|com|mas|porque|obrigado|também|aqui)\b/.test(text)) return 'pt';
  return 'en';
}

function topN(arr: string[], n: number): string[] {
  const counts = new Map<string, number>();
  for (const t of arr) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
