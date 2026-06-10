// Cron-fired daily phrase pipeline. Runs every 5 minutes.
//
// IMPORTANT: All steps (generate → synthesize → push) are INLINED here.
// Edge functions in this project share one deployment, and the platform
// rejects function→function HTTP calls with "508 Loop Detected". Do NOT
// refactor this back into fetch() calls to sibling functions.

import { createAdminClient } from 'npm:@insforge/sdk';

// Allowed daily delivery window in each user's local TZ.
const WINDOW_START = 9;   // 09:00 local
const WINDOW_END = 21;    // 21:00 local
const TICK_MIN = 5;       // cron `*/5 * * * *`

const LLM_MODEL = 'anthropic/claude-haiku-4.5';
const TTS_MODEL = 'eleven_multilingual_v2';
const BUCKET = 'phrase-audio';

const FREQ_TARGET: Record<string, number> = {
  once: 1,
  twice: 2,
  thrice: 3,
  on_demand: 0,
};

// Custom ElevenLabs voices — must stay in sync with src/lib/voices.ts.
const ALLOWED_VOICES = new Set([
  '9rvdnhrYoXoUt4igKpBw', // Mariana
  '86V9x9hrQds83qf7zaGn', // Marcela (Colombian)
  '8mBRP99B2Ng2QwsJMFQl', // Antonio
]);

const LANGUAGE_DEFAULT_VOICE: Record<string, string> = {
  en: '9rvdnhrYoXoUt4igKpBw',
  es: '86V9x9hrQds83qf7zaGn',
  fr: '9rvdnhrYoXoUt4igKpBw',
  pt: '9rvdnhrYoXoUt4igKpBw',
  de: '9rvdnhrYoXoUt4igKpBw',
  it: '9rvdnhrYoXoUt4igKpBw',
  ja: '9rvdnhrYoXoUt4igKpBw',
};

export default async function (req: Request): Promise<Response> {
  const internalKey = req.headers.get('x-internal-key');
  if (internalKey !== Deno.env.get('INTERNAL_FN_KEY')) {
    return new Response('forbidden', { status: 403 });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const { data: prefs } = await admin.database
    .from('preferences')
    .select('user_id, frequency, notifications_enabled, timezone, today_schedule')
    .eq('notifications_enabled', true);

  // Join in subscription_tier for each user we're about to evaluate.
  const userIds = (prefs ?? []).map((p: any) => p.user_id);
  const tierByUser = new Map<string, 'free' | 'pro'>();
  if (userIds.length) {
    const { data: us } = await admin.database
      .from('users')
      .select('id, subscription_tier')
      .in('id', userIds);
    for (const u of us ?? []) {
      tierByUser.set(u.id, u.subscription_tier === 'pro' ? 'pro' : 'free');
    }
  }

  const now = new Date();
  let evaluated = 0;
  let fired = 0;
  const errors: string[] = [];

  const tasks = (prefs ?? []).map(async (u: any) => {
    const tier = tierByUser.get(u.user_id) ?? 'free';
    // Free users always 1×/day regardless of their picked frequency.
    const requested = FREQ_TARGET[u.frequency] ?? 1;
    const target = tier === 'free' ? Math.min(requested, 1) : requested;
    if (target === 0) return;

    const tz = u.timezone || 'UTC';
    const localDate = localDateStr(now, tz);           // "YYYY-MM-DD"
    const localBucket = bucketInTz(now, tz);            // "HH:MM" rounded to 5

    // (Re)generate today's schedule if stale.
    let schedule = u.today_schedule as { date?: string; times?: string[] } | null;
    if (!schedule || schedule.date !== localDate || (schedule.times?.length ?? 0) !== target) {
      const times = pickRandomTimes(target);
      schedule = { date: localDate, times };
      await admin.database
        .from('preferences')
        .update({ today_schedule: schedule })
        .eq('user_id', u.user_id);
    }

    evaluated += 1;

    // Match current bucket against any scheduled time. Round both to 5-min buckets.
    const dueNow = (schedule.times ?? []).some((t) => bucketHHMM(t) === localBucket);
    if (!dueNow) return;

    // Idempotency — don't double-fire if already delivered in last 30 min.
    const cutoff = new Date(now.getTime() - 30 * 60_000).toISOString();
    const { data: recent } = await admin.database
      .from('deliveries')
      .select('id')
      .eq('user_id', u.user_id)
      .gte('delivered_at', cutoff)
      .limit(1);
    if (recent && recent.length > 0) return;

    try {
      await runPipeline(admin, u.user_id);
      fired += 1;
    } catch (e) {
      const msg = `${u.user_id}: ${String((e as Error)?.message ?? e)}`;
      console.error('[daily-generator]', msg);
      errors.push(msg);
    }
  });

  await Promise.allSettled(tasks);

  return new Response(JSON.stringify({ evaluated, fired, errors }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Pipeline: generate phrase → synthesize voice → push. All inline (see header).
// ---------------------------------------------------------------------------

async function runPipeline(admin: any, userId: string): Promise<void> {
  // 1. Profile + recent phrases for the prompt.
  const { data: profile } = await admin.database
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile) throw new Error('profile_not_ready');

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

  // 2. LLM call.
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openrouterKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 120,
    }),
  });
  if (!llmRes.ok) throw new Error(`llm_failed:${llmRes.status}`);
  const llmData = await llmRes.json();
  const text = (llmData?.choices?.[0]?.message?.content ?? '').trim().replace(/^["']|["']$/g, '');
  if (!text) throw new Error('empty_phrase');

  // 3. Insert phrase row.
  const promptHash = await sha256(prompt);
  const { data: inserted, error: insErr } = await admin.database
    .from('phrases')
    .insert([{
      user_id: userId,
      text,
      theme: (profile.themes ?? [])[0] ?? null,
      language: profile.language ?? 'en',
      model: LLM_MODEL,
      prompt_hash: promptHash,
    }])
    .select()
    .single();
  if (insErr) throw new Error(`phrase_save_failed:${insErr.message}`);

  // 4. Synthesize voice (best effort — push goes out with or without audio).
  let audioUrl: string | null = null;
  try {
    audioUrl = await synthesize(admin, userId, inserted.id, text, profile);
  } catch (e) {
    console.error('[daily-generator] synth failed', userId, e);
  }

  // 5. Push.
  await sendPush(admin, userId, inserted.id, text, audioUrl);
}

async function synthesize(
  admin: any,
  userId: string,
  phraseId: string,
  text: string,
  profile: any,
): Promise<string | null> {
  const elevenKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!elevenKey) return null;

  const envFallbackVoice = Deno.env.get('ELEVENLABS_VOICE_ID') ?? null;
  const preferred = profile?.preferred_voice_id ?? null;
  const lang = (profile?.language ?? 'en').toLowerCase();
  const voiceId = (preferred && ALLOWED_VOICES.has(preferred))
    ? preferred
    : (LANGUAGE_DEFAULT_VOICE[lang] ?? envFallbackVoice ?? '9rvdnhrYoXoUt4igKpBw');

  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3 },
    }),
  });
  if (!ttsRes.ok) throw new Error(`elevenlabs_failed:${ttsRes.status}`);
  const audioBytes = new Uint8Array(await ttsRes.arrayBuffer());

  const key = `${userId}/${phraseId}-${voiceId}.mp3`;
  const upRes = await admin.storage
    .from(BUCKET)
    .upload(key, new Blob([audioBytes], { type: 'audio/mpeg' }), { upsert: true });
  if (upRes.error) throw new Error(`storage_upload_failed:${upRes.error.message}`);

  const url = (upRes as any).data?.url ?? (upRes as any).url ?? null;
  const storedKey = (upRes as any).data?.key ?? (upRes as any).key ?? key;

  await admin.database
    .from('phrases')
    .update({ audio_url: url, audio_key: storedKey, audio_voice_id: voiceId })
    .eq('id', phraseId);

  return url;
}

