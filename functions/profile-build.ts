import { createAdminClient } from 'npm:@insforge/sdk';

const MODEL = 'anthropic/claude-sonnet-4.5';

export default async function (req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[profile-build] uncaught:', err);
    return json({ error: 'uncaught', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const internalKey = req.headers.get('x-internal-key');
  if (internalKey !== Deno.env.get('INTERNAL_FN_KEY')) return json({ error: 'forbidden' }, 403);

  let body: { user_id?: string; posts?: any[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { user_id, posts } = body;
  if (!user_id || !Array.isArray(posts) || posts.length === 0) {
    return json({ error: 'invalid_input' }, 400);
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const captions = posts.map((p, i) => `[${i + 1}] ${p.caption ?? ''}`).slice(0, 50).join('\n');
  const allTags = posts.flatMap((p) => p.hashtags ?? []);
  const topTags = topN(allTags, 30);

  let profile = await buildWithLLM(captions, topTags);
  let source: 'llm' | 'fallback' = 'llm';
  if (!profile) {
    profile = buildFallback(topTags, captions);
    source = 'fallback';
  }

  const { error: upErr } = await admin.database.from('profiles').upsert([{
    user_id,
    interests: profile.interests ?? [],
    mood_baseline: profile.mood_baseline ?? 'calm',
    language: profile.language ?? 'en',
    tone_preference: profile.tone_preference ?? 'warm',
    themes: profile.themes ?? [],
    raw_signals: { topTags, sampleCount: posts.length, source },
    updated_at: new Date().toISOString(),
  }], { onConflict: 'user_id' });
  if (upErr) return json({ error: 'upsert_failed', detail: upErr.message }, 500);

  return json({ ok: true, user_id, source }, 200);
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
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 600,
      }),
    });
    if (!res.ok) {
      console.error('[profile-build] llm http', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';
    return extractJson(raw);
  } catch (e) {
    console.error('[profile-build] llm threw', e);
    return null;
  }
}

// Robust JSON extraction: strip fences, find first {...} block, parse.
function extractJson(raw: string): any | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(cleaned); } catch { /* try below */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fallthrough */ } }
  return null;
}

// Deterministic fallback so the user is NEVER stuck if the LLM is broken.
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
    : moodBaseline === 'introspective' ? 'poetic'
    : moodBaseline === 'playful' ? 'warm' : 'warm';

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
  // Very light heuristic — Spanish stop-words vs everything else as English.
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
    headers: { 'Content-Type': 'application/json' },
  });
}
