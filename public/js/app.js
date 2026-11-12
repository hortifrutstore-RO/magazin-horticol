(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const S = window.SITE || {};
const lei = n => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' lei';
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- catalog index ---------- */
let CAT = null;
function catalog() {
  if (!CAT) CAT = Promise.all([fetch('/data/search.json').then(r => r.json()), liveStock()]).then(([list, st]) => {
    const by = {}; list.forEach(p => { if (p.sku in st) { p.left = st[p.sku]; p.inStock = st[p.sku] > 0; } by[p.sku] = p; prep(p); });
    return { list, by };
  });
  return CAT;
}
let ST = null;
function liveStock() { if (!ST) ST = fetch('/api/stock').then(r => r.ok ? r.json() : {}).catch(() => ({})); return ST; }
function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ş]/g, 's').replace(/[ţ]/g, 't')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/* ---------- cart ---------- */
const cart = {
  items() { return store.get('cart', []); },
  save(it) { store.set('cart', it); updateCount(); },
  add(sku, qty) { const it = this.items(); const f = it.find(x => x.sku === sku); if (f) f.qty = Math.min(99, f.qty + qty); else it.push({ sku, qty }); this.save(it); },
  setQty(sku, qty) { let it = this.items(); it = it.map(x => x.sku === sku ? { sku, qty: Math.max(1, Math.min(99, qty)) } : x); this.save(it); },
  remove(sku) { this.save(this.items().filter(x => x.sku !== sku)); },
  clear() { this.save([]); }
};
function updateCount() {
  const n = cart.items().reduce((a, x) => a + x.qty, 0);
  $$('[data-cart-count]').forEach(el => { el.textContent = n; el.dataset.n = n; });
}
function toast(html) {
  const t = $('[data-toast]'); if (!t) return;
  t.innerHTML = html; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  e.preventDefault();
  let q = 1; if (b.hasAttribute('data-with-qty')) { const i = $('[data-qty-input]'); q = Math.max(1, parseInt(i && i.value, 10) || 1); }
  cart.add(b.dataset.add, q);
  b.classList.add('added'); const old = b.textContent; b.textContent = 'Adăugat ✓';
  setTimeout(() => { b.classList.remove('added'); b.textContent = old; }, 1600);
  toast('Produsul a fost adăugat în coș <a href="/cos/">Vezi coșul</a>');
  track('add_to_cart', { items: [{ item_id: b.dataset.add, quantity: q }] });
});

/* ---------- buton „magnet”: se apropie fin de cursor ---------- */
if (matchMedia('(hover:hover) and (pointer:fine)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
  const R = 70, MX = 7, MY = 5; let px = 0, py = 0, raf = 0; const on = new Set();
  const step = () => { raf = 0;
    const near = new Set();
    for (const b of document.querySelectorAll('.btn-cart')) {
      const r = b.getBoundingClientRect(); if (r.bottom < -R || r.top > innerHeight + R) continue;
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
      const ox = Math.max(0, Math.abs(dx) - r.width / 2), oy = Math.max(0, Math.abs(dy) - r.height / 2);
      const d = Math.hypot(ox, oy); if (d > R) continue;
      const f = 1 - d / R, k = f * f * (3 - 2 * f);
      b.style.setProperty('--mx', (Math.max(-1, Math.min(1, dx / (r.width / 2 + R))) * MX * k).toFixed(2) + 'px');
      b.style.setProperty('--my', (Math.max(-1, Math.min(1, dy / (r.height / 2 + R))) * MY * k).toFixed(2) + 'px');
      b.classList.add('magnet'); near.add(b);
    }
    for (const b of on) if (!near.has(b)) { b.classList.remove('magnet'); b.style.setProperty('--mx', '0px'); b.style.setProperty('--my', '0px'); }
    on.clear(); near.forEach(b => on.add(b));
  };
  addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(step); }, { passive: true });
  document.addEventListener('pointerleave', () => { px = -1e4; py = -1e4; if (!raf) raf = requestAnimationFrame(step); });
}

