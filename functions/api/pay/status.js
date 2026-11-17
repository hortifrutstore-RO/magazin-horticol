// GET /api/pay/status?nr=...&t=... — pagina „Comanda plasată” întreabă dacă plata cu cardul a reușit.
// POST /api/pay/status {nr, t, method: 'card' | 'cod'} — după o plată eșuată: încearcă din nou cu cardul sau trece pe ramburs.
import { json, safeEqual } from '../../_lib/auth.js';
import { netopiaReady, paymentStatus, payState, startPayment } from '../../_lib/netopia.js';
import { setPayState } from '../../_lib/payment.js';
import { sendOrderMails } from '../../_lib/order-mail.js';

async function load(env, nr, t) {
  if (!env.DB || !nr || !t) return null;
  const o = await env.DB.prepare('SELECT * FROM orders WHERE number = ?1').bind(String(nr).slice(0, 40)).first();
  return o && o.payment === 'card' && o.pay_token && safeEqual(o.pay_token, String(t)) ? o : null;
}
const view = o => ({ ok: true, number: o.number, total: o.total, pay: o.pay_status || 'pending', payment: o.payment, cancelled: o.status === 'anulata' });

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  let o = await load(env, u.searchParams.get('nr'), u.searchParams.get('t'));
  if (!o) return json({ ok: false, error: 'Comanda nu a fost găsită.' }, 404);
  // Dacă notificarea de la Netopia n-a sosit încă, întrebăm direct.
  if (o.pay_status !== 'paid' && o.pay_ntp && netopiaReady(env)) {
    const attemptId = o.pay_attempt > 1 ? `${o.number}-P${o.pay_attempt}` : o.number;
    const s = await paymentStatus(env, o.pay_ntp, attemptId);
    if (s !== null && await setPayState(env, u.origin, o, payState(s))) o = await load(env, o.number, o.pay_token);
  }
  return json(view(o));
}

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: 'Cerere invalidă.' }, 400); }
  const o = await load(env, b.nr, b.t);
  if (!o) return json({ ok: false, error: 'Comanda nu a fost găsită.' }, 404);
  if (o.pay_status === 'paid') return json(view(o));
  if (o.status === 'anulata') return json({ ok: false, error: 'Comanda a fost anulată. Plasează o comandă nouă.' }, 409);
  const origin = new URL(request.url).origin;
  if (b.method === 'cod') {
    await env.DB.prepare("UPDATE orders SET payment = 'cod', pay_status = NULL WHERE id = ?1").bind(o.id).run();
    await sendOrderMails(env, origin, { ...o, payment: 'cod' });
    return json({ ok: true, number: o.number, total: o.total, pay: 'cod', payment: 'cod' });
  }
  if (!netopiaReady(env)) return json({ ok: false, error: 'Plata cu cardul nu este disponibilă momentan.' }, 503);
  const attempt = (o.pay_attempt || 1) + 1;
  if (attempt > 6) return json({ ok: false, error: 'Prea multe încercări. Alege plata la livrare sau sună-ne.' }, 429);
  const p = await startPayment(env, origin, o, JSON.parse(o.items_json || '[]'), attempt, o.pay_token);
  if (!p.ok) { console.log('Netopia retry', o.number, p.error); return json({ ok: false, error: 'Plata cu cardul nu a putut fi inițiată. Încearcă din nou sau alege plata la livrare.' }, 502); }
  await env.DB.prepare("UPDATE orders SET pay_status = 'pending', pay_ntp = ?1, pay_attempt = ?2 WHERE id = ?3").bind(p.ntpID, attempt, o.id).run();
  return json({ ok: true, payUrl: p.url });
}
