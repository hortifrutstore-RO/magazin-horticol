import { json } from '../../../_lib/auth.js';
import { sendMail, mailReady, esc } from '../../../_lib/mail.js';
import SHOP from '../../_shop.json';
import { reserve, restore, getStock, syncCatalogStock } from '../../../_lib/stock.js';
const STATUS = ['noua', 'expediata', 'livrata', 'anulata'];
export async function onRequestPatch({ request, env, params, waitUntil }) {
  const b = await request.json(); const id = parseInt(params.id, 10);
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first();
  if (!o) return json({ ok: false, error: 'Comanda nu există.' }, 404);
  if (b.status !== undefined && !STATUS.includes(b.status)) return json({ ok: false, error: 'Status invalid.' }, 400);
  const awb = b.awb === undefined ? undefined : String(b.awb).replace(/\s+/g, '').slice(0, 40);
  if (awb !== undefined && awb && !/^[A-Za-z0-9-]{6,40}$/.test(awb)) return json({ ok: false, error: 'Număr AWB invalid.' }, 400);
  const note = b.adminNote === undefined ? undefined : String(b.adminNote).slice(0, 1000);
  // Anulare: produsele revin în stoc. Reactivare a unei comenzi anulate: se scad din nou (dacă mai sunt).
  const items0 = JSON.parse(o.items_json || '[]'); let touched = [];
  if (b.status === 'anulata' && o.status !== 'anulata') {
    const tracked = await getStock(env, items0.map(i => i.sku));
    const back = items0.filter(i => i.sku in tracked);
    await restore(env, back); touched = back.map(i => i.sku);
  }
  if (b.status && b.status !== 'anulata' && o.status === 'anulata') {
    const rs = await reserve(env, items0);
    if (!rs.ok) return json({ ok: false, error: 'Nu se poate reactiva: stoc insuficient pentru ' + rs.short.map(x => x.name).join(', ') + '.' }, 409);
    touched = rs.zeroed;
  }
  if (touched.length) waitUntil(syncCatalogStock(env, touched));
  await env.DB.prepare('UPDATE orders SET status = COALESCE(?1, status), awb = COALESCE(?2, awb), admin_note = COALESCE(?3, admin_note) WHERE id = ?4')
    .bind(b.status ?? null, awb ?? null, note ?? null, id).run();

  // Email automat de urmărire: o singură dată, când comanda e „Expediată” și are AWB (sau la retrimitere manuală).
  const status = b.status ?? o.status, code = awb ?? o.awb;
  let mailed = false;
  if (status === 'expediata' && code && (!o.awb_notified_at || o.awb !== code || b.resend) && mailReady(env)) {
    const link = SHOP.trackingUrl.replace('{awb}', encodeURIComponent(code));
    const items = JSON.parse(o.items_json || '[]').map(i => `${i.qty} × ${esc(i.name)}`).join('<br>');
    const r = await sendMail(env, { to: o.email, replyTo: SHOP.email, subject: `Comanda ${o.number} a fost expediată – AWB ${code}`,
      html: `<p>Bună, ${esc(o.name)}!</p><p>Comanda <b>${esc(o.number)}</b> a fost predată curierului ${esc(SHOP.carrier)}.</p>
        <p style="font-size:17px">AWB: <b>${esc(code)}</b></p>
        <p><a href="${link}" style="display:inline-block;background:#1F3B2D;color:#F7F3EA;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Urmărește coletul</a></p>
        <p style="color:#3E5246">${items}</p>
        ${o.payment === 'cod' ? `<p>Plata de <b>${o.total.toFixed(2).replace('.', ',')} lei</b> se face curierului, la livrare.</p>` : ''}
        <p>Pentru orice întrebare răspunde la acest email sau sună la 0746 242 877.</p>` });
    if (r.ok) { mailed = true; await env.DB.prepare('UPDATE orders SET awb_notified_at = ?1 WHERE id = ?2').bind(new Date().toISOString(), id).run(); }
  }
  return json({ ok: true, mailed, mailConfigured: mailReady(env) });
}
