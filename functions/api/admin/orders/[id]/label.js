// Eticheta AWB în PDF (A6 implicit, ?size=A4 pentru foaie întreagă).
import { json } from '../../../../_lib/auth.js';
import { samedayReady, awbPdf } from '../../../../_lib/sameday.js';
export async function onRequestGet({ env, params, request }) {
  if (!samedayReady(env)) return json({ ok: false, error: 'Integrarea Sameday nu este configurată.' }, 400);
  const o = await env.DB.prepare('SELECT number, awb FROM orders WHERE id = ?1').bind(parseInt(params.id, 10)).first();
  if (!o || !o.awb) return json({ ok: false, error: 'Comanda nu are AWB.' }, 404);
  const size = new URL(request.url).searchParams.get('size') === 'A4' ? 'A4' : 'A6';
  try {
    const r = await awbPdf(env, o.awb, size);
    return new Response(r.body, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="AWB-${o.awb}-${o.number}.pdf"`, 'cache-control': 'no-store' } });
  } catch (e) { return json({ ok: false, error: e.message }, 422); }
}
