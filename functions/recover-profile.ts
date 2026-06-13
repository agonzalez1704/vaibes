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

  // Build INLINE — sibling function fetches fail with 508 Loop Detected.
  try {
    await buildAndSaveProfile(admin, userId, posts);
  } catch (e) {
    return json({ error: 'profile_build_failed', detail: String((e as Error)?.message ?? e) }, 502);
  }

  return json({ ok: true, status: 'rebuilt', posts: posts.length }, 200);
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
      console.error('[recover-profile] llm http', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return extractJson(data?.choices?.[0]?.message?.content ?? '');
  } catch (e) {
    console.error('[recover-profile] llm threw', e);
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

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
