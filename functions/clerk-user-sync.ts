import { createAdminClient } from 'npm:@insforge/sdk';
import { Webhook } from 'npm:svix';

export default async function (req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const secret = Deno.env.get('CLERK_WEBHOOK_SECRET');
  if (!secret) return new Response('not_configured', { status: 500 });

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return new Response('missing_svix_headers', { status: 400 });

  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: any;
  try {
    evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch {
    return new Response('bad_signature', { status: 401 });
  }

  const admin = createAdminClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    apiKey: Deno.env.get('API_KEY'),
  });

  const type = evt?.type;
  const data = evt?.data;

  if (type === 'user.created' || type === 'user.updated') {
    const email = data?.email_addresses?.[0]?.email_address ?? null;
    await admin.database.from('users').upsert([{
      id: data.id,
      email,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'id' });
  } else if (type === 'user.deleted') {
    if (data?.id) await admin.database.from('users').delete().eq('id', data.id);
  }

  return new Response('ok', { status: 200 });
}
