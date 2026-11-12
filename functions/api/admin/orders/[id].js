import { json } from '../../../_lib/auth.js';
import { mailReady } from '../../../_lib/mail.js';
import { sendShipped } from '../../../_lib/notify.js';
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
  if (status === 'expediata' && code && (!o.awb_notified_at || o.awb !== code || b.resend)) mailed = await sendShipped(env, o, code);
  return json({ ok: true, mailed, mailConfigured: mailReady(env) });
}
