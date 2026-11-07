import { json } from '../../../_lib/auth.js';
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url); const st = u.searchParams.get('status');
  const q = st ? env.DB.prepare('SELECT * FROM orders WHERE status = ?1 ORDER BY id DESC LIMIT 300').bind(st)
               : env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 300');
  const { results } = await q.all();
  const counts = (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all()).results;
  return json({ ok: true, orders: results.map(o => ({ ...o, items: JSON.parse(o.items_json || '[]') })), counts });
}
