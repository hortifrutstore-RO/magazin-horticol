import { json } from '../../_lib/auth.js';
import { ghGet, ghReady } from '../../_lib/gh.js';
import { getStock } from '../../_lib/stock.js';
// Datele curente ale site-ului, citite din depozit (sursa adevărului pentru panou).
export async function onRequestGet({ env }) {
  if (!ghReady(env)) return json({ ok: false, error: 'Legătura cu GitHub nu este configurată (GITHUB_TOKEN, GITHUB_REPO).' }, 500);
  const [p, s] = await Promise.all([ghGet(env, 'data/products.json'), ghGet(env, 'data/site.json')]);
  const products = JSON.parse(p.text); const live = await getStock(env).catch(() => ({}));
  for (const x of products) if (x.sku in live) { x.stock = live[x.sku]; x.inStock = live[x.sku] > 0; }
  return json({ ok: true, products, productsSha: p.sha, site: JSON.parse(s.text), siteSha: s.sha });
}
