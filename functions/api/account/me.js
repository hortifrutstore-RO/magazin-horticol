// GET: comenzile clientului conectat + datele de livrare din ultima comandă (pentru precompletare).
import { json } from '../../_lib/auth.js';
import { customer, makeCookie } from '../../_lib/customer.js';
import SHOP from '../_shop.json';
const track = awb => (SHOP.trackingUrl || 'https://sameday.ro/status-colet/?awb={awb}').replace('{awb}', encodeURIComponent(awb));
export async function onRequestGet({ request, env }) {
  const email = await customer(request, env);
  if (!email) return json({ ok: false }, 401);
  const { results } = await env.DB.prepare('SELECT * FROM orders WHERE email = ?1 COLLATE NOCASE ORDER BY id DESC LIMIT 50').bind(email).all();
  const orders = results.map(o => ({
    number: o.number, created_at: o.created_at, status: o.status, total: o.total, shipping: o.shipping, delivery: o.delivery,
    where: o.delivery === 'easybox' ? o.easybox : [o.address, o.city].filter(Boolean).join(', '),
    awb: o.awb && o.status !== 'anulata' ? o.awb : null, track: o.awb && o.status !== 'anulata' ? track(o.awb) : null,
    items: JSON.parse(o.items_json || '[]').map(i => ({ sku: i.sku, name: i.model || i.name, opt: i.opt || '', img: i.img || '', url: i.url || '', qty: i.qty, total: i.total }))
  }));
  const last = results[0];
  const profile = last ? { name: last.name, phone: last.phone, email: last.email, county: last.county, city: last.city, zip: last.zip, address: last.address,
    delivery: last.delivery, locker: last.locker_json ? JSON.parse(last.locker_json) : null, companyName: last.company_name, companyCui: last.company_cui } : { email };
  return json({ ok: true, email, orders, profile }, 200, { 'set-cookie': await makeCookie(env, email) });
}