async function sendPush(
  admin: any,
  userId: string,
  phraseId: string,
  text: string,
  audioUrl: string | null,
): Promise<void> {
  const { data: user } = await admin.database
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle();

  if (!user?.push_token) {
    await admin.database.from('deliveries').insert([{ phrase_id: phraseId, user_id: userId, channel: 'in_app' }]);
    return;
  }

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: user.push_token,
      title: 'Today’s Vibe',
      body: text,
      sound: 'vaibe-chime.caf',
      mutableContent: true,
      _contentAvailable: true,
      data: { phrase_id: phraseId, audio_url: audioUrl },
    }),
  });

  await admin.database.from('deliveries').insert([{
    phrase_id: phraseId,
    user_id: userId,
    channel: 'push',
  }]);
}

// ---------------------------------------------------------------------------
// Scheduling helpers
// ---------------------------------------------------------------------------

// Split the 09:00–21:00 window into N equal sub-windows. Pick one random
// 5-minute bucket inside each. Guarantees spread + uniqueness across the day.
function pickRandomTimes(n: number): string[] {
  if (n <= 0) return [];
  const windowMinutes = (WINDOW_END - WINDOW_START) * 60;
  const slotSize = Math.floor(windowMinutes / n);
  const times: string[] = [];
  for (let i = 0; i < n; i++) {
    const slotStart = i * slotSize;
    const slotEnd = i === n - 1 ? windowMinutes - 1 : slotStart + slotSize - 1;
    const startBucket = Math.ceil(slotStart / TICK_MIN);
    const endBucket = Math.floor(slotEnd / TICK_MIN);
    const bucketIdx = startBucket + Math.floor(Math.random() * (endBucket - startBucket + 1));
    const minsFromWindowStart = bucketIdx * TICK_MIN;
    const totalMin = WINDOW_START * 60 + minsFromWindowStart;
    const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const mm = (totalMin % 60).toString().padStart(2, '0');
    times.push(`${hh}:${mm}`);
  }
  return times;
}

function bucketInTz(date: Date, timeZone: string): string {
  const { hour, minute } = tzParts(date, timeZone);
  return `${hour}:${bucketMM(minute)}`;
}

function bucketHHMM(hhmm: string): string {
  const [hh, mm] = hhmm.split(':');
  return `${hh}:${bucketMM(mm ?? '00')}`;
}

function bucketMM(mm: string): string {
  return (Math.floor(parseInt(mm, 10) / TICK_MIN) * TICK_MIN).toString().padStart(2, '0');
}

function localDateStr(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function tzParts(date: Date, timeZone: string): { hour: string; minute: string } {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    return {
      hour: parts.find((p) => p.type === 'hour')?.value ?? '00',
      minute: parts.find((p) => p.type === 'minute')?.value ?? '00',
    };
  } catch {
    return {
      hour: date.getUTCHours().toString().padStart(2, '0'),
      minute: date.getUTCMinutes().toString().padStart(2, '0'),
    };
  }
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
