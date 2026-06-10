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

type Pick = { key: string; label: string; weight: number };
type Answer = { page: string; picks: Pick[] };

export default async function (req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (err) {
    console.error('[submit-quiz] uncaught:', err);
    return json({ error: 'uncaught', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!userToken) return json({ error: 'unauthorized' }, 401);
  const claims = decodeJwt(userToken);
  const userId = claims?.sub as string | undefined;
  const userEmail = (claims?.email as string | undefined) ?? null;
  if (!userId) return json({ error: 'unauthorized', detail: 'no_sub_claim' }, 401);

  let body: { answers?: Answer[]; timezone?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const answers = body.answers ?? [];
  const timezone = body.timezone || 'UTC';
  const ALLOWED_LANGS = ['en', 'es', 'fr', 'pt', 'de', 'it', 'ja'];
  const language = ALLOWED_LANGS.includes(body.language ?? '') ? body.language! : 'en';
  if (!answers.length) return json({ error: 'no_answers' }, 400);

  const byPage = (id: string) => answers.find((a) => a.page === id)?.picks ?? [];
  const sortByWeight = (p: Pick[]) => [...p].sort((a, b) => b.weight - a.weight);

  const interests = sortByWeight(byPage('interests')).map((p) => p.label);
  const moodPicks = sortByWeight(byPage('mood'));
  const tonePicks = sortByWeight(byPage('tone'));

  const moodBaseline = moodPicks[0]?.key ?? 'calm';
  const tonePreference = tonePicks[0]?.key ?? 'warm';

  // Themes = top interests + dominant mood, deterministic (no LLM needed for fallback)
  const themes = [
    ...sortByWeight(byPage('interests')).slice(0, 5).map((p) => p.label.toLowerCase()),
    moodBaseline,
  ];

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const { error: userErr } = await admin.database
    .from('users')
    .upsert([{ id: userId, email: userEmail }], { onConflict: 'id' });
  if (userErr) return json({ error: 'user_upsert_failed', detail: userErr.message }, 500);

  const { error: profErr } = await admin.database.from('profiles').upsert([{
    user_id: userId,
    interests,
    mood_baseline: moodBaseline,
    language,
    tone_preference: tonePreference,
    themes,
    raw_signals: { source: 'quiz', answers },
    updated_at: new Date().toISOString(),
  }], { onConflict: 'user_id' });
  if (profErr) return json({ error: 'profile_upsert_failed', detail: profErr.message }, 500);

  await admin.database.from('preferences').upsert([{
    user_id: userId,
    frequency: 'once',
    send_times: ['08:00'],
    timezone,
    notifications_enabled: true,
  }], { onConflict: 'user_id' });

  return json({ ok: true, interests_count: interests.length }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
