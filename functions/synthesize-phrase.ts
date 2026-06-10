// Turn a phrase into voice via ElevenLabs. Caches the mp3 in InsForge Storage
// so replays cost nothing. Caps fresh TTS calls per day to protect margin.
//
// Required secret: ELEVENLABS_API_KEY
// Optional:        ELEVENLABS_VOICE_ID  (defaults to "Rachel" — multilingual v2)

import { createAdminClient } from 'npm:@insforge/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MODEL = 'eleven_multilingual_v2';
const BUCKET = 'phrase-audio';
// Fresh TTS cap per tier — cached replays free. Internal (cron) bypasses.
// Free user only gets the daily push (internal); user-initiated re-synth = 0.
const TTS_CAPS = { free: 0, pro: 10 } as const;

// Custom ElevenLabs voices — must stay in sync with src/lib/voices.ts.
const ALLOWED_VOICES = new Set([
  '9rvdnhrYoXoUt4igKpBw', // Mariana
  '86V9x9hrQds83qf7zaGn', // Marcela (Colombian)
  '8mBRP99B2Ng2QwsJMFQl', // Antonio
]);

const LANGUAGE_DEFAULT_VOICE: Record<string, string> = {
  en: '9rvdnhrYoXoUt4igKpBw', // Mariana
  es: '86V9x9hrQds83qf7zaGn', // Marcela (Colombian)
  fr: '9rvdnhrYoXoUt4igKpBw',
  pt: '9rvdnhrYoXoUt4igKpBw',
  de: '9rvdnhrYoXoUt4igKpBw',
  it: '9rvdnhrYoXoUt4igKpBw',
  ja: '9rvdnhrYoXoUt4igKpBw',
};

function resolveVoice(preferred: string | null, language: string | null, envFallback: string | null): string {
  if (preferred && ALLOWED_VOICES.has(preferred)) return preferred;
  const lang = (language ?? 'en').toLowerCase();
  return LANGUAGE_DEFAULT_VOICE[lang] ?? envFallback ?? '9rvdnhrYoXoUt4igKpBw';
}

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
    console.error('[synthesize-phrase] uncaught:', err);
    return json({ error: 'uncaught', detail: String((err as Error)?.message ?? err) }, 500);
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const internalKey = req.headers.get('x-internal-key');
  const isInternal = !!internalKey && internalKey === Deno.env.get('INTERNAL_FN_KEY');

  let body: { phrase_id?: string; user_id?: string };
  try { body = await req.clone().json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const phraseId = body.phrase_id;
  if (!phraseId) return json({ error: 'missing_phrase_id' }, 400);

  let userId: string | undefined;
  if (isInternal) {
    userId = body.user_id;
    if (!userId) return json({ error: 'missing_user_id' }, 400);
  } else {
    const userToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    userId = decodeJwt(userToken)?.sub as string | undefined;
    if (!userId) return json({ error: 'unauthorized' }, 401);
  }

  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!elevenKey) return json({ error: 'tts_not_configured', detail: 'ELEVENLABS_API_KEY secret missing' }, 503);
  const envFallbackVoice = Deno.env.get('ELEVENLABS_VOICE_ID') ?? null;

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  // Fetch phrase + verify ownership.
  const { data: phrase } = await admin.database
    .from('phrases')
    .select('id, user_id, text, language, audio_url, audio_key, audio_voice_id')
    .eq('id', phraseId)
    .maybeSingle();
  if (!phrase) return json({ error: 'phrase_not_found' }, 404);
  if (phrase.user_id !== userId) return json({ error: 'forbidden' }, 403);

  // Resolve voice: user override → language default → env default → Rachel.
  const { data: prof } = await admin.database
    .from('profiles')
    .select('preferred_voice_id')
    .eq('user_id', userId)
    .maybeSingle();
  const voiceId = resolveVoice(prof?.preferred_voice_id ?? null, phrase.language, envFallbackVoice);

  // Cache hit — return existing audio (free, no cap).
  if (phrase.audio_url && phrase.audio_voice_id === voiceId) {
    return json({ audio_url: phrase.audio_url, source: 'cache', voice_id: voiceId }, 200);
  }

  // Daily fresh-TTS cap (only counts gens that hit ElevenLabs).
  // Internal calls (cron-fired daily notifications) bypass the cap.
  if (!isInternal) {
    const { data: u } = await admin.database
      .from('users')
      .select('subscription_tier')
      .eq('id', userId)
      .maybeSingle();
    const tier: 'free' | 'pro' = (u?.subscription_tier === 'pro') ? 'pro' : 'free';
    const cap = TTS_CAPS[tier];
    if (cap === 0) {
      return json({ error: 'pro_required', message: 'Fresh voice synthesis is Pro-only.' }, 402);
    }
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: fresh } = await admin.database
      .from('phrases')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .gte('updated_at', since24h)
      .not('audio_url', 'is', null);
    const usedToday = Array.isArray(fresh) ? fresh.length : 0;
    if (usedToday >= cap) {
      return json({ error: 'tts_daily_cap', cap }, 429);
    }
  }

  // Call ElevenLabs
  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: phrase.text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
    }),
  });
  if (!ttsRes.ok) {
    const detail = await ttsRes.text().catch(() => '');
    return json({ error: 'elevenlabs_failed', status: ttsRes.status, detail: detail.slice(0, 300) }, 502);
  }
  const audioBytes = new Uint8Array(await ttsRes.arrayBuffer());

  // Upload to Storage
  const key = `${userId}/${phraseId}-${voiceId}.mp3`;
  const upRes = await admin.storage
    .from(BUCKET)
    .upload(key, new Blob([audioBytes], { type: 'audio/mpeg' }), { upsert: true });
  if (upRes.error) return json({ error: 'storage_upload_failed', detail: upRes.error.message }, 500);

  // Some SDK versions return { data: { url, key } }, others just { url, key } at top level.
  const url = (upRes as any).data?.url ?? (upRes as any).url ?? null;
  const storedKey = (upRes as any).data?.key ?? (upRes as any).key ?? key;

  await admin.database
    .from('phrases')
    .update({ audio_url: url, audio_key: storedKey, audio_voice_id: voiceId })
    .eq('id', phraseId);

  return json({ audio_url: url, source: 'fresh' }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
