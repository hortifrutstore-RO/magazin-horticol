// Emailul de expediere (o singură dată pe AWB, sau la retrimitere).
import { sendMail, mailReady, esc } from './mail.js';
import SHOP from '../api/_shop.json';
export async function sendShipped(env, o, code) {
  if (!mailReady(env) || !code) return false;
  const link = SHOP.trackingUrl.replace('{awb}', encodeURIComponent(code));
  const items = JSON.parse(o.items_json || '[]').map(i => `${i.qty} × ${esc(i.name)}`).join('<br>');
  const eb = o.delivery === 'easybox';
  const r = await sendMail(env, { to: o.email, replyTo: SHOP.email, subject: `Comanda ${o.number} a fost expediată – AWB ${code}`,
    html: `<p>Bună, ${esc(o.name)}!</p><p>Comanda <b>${esc(o.number)}</b> a fost predată curierului ${esc(SHOP.carrier)}.${eb ? ` Coletul pleacă spre easybox-ul ales: <b>${esc(o.easybox)}</b>. Când ajunge, Sameday îți trimite prin SMS codul de deschidere.` : ''}</p>
      <p style="font-size:17px">AWB: <b>${esc(code)}</b></p>
      <p><a href="${link}" style="display:inline-block;background:#1F3B2D;color:#F7F3EA;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Urmărește coletul</a></p>
      <p style="color:#3E5246">${items}</p>
      ${o.payment === 'cod' ? `<p>Plata de <b>${Number(o.total).toFixed(2).replace('.', ',')} lei</b> se face ${eb ? 'la ridicarea din easybox' : 'curierului, la livrare'}.</p>` : ''}
      <p>Pentru orice întrebare răspunde la acest email sau sună la 0746 242 877.</p>` });
  if (r.ok) await env.DB.prepare('UPDATE orders SET awb_notified_at = ?1 WHERE id = ?2').bind(new Date().toISOString(), o.id).run();
  return r.ok;
}
