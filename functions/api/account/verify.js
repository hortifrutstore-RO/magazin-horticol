// GET ?t=...: linkul din email. Valid o singură dată, 30 de minute; setează cookie-ul de cont și trimite la /cont/.
import { sha256, makeCookie } from '../../_lib/customer.js';
const go = (to, cookie) => new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store', ...(cookie ? { 'set-cookie': cookie } : {}) } });
export async function onRequestGet({ request, env }) {
  const t = new URL(request.url).searchParams.get('t') || '';
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(t)) return go('/cont/?e=link');
  const h = await sha256(t), now = new Date().toISOString();
  const row = await env.DB.prepare('UPDATE login_tokens SET used_at = ?1 WHERE hash = ?2 AND used_at IS NULL AND expires_at > ?1 RETURNING email').bind(now, h).first();
  if (!row) return go('/cont/?e=link');
  return go('/cont/', await makeCookie(env, row.email));
}
