import { json } from '../../_lib/auth.js';
import { ghPut } from '../../_lib/gh.js';
import { cleanProducts } from '../../_lib/validate.js';
export async function onRequestPut({ request, env }) {
  const b = await request.json();
  const { list, error } = cleanProducts(b.products);
  if (error) return json({ ok: false, error }, 400);
  const sha = await ghPut(env, 'data/products.json', JSON.stringify(list, null, 1) + '\n', 'Panou: ' + String(b.message || 'actualizare produse').slice(0, 100), b.sha);
  return json({ ok: true, sha });
}
