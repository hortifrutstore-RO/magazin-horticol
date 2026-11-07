import { json } from '../../_lib/auth.js';
import { ghGet, ghReady } from '../../_lib/gh.js';
// Datele curente ale site-ului, citite din depozit (sursa adevărului pentru panou).
export async function onRequestGet({ env }) {
  if (!ghReady(env)) return json({ ok: false, error: 'Legătura cu GitHub nu este configurată (GITHUB_TOKEN, GITHUB_REPO).' }, 500);
  const [p, s] = await Promise.all([ghGet(env, 'data/products.json'), ghGet(env, 'data/site.json')]);
  return json({ ok: true, products: JSON.parse(p.text), productsSha: p.sha, site: JSON.parse(s.text), siteSha: s.sha });
}
