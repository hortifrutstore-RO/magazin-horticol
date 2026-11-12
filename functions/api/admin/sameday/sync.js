// POST: verifică la Sameday statusul comenzilor expediate; cele livrate trec automat pe „Livrată”.
// Rulează din panou, cel mult o dată la 30 de minute pentru fiecare AWB.
import { json } from '../../../_lib/auth.js';
import { samedayReady, awbStatus } from '../../../_lib/sameday.js';
export async function onRequestPost({ env }) {
  if (!samedayReady(env)) return json({ ok: true, ready: false, updated: 0 });
  const since = new Date(Date.now() - 30 * 60e3).toISOString();
  const { results } = await env.DB.prepare("SELECT id, awb FROM orders WHERE status = 'expediata' AND awb IS NOT NULL AND (awb_checked_at IS NULL OR awb_checked_at < ?1) ORDER BY id DESC LIMIT 25").bind(since).all();
  let delivered = 0; const now = new Date().toISOString();
  for (const o of results) {
    try {
      const s = await awbStatus(env, o.awb);
      const st = s.delivered ? 'livrata' : null;
      if (st) delivered++;
      await env.DB.prepare('UPDATE orders SET awb_status = ?1, awb_checked_at = ?2, status = COALESCE(?3, status) WHERE id = ?4').bind((s.label || '').slice(0, 120) || null, now, st, o.id).run();
    } catch { await env.DB.prepare('UPDATE orders SET awb_checked_at = ?1 WHERE id = ?2').bind(now, o.id).run(); }
  }
  return json({ ok: true, ready: true, checked: results.length, delivered });
}