/* ---------- stoc în timp real ---------- */
liveStock().then(st => {
  $$('.card[data-sku]').forEach(c => { const q = st[c.dataset.sku]; if (q === undefined) return;
    if (q <= 0 && c.dataset.stock === '1') { c.dataset.stock = '0'; c.classList.add('is-out'); const b = $('[data-add]', c); if (b) { b.outerHTML = '<span class="btn btn-ghost" aria-disabled="true">Stoc epuizat</span>'; } const im = $('.card-img', c); const bd = $('.badge', im); if (bd) bd.remove(); im.insertAdjacentHTML('beforeend', '<span class="badge out">Stoc epuizat</span>'); } });
  const buy = $('[data-with-qty]'); if (!buy) return; const q = st[buy.dataset.add]; if (q === undefined) return;
  const qi = $('[data-qty-input]');
  if (q <= 0) { $('.buy-row').outerHTML = '<div class="stock out"><i aria-hidden="true"></i><span><strong>Stoc epuizat</strong> momentan</span></div>'; const s0 = $('.stock:not(.out)'); if (s0) s0.remove(); }
  else { qi.max = q; if (q <= 5) { const sp = $('.stock span'); if (sp) sp.innerHTML = `<strong>Ultimele ${q} ${q === 1 ? 'bucată' : 'bucăți'}</strong> · expediere în 24–48 h`; } }
});

/* ---------- product page ---------- */
$$('[data-qty]').forEach(b => b.addEventListener('click', () => { const i = $('[data-qty-input]'); i.value = Math.max(1, Math.min(parseInt(i.max, 10) || 99, (parseInt(i.value, 10) || 1) + parseInt(b.dataset.qty, 10))); }));
const gal = $('[data-gallery]');
if (gal) gal.addEventListener('click', e => { const t = e.target.closest('[data-src]'); if (!t) return; $('[data-main]', gal).src = t.dataset.src; $$('[data-src]', gal).forEach(x => x.setAttribute('aria-current', x === t ? 'true' : 'false')); });

/* ---------- category filters ---------- */
const listing = $('[data-listing]');
if (listing) {
  const grid = $('[data-grid]', listing), cards = $$('.card', grid), count = $('[data-count]', listing), empty = $('[data-empty]', listing);
  cards.forEach((c, i) => c.dataset.i = i);
  const apply = () => {
    const subs = $$('[data-f-sub]:checked', listing).map(x => x.value);
    const min = parseFloat($('[data-f-min]', listing).value) || 0, max = parseFloat($('[data-f-max]', listing).value) || Infinity;
    const stock = $('[data-f-stock]', listing).checked, sort = $('[data-sort]', listing).value;
    let vis = cards.filter(c => {
      const p = parseFloat(c.dataset.price);
      return (!subs.length || subs.includes(c.dataset.sub)) && p >= min && p <= max && (!stock || c.dataset.stock === '1');
    });
    const key = { pa: (a, b) => a.dataset.price - b.dataset.price, pd: (a, b) => b.dataset.price - a.dataset.price, off: (a, b) => b.dataset.off - a.dataset.off, rec: (a, b) => (b.dataset.stock - a.dataset.stock) || (a.dataset.i - b.dataset.i) }[sort];
    vis.sort(key);
    cards.forEach(c => c.hidden = true); vis.forEach(c => { c.hidden = false; grid.appendChild(c); });
    count.textContent = vis.length + (vis.length === 1 ? ' produs' : ' produse'); empty.hidden = vis.length > 0;
  };
  listing.addEventListener('input', apply); listing.addEventListener('change', apply);
  const tg = $('[data-filters-toggle]'); if (tg) tg.addEventListener('click', () => { const f = $('[data-filters]'); f.classList.toggle('open'); tg.setAttribute('aria-expanded', f.classList.contains('open')); });
  apply();
}

