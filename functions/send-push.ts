import { createAdminClient } from 'npm:@insforge/sdk';

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const internalKey = req.headers.get('x-internal-key');
  if (internalKey !== Deno.env.get('INTERNAL_FN_KEY')) return json({ error: 'forbidden' }, 403);

  let body: { user_id?: string; phrase_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { user_id, phrase_id } = body;
  if (!user_id || !phrase_id) return json({ error: 'invalid_input' }, 400);

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const { data: user } = await admin.database
    .from('users')
    .select('push_token, locale')
    .eq('id', user_id)
    .maybeSingle();

  if (!user?.push_token) {
    await admin.database.from('deliveries').insert([{ phrase_id, user_id, channel: 'in_app' }]);
    return json({ ok: true, skipped: 'no_push_token' }, 200);
  }

  const { data: phrase } = await admin.database
    .from('phrases')
    .select('text, audio_url')
    .eq('id', phrase_id)
    .maybeSingle();
  if (!phrase) return json({ error: 'phrase_not_found' }, 404);

  // Expo push payload — Apple-side fields:
  //   sound        → bundled chime (.caf), plays on arrival
  //   mutableContent → flips APNs `mutable-content: 1`, wakes the NSE
  //   _contentAvailable → also wakes app in background
  // NSE downloads audio_url, attaches as audio, user long-presses banner to play.
  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify({
      to: user.push_token,
      title: 'Today’s Vibe',
      body: phrase.text,
      sound: 'vaibe-chime.caf',
      mutableContent: true,
      _contentAvailable: true,
      data: {
        phrase_id,
        audio_url: phrase.audio_url ?? null,
      },
    }),
  });

  const expoJson = await expoRes.json().catch(() => null);

  await admin.database.from('deliveries').insert([{
    phrase_id,
    user_id,
    channel: 'push',
  }]);

  return json({ ok: true, expo: expoJson, has_audio: !!phrase.audio_url }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
