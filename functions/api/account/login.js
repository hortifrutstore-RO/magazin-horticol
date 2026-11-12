// POST {email}: trimite linkul de conectare. Răspunde la fel indiferent dacă emailul are comenzi (nu dezvăluie cine e client).
import { json } from '../../_lib/auth.js';
import { sendMail, mailReady } from '../../_lib/mail.js';
import { esc } from '../../_lib/mail.js';
import { normEmail, validEmail, newToken, sha256, LINK_MIN } from '../../_lib/customer.js';
import SHOP from '../_shop.json';

export async function onRequestPost({ request, env }) {
  let b = {}; try { b = await request.json(); } catch {}
  const email = normEmail(b.email);
  if (!validEmail(email)) return json({ ok: false, error: 'Adresa de email nu pare corectă.' }, 400);
  if (!mailReady(env) || !env.SESSION_SECRET) return json({ ok: false, error: 'Conectarea nu este disponibilă momentan. Încearcă mai târziu.' }, 422);
  const ip = request.headers.get('cf-connecting-ip') || '';
  const since = new Date(Date.now() - 15 * 60e3).toISOString();
  const r = await env.DB.prepare('SELECT SUM(email = ?1) AS e, SUM(ip = ?2) AS i FROM login_tokens WHERE created_at > ?3').bind(email, ip, since).first();
  if ((r?.e || 0) >= 3 || (r?.i || 0) >= 10) return json({ ok: false, error: 'Ai cerut deja câteva linkuri. Verifică emailul (și Spam) sau încearcă peste 15 minute.' }, 429);
  const t = newToken(), now = new Date();
  await env.DB.prepare('INSERT INTO login_tokens (hash, email, ip, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(await sha256(t), email, ip, now.toISOString(), new Date(+now + LINK_MIN * 60e3).toISOString()).run();
  await env.DB.prepare('DELETE FROM login_tokens WHERE created_at < ?1').bind(new Date(Date.now() - 7 * 864e5).toISOString()).run();
  const base = new URL(request.url).origin;
  const link = `${base}/api/account/verify?t=${t}`;
  const m = { subject: 'Linkul tău de conectare la magazin-horticol.ro', html: `<p>Bună!</p><p>Apasă butonul de mai jos ca să intri în contul tău și să vezi comenzile. Linkul e valabil ${LINK_MIN} de minute și merge o singură dată.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#1F3B2D;color:#ffffff;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px">Intră în cont</a></p>
<p style="color:#6B7C70;font-size:13px">Nu ai cerut tu acest email? Îl poți ignora: nimeni nu poate intra în cont fără acest link.</p>` };
  const s = await sendMail(env, { to: email, replyTo: SHOP.email, subject: m.subject, html: m.html });
  if (!s.ok) return json({ ok: false, error: 'Emailul nu a putut fi trimis. Încearcă din nou.' }, 422);
  return json({ ok: true });
}
