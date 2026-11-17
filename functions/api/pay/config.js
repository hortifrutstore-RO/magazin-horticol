// GET /api/pay/config — coșul afișează opțiunea „Card” doar dacă plata e configurată.
// În sandbox (NETOPIA_LIVE ≠ "1") opțiunea apare doar pentru administratorul autentificat, ca să testeze fără să o vadă clienții.
import { json, checkSession } from '../../_lib/auth.js';
import { netopiaReady, netopiaLive } from '../../_lib/netopia.js';

export async function onRequestGet({ request, env }) {
  if (!netopiaReady(env)) return json({ card: false });
  if (netopiaLive(env)) return json({ card: true, test: false });
  return json({ card: await checkSession(request, env.SESSION_SECRET), test: true });
}
