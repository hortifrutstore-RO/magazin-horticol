// POST /api/pay/ipn — notificarea instantă de la NETOPIA Payments despre statusul plății.
import { verifyIpn, payState, orderNumber, netopiaReady } from '../../_lib/netopia.js';
import { setPayState } from '../../_lib/payment.js';

const reply = (errorType = 0, errorMessage = '') => new Response(JSON.stringify({ errorType, errorCode: errorType ? 0x10000101 : null, errorMessage }),
  { status: 200, headers: { 'content-type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  if (!netopiaReady(env) || !env.DB) return reply(1, 'Neconfigurat');
  const raw = await request.text();
  const v = await verifyIpn(env, request.headers.get('verification-token'), raw);
  if (!v.ok) { console.log('IPN respins:', v.error); return reply(2, v.error); }
  let b; try { b = JSON.parse(raw); } catch { return reply(2, 'JSON invalid'); }
  const number = orderNumber(b.order && b.order.orderID);
  const status = b.payment && b.payment.status;
  const o = await env.DB.prepare('SELECT * FROM orders WHERE number = ?1').bind(number).first();
  if (!o) { console.log('IPN pentru comandă inexistentă:', number); return reply(2, 'Comanda nu există'); }
  // Suma plătită trebuie să corespundă comenzii.
  const amount = Number(b.payment && b.payment.amount);
  if (Number.isFinite(amount) && amount > 0 && Math.abs(amount - o.total) > 0.01) { console.log('IPN sumă diferită', number, amount, o.total); return reply(2, 'Sumă diferită'); }
  if (b.payment && b.payment.ntpID) await env.DB.prepare('UPDATE orders SET pay_ntp = ?1 WHERE id = ?2').bind(String(b.payment.ntpID).slice(0, 60), o.id).run();
  await setPayState(env, new URL(request.url).origin, o, payState(status));
  return reply(0);
}

export const onRequest = () => new Response('Metodă nepermisă', { status: 405 });
