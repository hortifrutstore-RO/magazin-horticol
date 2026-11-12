// POST: emite AWB Sameday pentru comandă (comanda trece pe „Expediată” și clientul primește emailul cu urmărirea).
// DELETE: anulează AWB-ul la Sameday și readuce comanda la „Nouă”.
import { json } from '../../../../_lib/auth.js';
import { mailReady } from '../../../../_lib/mail.js';
import { samedayReady, createAwb, deleteAwb } from '../../../../_lib/sameday.js';
import { sendShipped } from '../../../../_lib/notify.js';
const get = (env, id) => env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(parseInt(id, 10)).first();

export async function onRequestPost({ request, env, params }) {
  if (!samedayReady(env)) return json({ ok: false, error: 'Integrarea Sameday nu este configurată (SAMEDAY_USER, SAMEDAY_PASS).' }, 400);
  const o = await get(env, params.id);
  if (!o) return json({ ok: false, error: 'Comanda nu există.' }, 404);
  if (o.status === 'anulata') return json({ ok: false, error: 'Comanda este anulată.' }, 400);
  if (o.awb) return json({ ok: false, error: `Comanda are deja AWB-ul ${o.awb}. Anulează-l întâi dacă vrei altul.` }, 409);
  let b = {}; try { b = await request.json(); } catch {}
  let r;
  try { r = await createAwb(env, o, b); } catch (e) { console.log('AWB error', e.message); return json({ ok: false, error: e.message }, 422); }
  await env.DB.prepare("UPDATE orders SET awb = ?1, status = 'expediata', awb_status = ?2, awb_checked_at = NULL, awb_notified_at = NULL WHERE id = ?3")
    .bind(r.awb, 'AWB emis' + (r.cost != null ? ` · cost ${Number(r.cost).toFixed(2).replace('.', ',')} lei` : ''), o.id).run();
  const mailed = await sendShipped(env, { ...o, awb: r.awb }, r.awb);
  return json({ ok: true, awb: r.awb, cost: r.cost, service: r.service, mailed, mailConfigured: mailReady(env) });
}

export async function onRequestDelete({ env, params }) {
  if (!samedayReady(env)) return json({ ok: false, error: 'Integrarea Sameday nu este configurată.' }, 400);
  const o = await get(env, params.id);
  if (!o || !o.awb) return json({ ok: false, error: 'Comanda nu are AWB.' }, 404);
  try { await deleteAwb(env, o.awb); } catch (e) { return json({ ok: false, error: e.message + ' (AWB-urile deja ridicate de curier nu se mai pot anula din site.)' }, 422); }
  await env.DB.prepare("UPDATE orders SET awb = NULL, awb_status = NULL, awb_notified_at = NULL, status = 'noua' WHERE id = ?1").bind(o.id).run();
  return json({ ok: true });
}
