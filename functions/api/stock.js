import { getStock } from '../_lib/stock.js';
// Stocul curent al produselor cu evidență de bucăți (public, doar cantități).
export async function onRequestGet({ env }) {
  const s = await getStock(env).catch(() => ({}));
  return new Response(JSON.stringify(s), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=20' } });
}