/* ---------- search ---------- */
/*SEARCH-START*/
const STOP = new Set('de la cu si sau pentru pt din in pe a al ale o un una cel cea ce care mai fara ptr si'.split(' '));
function stem(w) { if (w.length < 4 || /\d/.test(w)) return w; return w.replace(/(urile|ului|elor|ilor|ile|ele|uri|ul|ii|ei|ea|le|a|e|i|u|o)$/, ''); }
const SYN = {}; (S.syn || []).forEach(g => { const st = g.map(w => stem(norm(w))); st.forEach(w => SYN[w] = st.filter(x => x !== w)); });
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = []; for (let i = 0; i <= a.length; i++) d[i] = [i];
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) d[i][j] = Math.min(d[i][j], d[i-2][j-2] + 1);
  }
  return d[a.length][b.length];
}
const words = s => norm(s || '').split(' ').filter(Boolean).map(w => [w, stem(w)]);
/* câmpuri cu greutăți: numele contează cel mai mult, categoria cel mai puțin */
function prep(p) { p._f = [[words(p.name + ' ' + p.sku), 1], [words(p.sub), .45], [words(p.kw), .35], [words(p.cat), .3]]; }
/* cât de bine se potrivește un cuvânt căutat (t = [cuvânt, rădăcină]) cu un cuvânt din produs */
function wq(t, w) {
  const [a, as] = t, [b, bs] = w, code = /\d/.test(a);
  if (a === b) return [code ? 1.3 : 1];
  if (!code && as === bs) return [.95];
  if (b.startsWith(a) && (code || a.length >= 3)) return [.85];
  if (!code && as.length >= 3 && b.startsWith(as)) return [.8];
  if (code && a.length >= 3 && b.includes(a)) return [.6];
  if (!code && a.length >= 4 && b.includes(a)) return [.55];
  if (!code && a.length >= 4 && !/\d/.test(b)) { const tol = a.length >= 7 ? 2 : 1; if (lev(a, b) <= tol || lev(as, bs) <= tol || lev(a, b.slice(0, a.length)) <= tol - (a.length < 7 ? 0 : 1)) return [.5, b]; }
  return [0];
}
function tokScore(t, p) {
  let best = 0, fix = null;
  const alts = [[t, 1]].concat((SYN[t[1]] || []).map(x => [[x, x], .8]));
  for (const [tt, m] of alts) for (const [ws, wt] of p._f) for (const w of ws) {
    const [q, f] = wq(tt, w); const s = q * wt * m; if (s > best) { best = s; fix = m === 1 ? f || null : null; }
  }
  return [best, fix];
}
function search(idx, q) {
  let raw = norm(q).split(' ').filter(Boolean);
  for (let i = 0; i < raw.length - 1; i++) if (/^[a-z]$/.test(raw[i]) && /^\d/.test(raw[i + 1])) { raw[i] += raw[i + 1]; raw.splice(i + 1, 1); }
  let toks = raw.filter(t => t.length > 1 && !STOP.has(t));
  if (!toks.length) toks = raw.filter(t => t.length > 1);
  if (!toks.length) return { res: [], fix: null };
  toks = toks.map(t => [t, stem(t)]);
  const need = toks.length >= 3 ? toks.length - 1 : toks.length;
  const out = [];
  for (const p of idx.list) {
    if (!p._f) prep(p);
    let tot = 0, ok = 0; const fx = {};
    for (const t of toks) { const [s, f] = tokScore(t, p); if (s > .12) { ok++; tot += s; if (f) fx[t[0]] = f; } }
    if (ok < need) continue;
    const nm = p._f[0][0]; if (nm.length && wq(toks[0], nm[0])[0] >= .8) tot += .15;
    out.push({ p, s: tot + (p.inStock ? .05 : 0), fx });
  }
  out.sort((a, b) => b.s - a.s || a.p.name.length - b.p.name.length);
  if (!out.length) return { res: [], fix: null };
  const top = out[0].s; const res = out.filter(x => x.s >= top * .5);
  const fx = res[0].fx; const fix = Object.keys(fx).length ? toks.map(t => fx[t[0]] || t[0]).join(' ') : null;
  return { res: res.map(x => x.p), fix };
}
/*SEARCH-END*/
const recent = { get: () => store.get('recentSearch', []), add(q) { q = q.trim(); if (q.length < 2) return; const r = this.get().filter(x => x !== q); r.unshift(q); store.set('recentSearch', r.slice(0, 5)); }, del(q) { store.set('recentSearch', this.get().filter(x => x !== q)); } };
const sbox = $('[data-search]');
if (sbox) {
  const input = $('input', sbox), panel = $('#suggest'), form = $('form', sbox);
  let active = -1;
  const open = h => { panel.innerHTML = h; panel.classList.toggle('open', !!h); input.setAttribute('aria-expanded', !!h); active = -1; };
  const item = p => `<a class="sg-item" role="option" href="/produs/${p.slug}/"><img src="/img/p/${p.img}" alt=""><span class="n">${esc(p.name)}<span class="s${p.inStock ? '' : ' out'}">${p.inStock ? 'În stoc' : 'Stoc epuizat'}</span></span><span class="p">${lei(p.price)}</span></a>`;
  const empty = async () => {
    const idx = await catalog(); const r = recent.get();
    let h = '';
    if (r.length) h += `<div class="sec"><h4>Căutările tale recente</h4>${r.map(q => `<div class="sg-recent"><a href="/cautare/?q=${encodeURIComponent(q)}">${esc(q)}</a><button type="button" data-del="${esc(q)}">Șterge</button></div>`).join('')}</div>`;
    h += `<div class="sec"><h4>Căutate des</h4><div class="chips">${(S.popular || []).map(q => `<a class="chip" href="/cautare/?q=${encodeURIComponent(q)}">${esc(q)}</a>`).join('')}</div></div>`;
    const pop = idx.list.filter(p => p.featured && p.inStock).slice(0, 3);
    if (pop.length) h += `<div class="sec"><h4>Produse populare</h4>${pop.map(item).join('')}</div>`;
    open(h);
  };
  const typed = async () => {
    const q = input.value.trim(); if (q.length < 2) return empty();
    const idx = await catalog(); const { res, fix } = search(idx, q);
    let h = '';
    if (fix) h += `<div class="sg-note">Rezultate pentru <strong>${esc(fix)}</strong> · ai scris „${esc(q)}”</div>`;
    if (!res.length) h += `<div class="sg-note">Nu am găsit nimic pentru „${esc(q)}”. Încearcă: ${(S.popular || []).slice(0, 3).map(x => `<a href="/cautare/?q=${encodeURIComponent(x)}">${esc(x)}</a>`).join(', ')}</div>`;
    const cats = {}; res.forEach(p => cats[p.cat] = (cats[p.cat] || 0) + 1);
    const ck = Object.keys(cats); if (ck.length) h += `<div class="chips" style="margin-bottom:10px">${ck.map(c => `<a class="chip" href="/categorie/${res.find(p => p.cat === c).catSlug}/">${esc(c)} (${cats[c]})</a>`).join('')}</div>`;
    h += res.slice(0, 6).map(item).join('');
    if (res.length > 6) h += `<a class="sg-all" href="/cautare/?q=${encodeURIComponent(q)}">Vezi toate cele ${res.length} rezultate</a>`;
    open(h);
  };
  let tmr; input.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(typed, 120); });
  input.addEventListener('focus', () => input.value.trim().length >= 2 ? typed() : empty());
  input.addEventListener('keydown', e => {
    const items = $$('.sg-item', panel);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((x, i) => x.classList.toggle('active', i === active)); }
    else if (e.key === 'Enter' && active >= 0 && items[active]) { e.preventDefault(); recent.add(input.value); location.href = items[active].href; }
    else if (e.key === 'Escape') open('');
  });
  form.addEventListener('submit', () => recent.add(input.value));
  panel.addEventListener('click', e => { const d = e.target.closest('[data-del]'); if (d) { e.preventDefault(); recent.del(d.dataset.del); empty(); input.focus(); } else if (e.target.closest('a')) recent.add(input.value); });
  document.addEventListener('click', e => { if (!sbox.contains(e.target)) open(''); });
}
const sgrid = $('[data-search-grid]');
if (sgrid) (async () => {
  const q = new URLSearchParams(location.search).get('q') || ''; if (sbox) $('input', sbox).value = q;
  const idx = await catalog(); const { res, fix } = search(idx, q);
  $('[data-search-title]').textContent = q ? `Rezultate pentru „${q}”` : 'Căutare';
  if (fix) $('[data-search-note]').innerHTML = `Am căutat <strong>${esc(fix)}</strong>.`;
  const render = list => {
    sgrid.innerHTML = list.map(p => `<article class="card${p.inStock ? '' : ' is-out'}"><a class="card-img" href="/produs/${p.slug}/"><img src="/img/p/${p.img}" alt="${esc(p.name)}" loading="lazy">${!p.inStock ? '<span class="badge out">Stoc epuizat</span>' : p.off ? `<span class="badge">−${p.off}%</span>` : ''}</a><span class="label">${esc(p.sub || p.cat)}</span><h3><a href="/produs/${p.slug}/">${esc(p.name)}</a></h3><div class="price"><span class="now">${lei(p.price)}</span>${p.old ? `<s>${lei(p.old)}</s>` : ''}</div>${p.inStock ? `<button class="btn btn-cart" data-add="${p.sku}">Adaugă în coș</button>` : '<a class="btn btn-ghost" href="/contact/">Întreabă de stoc</a>'}</article>`).join('');
    $('[data-count]').textContent = list.length + (list.length === 1 ? ' produs' : ' produse'); $('[data-empty]').hidden = list.length > 0;
  };
  const sel = $('[data-sort]'); const doSort = () => { const l = res.slice(); if (sel.value === 'pa') l.sort((a, b) => a.price - b.price); if (sel.value === 'pd') l.sort((a, b) => b.price - a.price); render(l); };
  sel.addEventListener('change', doSort); render(res);
  track('search', { search_term: q });
})();

