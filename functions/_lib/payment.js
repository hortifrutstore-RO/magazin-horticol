// Actualizează statusul plății cu cardul pe comandă. La prima confirmare trimite emailurile de comandă.
import { sendOrderMails } from './order-mail.js';

export async function setPayState(env, origin, o, state) {
  if (!state || state === o.pay_status) return false;
  // O plată confirmată nu mai coboară în „eșuată/în curs” (notificări întârziate de la încercări vechi); doar rambursarea o schimbă.
  if (o.pay_status === 'paid' && state !== 'refunded') return false;
  if (state === 'paid') {
    const r = await env.DB.prepare("UPDATE orders SET pay_status = 'paid', paid_at = ?1 WHERE id = ?2 AND (pay_status IS NULL OR pay_status <> 'paid')")
      .bind(new Date().toISOString(), o.id).run();
    if (r.meta.changes) await sendOrderMails(env, origin, { ...o, pay_status: 'paid' });
    return !!r.meta.changes;
  }
  await env.DB.prepare('UPDATE orders SET pay_status = ?1 WHERE id = ?2').bind(state, o.id).run();
  return true;
}
