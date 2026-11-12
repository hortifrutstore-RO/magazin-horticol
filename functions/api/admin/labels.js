// GET ?ids=1,2,3[&size=A4]: etichetele AWB ale comenzilor alese, într-un singur PDF (pentru printare deodată).
import { json } from '../../_lib/auth.js';
import { samedayReady, awbPdf } from '../../_lib/sameday.js';
import { PDFDocument } from '../../_lib/pdf-lib.mjs';
export async function onRequestGet({ env, request }) {
  if (!samedayReady(env)) return json({ ok: false, error: 'Integrarea Sameday nu este configurată.' }, 400);
  const u = new URL(request.url), size = u.searchParams.get('size') === 'A4' ? 'A4' : 'A6';
  const ids = (u.searchParams.get('ids') || '').split(',').map(x => parseInt(x, 10)).filter(x => x > 0).slice(0, 50);
  if (!ids.length) return json({ ok: false, error: 'Nicio comandă aleasă.' }, 400);
  const { results } = await env.DB.prepare(`SELECT id, number, awb FROM orders WHERE awb IS NOT NULL AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  const byId = new Map(results.map(r => [r.id, r]));
  const out = await PDFDocument.create(); const fail = [];
  for (const id of ids) {
    const o = byId.get(id); if (!o) continue;
    try {
      const src = await PDFDocument.load(await (await awbPdf(env, o.awb, size)).arrayBuffer());
      (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));
    } catch { fail.push(o.number); }
  }
  if (!out.getPageCount()) return json({ ok: false, error: 'Nu am putut descărca nicio etichetă.' + (fail.length ? ' (' + fail.join(', ') + ')' : '') }, 422);
  const name = `AWB-${new Date().toISOString().slice(0, 10)}-${out.getPageCount()}.pdf`;
  return new Response(await out.save(), { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'no-store', ...(fail.length ? { 'x-failed': fail.join(',') } : {}) } });
}
