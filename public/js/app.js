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
    const by = {}; list.forEach(p => { if (p.sku in st) { p.left = st[p.sku]; p.inStock = st[p.sku] > 0; } by[p.sku] = p; p._n = norm([p.name, p.cat, p.sub || '', p.sku].join(' ')); p._w = p._n.split(/\s+/).filter(Boolean); });
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
const SYN = {}; (S.syn || []).forEach(g => g.forEach(w => SYN[norm(w)] = g.map(norm)));
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
function tokenScore(t, words) {
  const alts = SYN[t] || [t]; let best = 0, fixed = null;
  for (const a of alts) for (const w of words) {
    let s = 0, fuzzy = false;
    if (w === a) s = 4; else if (w.startsWith(a)) s = 3; else if (a.length >= 3 && w.includes(a)) s = 2;
    else if (a.length >= 4) { const pre = w.slice(0, Math.max(a.length, 4)); const tol = a.length >= 7 ? 2 : 1; if (lev(a, pre) <= tol || lev(a, w) <= tol) { s = 1.5; fuzzy = true; } }
    if (a !== t && s) s -= .3;
    if (s > best) { best = s; fixed = fuzzy ? w : null; }
  }
  return [best, fixed];
}
function search(idx, q) {
  const toks = norm(q).split(' ').filter(t => t.length > 1);
  if (!toks.length) return { res: [], fix: null };
  const out = []; const fixes = {};
  for (const p of idx.list) {
    let tot = 0, ok = 0;
    for (const t of toks) { const [s, f] = tokenScore(t, p._w); if (s) { ok++; tot += s; if (f) fixes[t] = f; } }
    if (ok === toks.length || (toks.length > 2 && ok >= toks.length - 1)) out.push({ p, s: tot + (p.inStock ? .5 : 0) });
  }
  out.sort((a, b) => b.s - a.s);
  const fixedQ = Object.keys(fixes).length ? toks.map(t => fixes[t] || t).join(' ') : null;
  return { res: out.map(x => x.p), fix: fixedQ };
}
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
  const tglEb = () => { const eb = co.delivery.value === 'easybox'; $('[data-easybox]').hidden = !eb; co.easybox.required = eb; $('[data-address]').hidden = eb; co.address.required = !eb; };
  $('[data-company-toggle]').addEventListener('change', tglCo); $$('input[name=delivery]').forEach(r => r.addEventListener('change', tglEb));
  render(); tglCo(); tglEb();
  co.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = $('[data-form-msg]'); msg.classList.remove('show');
    let bad = null;
    $$('.fl', co).forEach(fl => { const f = $('input,select,textarea', fl); if (!f) return; const inv = !f.closest('[hidden]') && !f.checkValidity(); fl.classList.toggle('invalid', inv); if (inv && !bad) bad = f; });
    if (bad) { bad.focus(); msg.textContent = 'Verifică câmpurile marcate cu roșu.'; msg.classList.add('show'); return; }
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
})();
