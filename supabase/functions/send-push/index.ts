import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_KEYS = Deno.env.get('VAPID_KEYS') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // Vérifie que l'appelant est bien connecté
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ error: 'missing_auth' }, 401);
    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: auth } } });
    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud?.user) return json({ error: 'invalid_session' }, 401);

    const { target_id, title, body, url } = await req.json();
    if (!target_id) return json({ error: 'no_target' }, 400);
    if (!VAPID_KEYS) return json({ error: 'no_vapid' }, 500);

    // Client admin (bypass RLS) pour lire les abonnements du destinataire
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', target_id);
    if (!subs || !subs.length) return json({ sent: 0, reason: 'no_subs' });

    const vapidKeys = await webpush.importVapidKeys(JSON.parse(VAPID_KEYS), { extractable: false });
    const server = await webpush.ApplicationServer.new({
      contactInformation: 'mailto:hello@cailloudex.app',
      vapidKeys,
    });

    const payload = JSON.stringify({ title: title || 'CaillouDEX', body: body || '', url: url || './' });
    let sent = 0;
    for (const s of subs) {
      const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        const subscriber = server.subscribe(sub as unknown as PushSubscriptionJSON);
        await subscriber.pushTextMessage(payload, {});
        sent++;
      } catch (err) {
        const status = (err && (err as { response?: { status?: number } }).response?.status) || 0;
        const msg = String(err);
        if (status === 404 || status === 410 || msg.includes('410') || msg.includes('404')) {
          try { await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); } catch (_) { /* noop */ }
        }
        console.log('push error', status, msg.slice(0, 160));
      }
    }
    return json({ sent });
  } catch (e) {
    return json({ error: 'server_error', message: String(e) }, 500);
  }
});
