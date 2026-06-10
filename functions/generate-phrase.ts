import { createAdminClient } from 'npm:@insforge/sdk';

const MODEL = 'anthropic/claude-haiku-4.5';

// Daily on-demand caps. Cron-driven internal calls bypass these so the
// scheduled daily phrase ALWAYS lands.
// Tier-aware: pro gets the higher caps, free hits a paywall after their daily.
const CAPS = {
  free: { soft: 0, hard: 0 },     // 0 on-demand for free — only the daily push
  pro:  { soft: 10, hard: 30 },
};
const THROTTLE_SECONDS = 30; // min gap between user-initiated generations

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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-key',
};

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const internalKey = req.headers.get('x-internal-key');
  const authHeader = req.headers.get('Authorization') ?? '';
  const userToken = authHeader.replace(/^Bearer\s+/i, '');

  let userId: string | null = null;
  let isInternal = false;

  if (internalKey && internalKey === Deno.env.get('INTERNAL_FN_KEY')) {
    isInternal = true;
    try {
      const body = await req.clone().json();
      userId = body?.user_id ?? null;
    } catch { /* ignore */ }
  } else if (userToken) {
    const claims = decodeJwt(userToken);
    userId = (claims?.sub as string | undefined) ?? null;
  }

  if (!userId) return json({ error: 'unauthorized' }, 401);

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  // Daily cap + repeat-press throttle — only on user-initiated calls.
  if (!isInternal) {
    const { data: u } = await admin.database
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .maybeSingle();
    const tier: 'free' | 'pro' = (u?.subscription_tier === 'pro') ? 'pro' : 'free';
    const caps = CAPS[tier];

    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: dayList } = await admin.database
      .from('phrases')
      .select('generated_at')
      .eq('user_id', userId)
      .gte('generated_at', since24h)
      .order('generated_at', { ascending: false });

    const todayCount = dayList?.length ?? 0;
    if (tier === 'free' && todayCount >= caps.hard) {
      return json({ error: 'pro_required', message: 'On-demand vibes are a Pro feature.' }, 402);
    }
    if (todayCount >= caps.hard) {
      return json({ error: 'daily_cap_reached', cap: caps.hard, retry_after: 'tomorrow' }, 429);
    }
    if (todayCount >= caps.soft) {
      return json({
        error: 'daily_soft_cap', cap: caps.soft, count: todayCount,
        message: `You've used ${todayCount} vibes today. Save some for tomorrow.`,
      }, 429);
    }
    const lastAt = dayList?.[0]?.generated_at ? new Date(dayList[0].generated_at).getTime() : 0;
    const since = (Date.now() - lastAt) / 1000;
    if (since < THROTTLE_SECONDS) {
      return json({
        error: 'too_soon',
        retry_after_seconds: Math.ceil(THROTTLE_SECONDS - since),
      }, 429);
    }
  }

  const { data: profile } = await admin.database
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profile) return json({ error: 'profile_not_ready' }, 404);

  const { data: recent } = await admin.database
    .from('phrases')
    .select('text')
    .eq('user_id', userId)
    .order('generated_at', { ascending: false })
    .limit(7);

  const recentTexts = (recent ?? []).map((r: any) => r.text).join('\n- ');

  const themes = (profile.themes ?? []).join(', ');
  const interests = (profile.interests ?? []).slice(0, 6).join(', ');

  const prompt = `Generate ONE motivational phrase for a daily mindfulness app.

User profile:
- Language: ${profile.language ?? 'en'}
- Tone: ${profile.tone_preference ?? 'warm'}
- Mood baseline: ${profile.mood_baseline ?? 'calm'}
- Themes: ${themes || 'self-growth'}
- Interests: ${interests || 'mindfulness'}

Recent phrases to AVOID repeating:
- ${recentTexts || '(none yet)'}

Rules:
- Output in language code: ${profile.language ?? 'en'}.
- 12–22 words.
- No clichés ("Live, laugh, love" / "Believe in yourself").
- Speak to the user directly (second person).
- Match the tone: ${profile.tone_preference ?? 'warm'}.

Return ONLY the phrase text. No quotes, no prefix, no explanation.`;

  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 120,
    }),
  });

  if (!res.ok) return json({ error: 'llm_failed', status: res.status }, 502);
  const data = await res.json();
  const text = (data?.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
  if (!text) return json({ error: 'empty_phrase' }, 502);

  const promptHash = await sha256(prompt);
  const { data: inserted, error: insErr } = await admin.database
    .from('phrases')
    .insert([{
      user_id: userId,
      text,
      theme: (profile.themes ?? [])[0] ?? null,
      language: profile.language ?? 'en',
      model: MODEL,
      prompt_hash: promptHash,
    }])
    .select()
    .single();
  if (insErr) return json({ error: 'phrase_save_failed', detail: insErr.message }, 500);

  // NOTE: the cron path no longer routes through this function. Sibling
  // function fetches fail with "508 Loop Detected" (same deployment), so the
  // scheduled pipeline lives fully inlined in daily-generator.ts.
  await admin.database.from('deliveries').insert([{
    phrase_id: inserted.id,
    user_id: userId,
    channel: isInternal ? 'push' : 'in_app',
  }]);

  return json({ phrase: inserted }, 200);
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