/* ---------- checkout ---------- */
const co = $('[data-checkout]');
if (co) (async () => {
  const idx = await catalog();
  const lines = $('[data-cart-lines]', co);
  const render = () => {
    let it = cart.items().filter(x => idx.by[x.sku] && idx.by[x.sku].inStock).map(x => { const l = idx.by[x.sku].left; return l !== undefined && x.qty > l ? { sku: x.sku, qty: l } : x; });
    cart.save(it);
    if (!it.length) { co.hidden = true; $('[data-cart-empty]').hidden = false; return; }
    let sub = 0, n = 0;
    lines.innerHTML = it.map(x => { const p = idx.by[x.sku]; const t = p.price * x.qty; sub += t; n += x.qty;
      return `<div class="line" data-sku="${p.sku}"><img src="/img/p/${p.img}" alt=""><div class="info"><a href="/produs/${p.slug}/">${esc(p.name)}</a><small>${lei(p.price)} / buc.</small><button type="button" class="rm" data-rm>Elimină</button></div><div class="qty"><button type="button" aria-label="Scade cantitatea" data-q="-1">−</button><input type="number" min="1" max="${p.left ?? 99}" value="${x.qty}" aria-label="Cantitate" data-qi><button type="button" aria-label="Crește cantitatea" data-q="1">+</button></div><span class="tot">${lei(t)}</span></div>`; }).join('');
    const ship = sub >= S.freeOver ? 0 : S.ship;
    $('[data-cart-title]').textContent = `Coșul tău · ${n} ${n === 1 ? 'produs' : 'produse'}`;
    $('[data-sum-label]').textContent = `Produse (${n})`;
    $('[data-sum-sub]').textContent = lei(sub);
    $('[data-sum-ship]').textContent = ship ? lei(ship) : 'Gratuit';
    $$('[data-ship-label]').forEach(e => e.textContent = ship ? lei(ship) : 'Gratuit');
    $('[data-sum-total]').textContent = lei(sub + ship);
  };
  lines.addEventListener('click', e => { const l = e.target.closest('.line'); if (!l) return; const sku = l.dataset.sku;
    if (e.target.closest('[data-rm]')) cart.remove(sku);
    const q = e.target.closest('[data-q]'); if (q) { const x = cart.items().find(i => i.sku === sku); cart.setQty(sku, x.qty + parseInt(q.dataset.q, 10)); }
    render(); });
  lines.addEventListener('change', e => { if (e.target.matches('[data-qi]')) { cart.setQty(e.target.closest('.line').dataset.sku, parseInt(e.target.value, 10) || 1); render(); } });
  const tglCo = () => { const on = $('[data-company-toggle]').checked; $('[data-company]').hidden = !on; $$('[data-company] input').forEach(i => i.required = on); };
  // Easybox: harta oficială Sameday când integrarea e activă, altfel câmp text.
  let ebMap = null; const EBK = 'mh-easybox';
  const ebSet = l => {
    const f = { lockerId: l.lockerId, oohType: l.oohType ?? 0, lockerName: l.name || '', lockerAddress: l.address || '', lockerCity: l.city || '', lockerCounty: l.county || '', lockerZip: l.postalCode || '' };
    Object.entries(f).forEach(([k, v]) => co[k].value = v ?? '');
    co.easybox.value = `${f.lockerName} – ${f.lockerAddress}, ${f.lockerCity}`;
    $('[data-eb-name]').textContent = f.lockerName; $('[data-eb-addr]').textContent = `${f.lockerAddress}, ${f.lockerCity}, jud. ${f.lockerCounty}`;
    $('[data-eb-chosen]').hidden = false; $('[data-eb-open]').textContent = 'Schimbă easybox-ul'; $('[data-eb-err]').hidden = true;
    try { localStorage.setItem(EBK, JSON.stringify(l)); } catch {}
  };
  const loadSdk = () => new Promise((ok, no) => { if (window.LockerPlugin) return ok(); const s = document.createElement('script'); s.src = 'https://cdn.sameday.ro/locker-plugin/lockerpluginsdk.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  fetch('/api/easybox').then(r => r.json()).then(c => {
    if (!c.enabled) return; ebMap = c;
    $('[data-eb-map]').hidden = false; $('[data-eb-text]').hidden = true; tglEb();
    try { const l = JSON.parse(localStorage.getItem(EBK) || 'null'); if (l && l.lockerId) ebSet(l); } catch {}
  }).catch(() => {});
  $('[data-eb-open]').addEventListener('click', async () => {
    const b = $('[data-eb-open]'); const t = b.textContent; b.disabled = true; b.textContent = 'Se deschide harta…';
    try {
      await loadSdk();
      const opt = { clientId: ebMap.clientId, apiUsername: ebMap.apiUsername, countryCode: 'RO', langCode: 'ro' };
      // Harta se blochează dacă primește un oraș gol: îl trimitem doar când e completat (altfel județul sau Bucureștiul).
      // Centrul hărții: localitatea scrisă de client (obligatorie, împreună cu județul).
      // Harta Sameday înțelege doar orașul (fără oraș se deschide pe București): fără oraș scris, folosim reședința județului ales.
      const SEAT = {"Alba": "Alba Iulia", "Arad": "Arad", "Argeș": "Pitești", "Bacău": "Bacău", "Bihor": "Oradea", "Bistrița-Năsăud": "Bistrița", "Botoșani": "Botoșani", "Brașov": "Brașov", "Brăila": "Brăila", "București": "București", "Buzău": "Buzău", "Caraș-Severin": "Reșița", "Călărași": "Călărași", "Cluj": "Cluj-Napoca", "Constanța": "Constanța", "Covasna": "Sfântu Gheorghe", "Dâmbovița": "Târgoviște", "Dolj": "Craiova", "Galați": "Galați", "Giurgiu": "Giurgiu", "Gorj": "Târgu Jiu", "Harghita": "Miercurea Ciuc", "Hunedoara": "Deva", "Ialomița": "Slobozia", "Iași": "Iași", "Ilfov": "Voluntari", "Maramureș": "Baia Mare", "Mehedinți": "Drobeta-Turnu Severin", "Mureș": "Târgu Mureș", "Neamț": "Piatra Neamț", "Olt": "Slatina", "Prahova": "Ploiești", "Satu Mare": "Satu Mare", "Sălaj": "Zalău", "Sibiu": "Sibiu", "Suceava": "Suceava", "Teleorman": "Alexandria", "Timiș": "Timișoara", "Tulcea": "Tulcea", "Vaslui": "Vaslui", "Vâlcea": "Râmnicu Vâlcea", "Vrancea": "Focșani"};
      const typed = co.city.value.trim(), county = co.county.value;
      // Nu mai ghicim locația după conexiune (furnizorii rurali apar la zeci de km): cerem județul și localitatea înainte de hartă.
      if (!county || !typed) { const f = !county ? co.county : co.city; f.focus(); f.reportValidity && f.reportValidity(); b.textContent = 'Completează mai întâi județul și localitatea'; setTimeout(() => { b.textContent = t; }, 3500); b.disabled = false; return; }
      opt.city = typed;
      window.LockerPlugin.init(opt);
      if (window.LockerPlugin.options && (window.LockerPlugin.options.city !== opt.city || window.LockerPlugin.options.county !== opt.county)) window.LockerPlugin.reinitializePlugin(opt);
      const p = window.LockerPlugin.getInstance(); p.open();
      p.subscribe(l => { ebSet(l); p.close(); });
    } catch { b.textContent = 'Harta nu s-a putut încărca. Încearcă din nou.'; b.disabled = false; return; }
    b.disabled = false; b.textContent = t;
  });
  const tglEb = () => { const eb = co.delivery.value === 'easybox'; $('[data-easybox]').hidden = !eb; co.easybox.required = eb && !ebMap; $('[data-address]').hidden = eb; co.address.required = !eb; };
  // Produse care nu încap în easybox (mânere lungi, dale etc.): varianta easybox se dezactivează.
  const tglNeb = () => {
    const big = cart.items().filter(x => idx.by[x.sku] && idx.by[x.sku].neb).map(x => idx.by[x.sku].name);
    const r = $('input[name=delivery][value=easybox]'); r.disabled = !!big.length; $('[data-eb-opt]').classList.toggle('is-off', !!big.length);
    $('[data-eb-sub]').textContent = big.length ? 'Indisponibil: ' + (big.length === 1 ? big[0] + ' nu încape' : big.length + ' produse nu încap') + ' în locker' : 'Ridici coletul dintr-un locker';
    if (big.length && r.checked) { $('input[name=delivery][value=address]').checked = true; tglEb(); }
  };
  $('[data-cart-clear]').addEventListener('click', () => { if (confirm('Golești coșul? Toate produsele vor fi scoase.')) { cart.clear(); render(); } });
  $('[data-company-toggle]').addEventListener('change', tglCo); $$('input[name=delivery]').forEach(r => r.addEventListener('change', tglEb));
  render(); tglCo(); tglEb(); tglNeb();
  lines.addEventListener('click', () => setTimeout(tglNeb, 0));
  co.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('[data-form-msg]'); msg.classList.remove('show');
    let bad = null;
    $$('.fl', co).forEach(fl => { const f = $('input,select,textarea', fl); if (!f) return; const inv = !f.closest('[hidden]') && !f.checkValidity(); fl.classList.toggle('invalid', inv); if (inv && !bad) bad = f; });
    if (bad) { bad.focus(); msg.textContent = 'Verifică câmpurile marcate cu roșu.'; msg.classList.add('show'); return; }
    if (ebMap && co.delivery.value === 'easybox' && !co.lockerId.value) { $('[data-eb-err]').hidden = false; $('[data-eb-open]').focus(); msg.textContent = 'Alege easybox-ul de pe hartă.'; msg.classList.add('show'); return; }
    if (!co.terms.checked) { msg.textContent = 'Trebuie să accepți Termenii și condițiile.'; msg.classList.add('show'); return; }
    const fd = Object.fromEntries(new FormData(co).entries());
    fd.items = cart.items(); fd.company = !!co.company.checked; fd.newsletter = !!co.newsletter.checked; fd.terms = true;
    const btn = $('[data-submit]'); btn.disabled = true; btn.textContent = 'Se trimite…';
    try {
      const r = await fetch('/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fd) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && j.stock) { j.stock.forEach(x => { if (idx.by[x.sku]) { idx.by[x.sku].left = x.left; idx.by[x.sku].inStock = x.left > 0; } }); render(); }
      if (!r.ok || !j.ok) throw new Error(j.error || 'Comanda nu a putut fi trimisă.');
      track('purchase', { transaction_id: j.number, value: j.total, currency: 'RON' });
      cart.clear(); location.href = '/comanda-plasata/?nr=' + encodeURIComponent(j.number);
    } catch (err) { msg.textContent = err.message + ' Încearcă din nou sau sună-ne.'; msg.classList.add('show'); btn.disabled = false; btn.textContent = 'Plasează comanda'; }
  });
})();
const ono = $('[data-order-no]'); if (ono) ono.textContent = new URLSearchParams(location.search).get('nr') || '';

