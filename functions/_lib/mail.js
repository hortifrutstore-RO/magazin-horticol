// Trimitere email prin Resend (plan gratuit). Fără RESEND_API_KEY / MAIL_FROM nu trimite nimic și nu blochează comanda.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function mailReady(env) { return !!(env.RESEND_API_KEY && env.MAIL_FROM); }
export async function sendMail(env, { to, subject, html, replyTo }) {
  if (!mailReady(env)) return { ok: false, skipped: true };
  const r = await fetch((env.RESEND_API || 'https://api.resend.com') + '/emails', {
    method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: Array.isArray(to) ? to : [to], reply_to: replyTo, subject, html: wrap(html) })
  }).catch(() => null);
  return { ok: !!(r && r.ok) };
}
const wrap = body => `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#14231A;max-width:560px;margin:0 auto">
  <div style="border-bottom:3px solid #FF6A13;padding:12px 0;margin-bottom:16px;font-size:20px;font-weight:bold;color:#1F3B2D">magazin-horticol.ro</div>${body}
  <p style="font-size:12px;color:#6B7C70;margin-top:24px">HORTIFRUT CONSULTING SRL · magazin-horticol.ro · 0746 242 877</p></div>`;
