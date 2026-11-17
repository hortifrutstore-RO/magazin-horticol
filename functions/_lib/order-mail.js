// Emailurile de confirmare a comenzii (client + magazin). Primește rândul din tabela `orders`.
import { sendMail, esc } from './mail.js';
import SHOP from '../api/_shop.json';
const lei = n => Number(n).toFixed(2).replace('.', ',') + ' lei';
const PAY = { cod: 'ramburs, la livrare', transfer: 'transfer bancar', card: 'card online (NETOPIA Payments) – plătită' };

export async function sendOrderMails(env, origin, o) {
  const items = JSON.parse(o.items_json || '[]');
  const rows = items.map(x => `<tr><td>${esc(x.name)}</td><td align="center">${x.qty}</td><td align="right">${lei(x.total)}</td></tr>`).join('');
  const where = o.delivery === 'easybox' ? `Easybox: ${esc(o.easybox)}` : `${esc(o.address)}, ${esc(o.city)}, jud. ${esc(o.county)}`;
  const body = `<p>Comanda <b>${esc(o.number)}</b></p><table cellpadding="6" style="border-collapse:collapse;width:100%">${rows}
    <tr><td colspan="2">Transport</td><td align="right">${o.shipping ? lei(o.shipping) : 'Gratuit'}</td></tr>
    <tr><td colspan="2"><b>Total</b></td><td align="right"><b>${lei(o.total)}</b></td></tr></table>
    <p>Livrare: ${where}<br>Plată: ${PAY[o.payment] || o.payment}</p>`;
  const bank = o.payment === 'transfer' && env.BANK_DETAILS ? `<p>Date pentru plată: ${esc(env.BANK_DETAILS)}<br>Mențiune: ${esc(o.number)}</p>` : '';
  const paid = o.payment === 'card' ? 'Am primit plata și ' : '';
  await Promise.all([
    sendMail(env, { to: o.email, replyTo: SHOP.email, subject: `Comanda ${o.number} a fost înregistrată`, html: `<p>Bună, ${esc(o.name)}!</p><p>${paid ? paid + 'comanda ta' : 'Am primit comanda ta'}. Când o predăm curierului primești un email cu numărul AWB și linkul de urmărire.</p>${body}${bank}<p>Comenzile tale le vezi oricând în <a href="${origin}/cont/">contul tău</a>.</p><p>Mulțumim!</p>` }),
    sendMail(env, { to: env.NOTIFY_EMAIL || SHOP.email, replyTo: o.email, subject: `Comandă nouă ${o.number} – ${lei(o.total)}${o.payment === 'card' ? ' (plătită cu cardul)' : ''}`, html: `${body}<p>${esc(o.name)} · ${esc(o.phone)} · ${esc(o.email)}${o.company_name ? `<br>Firmă: ${esc(o.company_name)} (${esc(o.company_cui)})` : ''}${o.notes ? `<br>Observații: ${esc(o.notes)}` : ''}</p>` })
  ]);
}
