import { verifyPassword, verifyTotp, makeSession, cookieHeader, json } from '../../_lib/auth.js';
// Max. 5 încercări greșite în 15 minute de pe același IP.
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD_HASH || !env.ADMIN_TOTP_SECRET || !env.SESSION_SECRET) return json({ ok: false, error: 'Panoul nu este configurat.' }, 500);
  if (request.headers.get('x-admin') !== '1') return json({ ok: false, error: 'Cerere respinsă.' }, 403);
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  if (env.DB) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ?1 AND ts > ?2').bind(ip, since).first();
    if (r && r.n >= 5) return json({ ok: false, error: 'Prea multe încercări. Așteaptă 15 minute.' }, 429);
  }
  let b = {}; try { b = await request.json(); } catch {}
  const ok = (await verifyPassword(b.password, env.ADMIN_PASSWORD_HASH)) & (await verifyTotp(String(b.code || '').trim(), env.ADMIN_TOTP_SECRET));
  if (!ok) {
    if (env.DB) await env.DB.prepare('INSERT INTO login_attempts (ip, ts) VALUES (?1, ?2)').bind(ip, new Date().toISOString()).run();
    await new Promise(r => setTimeout(r, 600));
    return json({ ok: false, error: 'Parolă sau cod greșit.' }, 401);
  }
  if (env.DB) await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?1 OR ts < ?2').bind(ip, since).run();
  return json({ ok: true }, 200, { 'set-cookie': cookieHeader(await makeSession(env.SESSION_SECRET), 12 * 3600) });
}
