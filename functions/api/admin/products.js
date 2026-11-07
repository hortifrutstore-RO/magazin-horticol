import { json } from '../../_lib/auth.js';
import { ghPut } from '../../_lib/gh.js';
import { cleanProducts } from '../../_lib/validate.js';
export async function onRequestPut({ request, env }) {
  const b = await request.json();
  const { list, error } = cleanProducts(b.products);
  if (error) return json({ ok: false, error }, 400);
  const sha = await ghPut(env, 'data/products.json', JSON.stringify(list, null, 1) + '\n', 'Panou: ' + String(b.message || 'actualizare produse').slice(0, 100), b.sha);
  // Stocul în bucăți se ține în baza de date (scade automat la comenzi); produsele fără număr nu au evidență.
  if (env.DB) {
    const ups = list.filter(p => p.stock !== null).map(p => env.DB.prepare('INSERT INTO stock (sku, qty) VALUES (?1, ?2) ON CONFLICT(sku) DO UPDATE SET qty = ?2').bind(p.sku, p.stock));
    const keep = list.filter(p => p.stock !== null).map(p => p.sku);
    const del = env.DB.prepare(`DELETE FROM stock WHERE sku NOT IN (${keep.map((_, i) => '?' + (i + 1)).join(',') || "''"})`).bind(...keep);
    await env.DB.batch([...ups, del]);
  }
  return json({ ok: true, sha });
}
