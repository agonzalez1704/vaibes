// Mints a short-lived Clerk sign-in ticket for the App Review demo account, so
// reviewers can enter the full Pro experience with one tap — no credentials,
// no email code, no dependency on Clerk identifier settings.
//
// Safe by design: it ONLY ever signs into the fixed pre-seeded demo user, which
// holds no real personal data.

const DEMO_USER_ID = 'user_3FHJT8V1t39NePYQqlZdVTStY5K';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const clerkSecret = Deno.env.get('CLERK_SECRET_KEY');
  if (!clerkSecret) return json({ error: 'not_configured' }, 503);

  try {
    const res = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clerkSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: DEMO_USER_ID }),
    });
    const data = await res.json();
    if (!res.ok || !data?.token) {
      return json({ error: 'mint_failed', detail: data?.errors ?? null }, 502);
    }
    return json({ token: data.token }, 200);
  } catch (e) {
    return json({ error: 'mint_threw', detail: String((e as Error)?.message ?? e) }, 500);
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
