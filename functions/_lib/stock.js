// Stocul „viu” stă în tabela D1 `stock` (sku, qty). Produsele fără rând în tabelă nu au evidență de bucăți (mereu disponibile cât sunt „în stoc”).
import { ghGet, ghPut, ghReady } from './gh.js';

export async function getStock(env, skus) {
  if (!env.DB) return {};
  const { results } = skus && skus.length
    ? await env.DB.prepare(`SELECT sku, qty FROM stock WHERE sku IN (${skus.map((_, i) => '?' + (i + 1)).join(',')})`).bind(...skus).all()
    : await env.DB.prepare('SELECT sku, qty FROM stock').all();
  return Object.fromEntries(results.map(r => [r.sku, r.qty]));
}

// Rezervă bucățile pentru o comandă. Ori reușește pentru toate produsele, ori nu scade nimic.
export async function reserve(env, items) {
  const tracked = await getStock(env, items.map(i => i.sku));
  const todo = items.filter(i => i.sku in tracked);
  const short = todo.filter(i => tracked[i.sku] < i.qty);
  if (short.length) return { ok: false, short: short.map(i => ({ sku: i.sku, name: i.name, left: tracked[i.sku] })) };
  if (!todo.length) return { ok: true, zeroed: [] };
  const res = await env.DB.batch(todo.map(i => env.DB.prepare('UPDATE stock SET qty = qty - ?1 WHERE sku = ?2 AND qty >= ?1').bind(i.qty, i.sku)));
  const failed = todo.filter((_, k) => !res[k].meta.changes);
  if (failed.length) { // cineva a cumpărat între timp: dăm înapoi ce am scăzut
    const done = todo.filter((_, k) => res[k].meta.changes);
    if (done.length) await restore(env, done);
    const now = await getStock(env, failed.map(i => i.sku));
    return { ok: false, short: failed.map(i => ({ sku: i.sku, name: i.name, left: now[i.sku] ?? 0 })) };
  }
  const after = await getStock(env, todo.map(i => i.sku));
  return { ok: true, zeroed: todo.filter(i => after[i.sku] === 0).map(i => i.sku) };
}

export async function restore(env, items) {
  if (!items.length) return [];
  await env.DB.batch(items.map(i => env.DB.prepare('UPDATE stock SET qty = qty + ?1 WHERE sku = ?2').bind(i.qty, i.sku)));
  return items.map(i => i.sku);
}

// Actualizează catalogul din GitHub (stoc epuizat / revenit în stoc), ca paginile statice să fie reconstruite corect.
export async function syncCatalogStock(env, skus) {
  if (!skus.length || !ghReady(env)) return;
  const live = await getStock(env, skus);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const f = await ghGet(env, 'data/products.json'); const list = JSON.parse(f.text); let changed = false;
      for (const p of list) if (p.sku in live) {
        const q = live[p.sku], inStock = q > 0;
        if (p.stock !== q || p.inStock !== inStock) { p.stock = q; p.inStock = inStock; changed = true; }
      }
      if (!changed) return;
      await ghPut(env, 'data/products.json', JSON.stringify(list, null, 1) + '\n', `Stoc actualizat automat: ${skus.join(', ')}`, f.sha);
      return;
    } catch (e) { await new Promise(r => setTimeout(r, 800)); }
  }
}