/* ---------- cookies + Google ---------- */
let gLoaded = false;
function loadGoogle() {
  if (gLoaded || !(S.ga4 || S.ads)) return; gLoaded = true;
  const id = S.ga4 || S.ads; const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id; document.head.appendChild(s);
  gtag('js', new Date()); if (S.ga4) gtag('config', S.ga4); if (S.ads) gtag('config', S.ads);
}
function consent(all) {
  store.set('consent', { all, t: Date.now() });
  gtag('consent', 'update', { ad_storage: all ? 'granted' : 'denied', ad_user_data: all ? 'granted' : 'denied', ad_personalization: all ? 'granted' : 'denied', analytics_storage: all ? 'granted' : 'denied' });
  if (all) loadGoogle();
}
function track(ev, p) { if (window.gtag && gLoaded) gtag('event', ev, p); }
const ck = $('[data-cookie]'); const c0 = store.get('consent', null);
if (c0) consent(c0.all); else if (ck) ck.classList.add('show');
if (ck) ck.addEventListener('click', e => { const b = e.target.closest('[data-ck]'); if (!b) return; consent(b.dataset.ck === 'all'); ck.classList.remove('show'); });
$$('[data-cookie-settings]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); ck.classList.add('show'); }));

updateCount();

/* ---------- contul clientului ---------- */
const ACC_ST = { noua: ['Primită', 'st-new'], expediata: ['Expediată', 'st-ship'], livrata: ['Livrată', 'st-done'], anulata: ['Anulată', 'st-off'] };
const fdate = iso => new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
const accMe = () => fetch('/api/account/me', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
const acc = $('[data-account]');
if (acc) (async () => {
  const show = sel => ['[data-acc-loading]', '[data-acc-login]', '[data-acc-in]'].forEach(s => $(s).hidden = s !== sel);
  const me = await accMe();
  if (!me) {
    show('[data-acc-login]');
    if (/[?&]e=link/.test(location.search)) $('[data-acc-expired]').hidden = false;
    const f = $('[data-acc-form]'), msg = $('[data-acc-msg]');
    if (S.gid) {
      const gs = document.createElement('script'); gs.src = 'https://accounts.google.com/gsi/client'; gs.async = true;
      gs.onload = () => {
        google.accounts.id.initialize({ client_id: S.gid, ux_mode: 'popup', callback: async r => {
          msg.classList.remove('show');
          const x = await fetch('/api/account/google', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: r.credential }) }).then(z => z.json()).catch(() => ({}));
          if (x.ok) location.reload(); else { msg.textContent = x.error || 'Conectarea cu Google nu a reușit.'; msg.classList.add('show'); }
        } });
        const box = $('[data-google-btn]');
        google.accounts.id.renderButton(box, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'ro', width: Math.min(360, box.parentElement.clientWidth || 360) });
        $('[data-google-wrap]').hidden = false;
      };
      document.head.appendChild(gs);
    }
    try { const pe = store.get('acc-email', ''); if (pe) f.email.value = pe; } catch {}
    f.addEventListener('submit', async e => {
      e.preventDefault(); msg.classList.remove('show');
      const email = f.email.value.trim(), b = $('button', f);
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { msg.textContent = 'Scrie o adresă de email corectă.'; msg.classList.add('show'); f.email.focus(); return; }
      b.disabled = true; b.textContent = 'Se trimite…';
      try {
        const r = await fetch('/api/account/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'Nu am putut trimite linkul. Încearcă din nou.');
        store.set('acc-email', email);
        $('[data-acc-sent-to]').textContent = email; $('[data-acc-form-wrap]').hidden = true; $('[data-acc-sent]').hidden = false;
      } catch (err) { msg.textContent = err.message; msg.classList.add('show'); }
      b.disabled = false; b.textContent = 'Trimite-mi linkul';
    });
    $('[data-acc-again]').addEventListener('click', () => { $('[data-acc-sent]').hidden = true; $('[data-acc-form-wrap]').hidden = false; f.email.focus(); });
    return;
  }
  if (location.search) history.replaceState(null, '', '/cont/');
  show('[data-acc-in]');
  $('[data-acc-email]').textContent = me.email;
  const idx = await catalog();
  const box = $('[data-acc-orders]');
  box.innerHTML = me.orders.length ? me.orders.map(o => {
    const [lbl, cls] = ACC_ST[o.status] || [o.status, ''];
    const can = o.items.some(i => idx.by[i.sku] && idx.by[i.sku].inStock);
    return `<article class="acc-order">
      <header><div><strong>Comanda ${esc(o.number)}</strong><small>${fdate(o.created_at)}</small></div><span class="acc-st ${cls}">${lbl}</span></header>
      <ul>${o.items.map(i => `<li>${i.img ? `<img src="${esc(i.img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<div>${i.url ? `<a href="${esc(i.url)}">${esc(i.name)}</a>` : esc(i.name)}${i.opt ? `<small>${esc(i.opt)}</small>` : ''}</div><span class="q">${i.qty} buc.</span></li>`).join('')}</ul>
      <footer><div><span class="acc-total">${lei(o.total)}</span><small>${o.delivery === 'easybox' ? 'Easybox' : 'Curier'}${o.where ? ': ' + esc(o.where) : ''}</small></div>
        <div class="acc-act">${o.track ? `<a class="btn btn-ghost" href="${esc(o.track)}" target="_blank" rel="noopener">Urmărește coletul</a>` : ''}${can ? `<button class="btn" type="button" data-reorder="${esc(o.number)}">Comandă din nou</button>` : ''}</div></footer>
    </article>`; }).join('') : '<div class="empty">Nu avem încă nicio comandă pe această adresă de email. <a href="/">Vezi produsele</a></div>';
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-reorder]'); if (!b) return;
    const o = me.orders.find(x => x.number === b.dataset.reorder); let n = 0;
    o.items.forEach(i => { if (idx.by[i.sku] && idx.by[i.sku].inStock) { cart.add(i.sku, i.qty); n++; } });
    if (n) location.href = '/cos/'; else toast('Produsele din această comandă nu mai sunt în stoc.');
  });
  const p = me.profile;
  if (p && p.name) {
    $('[data-acc-profile]').hidden = false;
    $('[data-acc-profile-body]').innerHTML = `<p><strong>${esc(p.name)}</strong><br>${esc(p.phone || '')}<br>${esc(p.address || '')}${p.address ? '<br>' : ''}${esc(p.city || '')}${p.county ? ', jud. ' + esc(p.county) : ''}${p.zip ? ' · ' + esc(p.zip) : ''}${p.locker ? `<br>Ultimul easybox: ${esc(p.locker.name)}` : ''}</p>`;
  }
  $('[data-acc-logout]').addEventListener('click', async () => { await fetch('/api/account/logout', { method: 'POST' }); location.href = '/cont/'; });
})();

// Precompletare la comandă pentru clientul conectat (doar câmpurile goale).
const coF = $('[data-checkout]');
if (coF) accMe().then(me => {
  if (!me || !me.profile) return;
  const p = me.profile, set = (n, v) => { const el = coF[n]; if (el && v && !el.value) { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); } };
  ['name', 'phone', 'email', 'county', 'city', 'zip', 'address'].forEach(k => set(k, p[k]));
  if (p.locker && p.locker.lockerId) { try { if (!store.get('mh-easybox', null)) store.set('mh-easybox', p.locker); } catch {} }
  const h = $('[data-ship-h]'); if (h && !$('.acc-hint')) h.insertAdjacentHTML('afterend', `<p class="acc-hint">Ești conectat cu ${esc(me.email)}. Am completat datele din ultima comandă.</p>`);
});
})();
