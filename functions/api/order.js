// POST /api/order — salvează comanda în D1 (binding DB) și trimite emailuri (opțional, prin Resend).
// Prețurile și transportul se recalculează aici, din catalogul de pe server, nu din browser.
import CATALOG from './_catalog.json';
import SHOP from './_shop.json';
import { sendOrderMails } from '../_lib/order-mail.js';
import { checkSession } from '../_lib/auth.js';
import { netopiaReady, netopiaLive, startPayment } from '../_lib/netopia.js';
import { reserve, restore, syncCatalogStock } from '../_lib/stock.js';

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8' } });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function onRequestPost({ request, env, waitUntil }) {
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, error: 'Cerere invalidă.' }, 400); }
  if (b.website) return json({ ok: true, number: 'OK', total: 0 }); // capcană pentru roboți

  const o = {
    name: str(b.name, 120), phone: str(b.phone, 30), email: str(b.email, 160), county: str(b.county, 40), city: str(b.city, 80),
    zip: str(b.zip, 10), address: str(b.address, 250), delivery: b.delivery === 'easybox' ? 'easybox' : 'address', easybox: str(b.easybox, 200),
    payment: ['transfer', 'card'].includes(b.payment) ? b.payment : 'cod', company: !!b.company, companyName: str(b.companyName, 160), companyCui: str(b.companyCui, 20),
    notes: str(b.notes, 1000), newsletter: !!b.newsletter
  };
  // Easybox ales de pe harta Sameday
  const lid = parseInt(b.lockerId, 10);
  const locker = o.delivery === 'easybox' && lid > 0 ? { lockerId: lid, oohType: parseInt(b.oohType, 10) === 1 ? 1 : 0, name: str(b.lockerName, 120),
    address: str(b.lockerAddress, 250), city: str(b.lockerCity, 80), county: str(b.lockerCounty, 40), postalCode: str(b.lockerZip, 10) } : null;
  if (locker) o.easybox = `${locker.name} – ${locker.address}, ${locker.city}`.slice(0, 200);
  const errs = [];
  if (o.name.length < 3) errs.push('nume');
  if (!/^[0-9 +().-]{9,}$/.test(o.phone)) errs.push('telefon');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) errs.push('email');
  if (!o.county || !o.city) errs.push('localitate');
  if (o.delivery === 'address' && o.address.length < 3) errs.push('adresă (scrie strada și numărul, sau doar numărul la sat)');
  if (o.delivery === 'easybox' && (o.easybox.length < 3 || (env.SAMEDAY_USER && !locker))) errs.push('easybox (alege-l de pe hartă)');
  if (o.company && (!o.companyName || !o.companyCui)) errs.push('date firmă');
  if (b.terms !== true) errs.push('acceptarea termenilor');
  if (o.payment === 'card' && !(netopiaReady(env) && (netopiaLive(env) || await checkSession(request, env.SESSION_SECRET))))
    return json({ ok: false, error: 'Plata cu cardul nu este disponibilă momentan. Alege plata la livrare.' }, 400);
  if (errs.length) return json({ ok: false, error: 'Verifică: ' + errs.join(', ') + '.' }, 400);

  const items = [];
  for (const it of Array.isArray(b.items) ? b.items.slice(0, 50) : []) {
    const p = CATALOG[it && it.sku]; const q = Math.max(1, Math.min(99, parseInt(it && it.qty, 10) || 0));
    if (!p || !p.inStock || !q) continue;
    items.push({ sku: it.sku, name: p.name, model: p.model, img: p.img, url: p.url, w: p.w || null, price: p.price, qty: q, total: Math.round(p.price * q * 100) / 100 });
  }
  if (!items.length) return json({ ok: false, error: 'Coșul este gol sau produsele nu mai sunt disponibile.' }, 400);
  const big = o.delivery === 'easybox' ? items.filter(i => CATALOG[i.sku].neb) : [];
  if (big.length) return json({ ok: false, error: 'Nu încap în easybox: ' + big.map(i => i.name).join(', ') + '. Alege livrarea prin curier la adresă.' }, 400);
  const subtotal = Math.round(items.reduce((a, x) => a + x.total, 0) * 100) / 100;
  const shipping = subtotal >= SHOP.freeOver ? 0 : SHOP.cost;
  const total = Math.round((subtotal + shipping) * 100) / 100;

  const d = new Date();
  const number = 'MH' + d.toISOString().slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();

  if (!env.DB) return json({ ok: false, error: 'Baza de date nu este configurată.' }, 500);
  const rs = await reserve(env, items);
  if (!rs.ok) return json({ ok: false, error: 'Stoc insuficient: ' + rs.short.map(x => `${x.name} (${x.left ? 'mai sunt ' + x.left + ' buc.' : 'epuizat'})`).join('; ') + '.', stock: rs.short }, 409);
  try {
  await env.DB.prepare(`INSERT INTO orders (number, created_at, status, name, phone, email, county, city, zip, address, delivery, easybox, payment,
      company_name, company_cui, notes, newsletter, items_json, subtotal, shipping, total, locker_json)
      VALUES (?1, ?2, 'noua', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)`)
    .bind(number, d.toISOString(), o.name, o.phone, o.email, o.county, o.city, o.zip, o.address, o.delivery, o.easybox, o.payment,
      o.company ? o.companyName : null, o.company ? o.companyCui : null, o.notes, o.newsletter ? 1 : 0, JSON.stringify(items), subtotal, shipping, total, locker ? JSON.stringify(locker) : null)
    .run();
  } catch (e) { await restore(env, items); throw e; }
  if (rs.zeroed.length) waitUntil(syncCatalogStock(env, rs.zeroed));

  const row = { number, name: o.name, phone: o.phone, email: o.email, county: o.county, city: o.city, zip: o.zip, address: o.address, delivery: o.delivery,
    easybox: o.easybox, payment: o.payment, company_name: o.company ? o.companyName : null, company_cui: o.company ? o.companyCui : null, notes: o.notes,
    items_json: JSON.stringify(items), subtotal, shipping, total };
  const origin = new URL(request.url).origin;

  // Card: trimitem clientul la Netopia; emailurile pleacă abia după confirmarea plății (IPN).
  if (o.payment === 'card') {
    const token = crypto.randomUUID().replace(/-/g, '');
    const p = await startPayment(env, origin, row, items, 1, token);
    if (!p.ok) {
      await env.DB.prepare('DELETE FROM orders WHERE number = ?1').bind(number).run();
      await restore(env, items); if (rs.zeroed.length) waitUntil(syncCatalogStock(env, rs.zeroed));
      console.log('Netopia start', number, p.error, JSON.stringify(p.raw || {}));
      return json({ ok: false, error: 'Plata cu cardul nu a putut fi inițiată. Încearcă din nou sau alege plata la livrare.' }, 502);
    }
    await env.DB.prepare("UPDATE orders SET pay_status = 'pending', pay_token = ?1, pay_ntp = ?2, pay_attempt = 1 WHERE number = ?3").bind(token, p.ntpID, number).run();
    return json({ ok: true, number, total, payUrl: p.url });
  }

  await sendOrderMails(env, origin, row);
  return json({ ok: true, number, total });
}

export const onRequest = () => json({ ok: false, error: 'Metodă nepermisă.' }, 405);
