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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const userToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const userId = decodeJwt(userToken)?.sub as string | undefined;
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const { data: user } = await admin.database
    .from('users')
    .select('push_token')
    .eq('id', userId)
    .maybeSingle();

  if (!user?.push_token) return json({ error: 'no_push_token', hint: 'open the app on a real device first' }, 404);

  const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: user.push_token,
      title: 'Test Vibe ✨',
      body: 'Your notifications are working. Daily phrases will land right here.',
      sound: 'default',
    }),
  });
  const expo = await expoRes.json().catch(() => null);

  return json({ ok: true, expo }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
