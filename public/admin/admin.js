(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lei = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' lei';
const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const toast = m => { const t = $('[data-toast]'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3500); };

async function api(path, opt = {}) {
  const o = { method: 'GET', ...opt, headers: { 'x-admin': '1', ...(opt.headers || {}) } };
  if (opt.json !== undefined) { o.body = JSON.stringify(opt.json); o.headers['content-type'] = 'application/json'; }
  const r = await fetch('/api/admin/' + path, o);
  const j = await r.json().catch(() => ({ ok: false, error: 'Răspuns invalid de la server.' }));
  if (r.status === 401 && j.auth === false) { showLogin(); throw new Error('Sesiunea a expirat. Intră din nou.'); }
  if (!r.ok || !j.ok) throw new Error(j.error || 'Eroare ' + r.status);
  return j;
}

/* ---------- login ---------- */
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#loginForm [name=password]').focus(); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, msg = $('#loginMsg'); msg.classList.remove('show');
  try { await api('login', { method: 'POST', json: { password: f.password.value, code: f.code.value } }); f.reset(); start(); }
  catch (err) { msg.textContent = err.message; msg.classList.add('show'); }
});
$('#logout').addEventListener('click', async () => { if (dirty() && !confirm('Ai modificări nesalvate. Ieși oricum?')) return; await api('logout', { method: 'POST' }).catch(() => {}); location.reload(); });

/* ---------- stare ---------- */
let D = null, ORIG = null, pDirty = false, sDirty = false, localImg = {};
const dirty = () => pDirty || sDirty;
function markDirty(kind) { if (kind === 'p') pDirty = true; else sDirty = true; $('#savebar').hidden = false; $('#deployNote').hidden = true; }
window.addEventListener('beforeunload', e => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
const catName = slug => (D.site.categories.find(c => c.slug === slug) || {}).name || slug;
const imgUrl = (n, kind = 'p') => localImg[n] || `/img/${kind}/${n}`;

async function start() {
  $('#login').hidden = true; $('#app').hidden = false;
  try { await loadData(); } catch (e) { toast(e.message); }
  loadSameday();
}
async function loadData() {
  D = await api('data'); ORIG = JSON.stringify({ p: D.products, s: D.site }); pDirty = sDirty = false; $('#savebar').hidden = true;
  renderProducts(); renderHome(); renderSearch();
}
$('#discard').addEventListener('click', () => { if (!confirm('Renunți la toate modificările nesalvate?')) return; const o = JSON.parse(ORIG); D.products = o.p; D.site = o.s; pDirty = sDirty = false; $('#savebar').hidden = true; renderProducts(); renderHome(); renderSearch(); });
$('#save').addEventListener('click', async () => {
  const b = $('#save'); b.disabled = true; b.textContent = 'Se salvează…';
  try {
    readSearch();
    if (pDirty) { const r = await api('products', { method: 'PUT', json: { products: D.products, sha: D.productsSha, message: 'actualizare produse' } }); D.productsSha = r.sha; }
    if (sDirty) { const r = await api('site', { method: 'PUT', json: { site: D.site, sha: D.siteSha, message: 'setări prima pagină / căutare' } }); D.siteSha = r.sha; }
    ORIG = JSON.stringify({ p: D.products, s: D.site }); pDirty = sDirty = false; $('#savebar').hidden = true; $('#deployNote').hidden = false;
    $$('.prow.dirty').forEach(r => r.classList.remove('dirty'));
  } catch (e) { toast(e.message); }
  b.disabled = false; b.textContent = 'Salvează pe site';
});

/* ---------- taburi ---------- */
$$('[data-tab]').forEach(t => t.addEventListener('click', () => {
  $$('[data-tab]').forEach(x => x.setAttribute('aria-selected', x === t)); $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== t.dataset.tab);
  if (t.dataset.tab === 'home') renderFeat();
}));

/* ---------- comenzi ---------- */
const trackUrl = awb => ((D && D.site.shipping && D.site.shipping.trackingUrl) || 'https://sameday.ro/status-colet/?awb={awb}').replace('{awb}', encodeURIComponent(awb));
const ST = { noua: 'Nouă', expediata: 'Expediată', livrata: 'Livrată', anulata: 'Anulată' };
let ordFilter = 'noua', ordList = [], SD = { ready: false };
async function loadSameday() {
  try { SD = await api('sameday'); } catch { SD = { ready: false }; }
  if (SD.ready && !SD.error) { try { const r = await api('sameday/sync', { method: 'POST' }); if (r.delivered) toast(`${r.delivered} ${r.delivered === 1 ? 'comandă a fost livrată' : 'comenzi au fost livrate'} (actualizat din Sameday).`); } catch {} }
  loadOrders();
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function renderOrders() {
  const q = norm($('#ordSearch').value).trim(), qd = q.replace(/\D/g, '');
  const list = q ? ordList.filter(o => norm([o.number, o.name, o.email, o.city, o.county, o.awb].join(' ')).includes(q) || (qd.length >= 4 && String(o.phone).replace(/\D/g, '').includes(qd))) : ordList;
  $('#orders').innerHTML = list.length ? list.map(orderHtml).join('') : `<div class="empty">${q ? 'Nicio comandă găsită.' : 'Nicio comandă aici.'}</div>`;
}
const addrText = o => [o.name, o.phone, o.delivery === 'easybox' ? 'Easybox: ' + o.easybox : o.address, o.city + ', jud. ' + o.county + (o.zip ? ', ' + o.zip : ''), o.payment === 'cod' ? 'Ramburs: ' + lei(o.total) : 'Plătit prin transfer'].join('\n');
async function loadOrders() {
  try {
    const j = await api('orders' + (ordFilter ? '?status=' + ordFilter : ''));
    const cnt = Object.fromEntries(j.counts.map(c => [c.status, c.n])); const all = j.counts.reduce((a, c) => a + c.n, 0);
    $('#newCount').hidden = !cnt.noua; $('#newCount').textContent = cnt.noua || '';
    $('#orderFilters').innerHTML = [['noua', 'Noi'], ['expediata', 'Expediate'], ['livrata', 'Livrate'], ['anulata', 'Anulate'], ['', 'Toate']]
      .map(([k, l]) => `<button class="chip" data-of="${k}" style="${k === ordFilter ? 'background:var(--green);color:var(--cream);border-color:var(--green)' : ''}">${l} (${k ? cnt[k] || 0 : all})</button>`).join('');
    ordList = j.orders; renderOrders();
  } catch (e) { $('#orders').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function orderHtml(o) {
  const d = new Date(o.created_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const lk = o.locker_json ? JSON.parse(o.locker_json) : null;
  const where = o.delivery === 'easybox' ? (lk ? `<span class="eb-tag">${lk.oohType == 1 ? 'Punct PUDO' : 'Easybox'}</span> ${esc(lk.name)}<br>${esc(lk.address)}<br>${esc(lk.city)}, jud. ${esc(lk.county)}` : `Easybox (scris de client): ${esc(o.easybox)}<br>${esc(o.city)}, jud. ${esc(o.county)}`) : `${esc(o.address)}<br>${esc(o.city)}, jud. ${esc(o.county)} ${esc(o.zip || '')}`;
  const wa = String(o.phone).replace(/\D/g, '').replace(/^0/, '40');
  return `<article class="ord" data-id="${o.id}">
    <div class="ord-h"><span class="st ${o.status}">${ST[o.status] || o.status}</span><strong>${esc(o.number)}</strong><span class="hint">${d}</span><span class="tot">${lei(o.total)}</span></div>
    <div class="ord-grid">
      <div><b>Client</b>${esc(o.name)}<br><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a><br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${o.company_name ? `<br>Firmă: ${esc(o.company_name)} (${esc(o.company_cui)})` : ''}</div>
      <div><b>Livrare</b>${where}</div>
      <div><b>Plată</b>${o.payment === 'cod' ? 'Ramburs, la livrare' : 'Transfer bancar'}<br>Transport: ${o.shipping ? lei(o.shipping) : 'gratuit'}${o.newsletter ? '<br>Acceptă oferte pe email' : ''}</div>
    </div>
    ${o.notes ? `<div class="hint">Observații client: ${esc(o.notes)}</div>` : ''}
    <div class="ord-items">${o.items.map(i => `<div><span>${i.qty} × ${esc(i.name)} <small class="hint">(${esc(i.sku)})</small></span><span>${lei(i.total)}</span></div>`).join('')}</div>
    ${SD.ready && !o.awb && o.status !== 'anulata' ? `<div class="ord-sd"><button class="btn" data-mkawb>Emite AWB Sameday</button><span class="hint">Eticheta PDF și emailul cu urmărirea pleacă automat.</span><button class="link" data-copy>Copiază datele pentru AWB</button></div>` : ''}
    ${SD.ready && o.awb ? `<div class="ord-sd"><a class="btn btn-ghost" href="/api/admin/orders/${o.id}/label" target="_blank" rel="noopener">Etichetă PDF (A6)</a><a class="link" href="/api/admin/orders/${o.id}/label?size=A4" target="_blank" rel="noopener">A4</a>${o.awb_status ? `<span class="hint">Sameday: ${esc(o.awb_status)}</span>` : ''}${o.status === 'expediata' ? '<button class="link danger" data-delawb>Anulează AWB</button>' : ''}</div>` : ''}
    ${!SD.ready && o.status === 'noua' ? '<div class="ord-sd"><button class="link" data-copy>Copiază datele pentru AWB</button></div>' : ''}
    <div class="ord-act">
      <input class="field" placeholder="${SD.ready ? 'AWB introdus manual (opțional)' : 'Număr AWB'}" value="${esc(o.awb || '')}" data-awb>
      ${o.status !== 'expediata' ? '<button class="btn" data-set="expediata">Expediată</button>' : ''}
      ${o.status !== 'livrata' ? '<button class="btn btn-ghost" data-set="livrata">Livrată</button>' : ''}
      ${o.status !== 'anulata' ? '<button class="btn btn-ghost" data-set="anulata">Anulează</button>' : ''}
      ${o.status !== 'noua' ? '<button class="link" data-set="noua">Înapoi la „Nouă”</button>' : ''}
    </div>
    ${o.awb ? `<div class="hint">AWB ${esc(o.awb)} · <a href="${esc(trackUrl(o.awb))}" target="_blank" rel="noopener">Urmărește coletul</a>${o.awb_notified_at ? ` · email de urmărire trimis clientului (${new Date(o.awb_notified_at).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}) <button class="link" data-resend>Retrimite</button>` : o.status === 'expediata' ? ' · emailul de urmărire nu a fost trimis' : ''}</div>` : `<div class="hint">Pune AWB-ul și apasă „Expediată”: clientul primește automat emailul cu linkul de urmărire.</div>`}
  </article>`;
}
$('#orderFilters').addEventListener('click', e => { const b = e.target.closest('[data-of]'); if (b) { ordFilter = b.dataset.of; loadOrders(); } });
$('#reloadOrders').addEventListener('click', loadOrders);
$('#ordSearch').addEventListener('input', renderOrders);
let awbFor = null;
const kgOf = o => { const t = o.items.reduce((a, i) => { let w = Number(i.w) || 0; if (w > 30) w = w / 1000; return a + (w || 0.5) * i.qty; }, 0); return Math.max(0.5, Math.round((t + 0.2) * 10) / 10); };
$('#orders').addEventListener('click', async e => {
  const mk = e.target.closest('[data-mkawb]'), del = e.target.closest('[data-delawb]'), cp = e.target.closest('[data-copy]'); if (!mk && !del && !cp) return;
  const o = ordList.find(x => String(x.id) === e.target.closest('.ord').dataset.id);
  if (cp) { try { await navigator.clipboard.writeText(addrText(o)); toast('Copiat. Lipește în formularul Sameday.'); } catch { prompt('Copiază:', addrText(o).replace(/\n/g, ' | ')); } return; }
  if (del) {
    if (!confirm(`Anulezi AWB-ul ${o.awb} la Sameday? Comanda revine la „Nouă”.`)) return;
    try { await api(`orders/${o.id}/awb`, { method: 'DELETE' }); toast('AWB anulat.'); loadOrders(); } catch (err) { toast(err.message); } return;
  }
  awbFor = o; const f = $('#awbForm'); const n = o.items.reduce((a, i) => a + i.qty, 0);
  f.weight.value = kgOf(o); f.parcels.value = 1; f.cod.value = o.payment === 'cod' ? o.total.toFixed(2) : 0; f.observation.value = '';
  const lk = o.locker_json ? JSON.parse(o.locker_json) : null;
  $('#awbWho').innerHTML = `<b>${esc(o.number)}</b> · ${esc(o.name)} · ${n} buc. · ${o.delivery === 'easybox' ? (lk ? 'easybox ' + esc(lk.name) : '<span style="color:#B42318">easybox fără locker ales de pe hartă</span>') : esc(o.city)}`;
  const code = o.delivery === 'easybox' ? (lk && lk.oohType == 1 ? 'PP' : 'LN') : '24'; const sv = (SD.services || []).find(x => x.code === code); const pt = (SD.points || []).find(x => x.isDefault) || (SD.points || [])[0];
  $('#awbSvc').textContent = SD.error ? 'Atenție: ' + SD.error : (sv ? 'Serviciu: ' + sv.name : 'Serviciu: ' + code) + (pt ? ' · ridicare de la: ' + (pt.alias || pt.address) : '') + (SD.test ? ' · SERVER DE TEST' : '');
  $('#awbMsg').classList.remove('show'); $('#awbDlg').showModal();
});
$('#awbForm').addEventListener('submit', async e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault(); const f = e.target, b = $('#awbGo'); b.disabled = true; b.textContent = 'Se emite…';
  try {
    const r = await api(`orders/${awbFor.id}/awb`, { method: 'POST', json: { weight: +f.weight.value, parcels: +f.parcels.value, cod: +f.cod.value, observation: f.observation.value } });
    $('#awbDlg').close(); toast(`AWB ${r.awb} emis.` + (r.mailed ? ' Clientul a primit emailul cu urmărirea.' : ''));
    window.open(`/api/admin/orders/${awbFor.id}/label`, '_blank'); loadOrders();
  } catch (err) { $('#awbMsg').textContent = err.message; $('#awbMsg').classList.add('show'); }
  b.disabled = false; b.textContent = 'Emite AWB';
});
$('#orders').addEventListener('click', async e => {
  const b = e.target.closest('[data-set]'); if (!b) return; const card = b.closest('.ord');
  if (b.dataset.set === 'anulata' && !confirm('Anulezi comanda?')) return;
  const awb = $('[data-awb]', card).value.trim();
  if (b.dataset.set === 'expediata' && !awb && !confirm('Nu ai completat AWB-ul. Marchezi totuși comanda ca expediată (fără email de urmărire)?')) return;
  try { const r = await api('orders/' + card.dataset.id, { method: 'PATCH', json: { status: b.dataset.set, awb } }); toast(mailMsg(r) || 'Comanda a fost actualizată.'); loadOrders(); } catch (err) { toast(err.message); }
});
const mailMsg = r => r.mailed ? 'Gata. Clientul a primit emailul cu AWB-ul și linkul de urmărire.' : (r.mailConfigured === false ? 'Salvat. Emailurile automate nu sunt încă activate.' : '');
$('#orders').addEventListener('click', async e => {
  const b = e.target.closest('[data-resend]'); if (!b) return; const card = b.closest('.ord');
  try { const r = await api('orders/' + card.dataset.id, { method: 'PATCH', json: { resend: true } }); toast(mailMsg(r) || 'Emailul nu a putut fi trimis.'); loadOrders(); } catch (err) { toast(err.message); }
});
$('#orders').addEventListener('change', async e => {
  if (!e.target.matches('[data-awb]')) return; const card = e.target.closest('.ord');
  try { const r = await api('orders/' + card.dataset.id, { method: 'PATCH', json: { awb: e.target.value } }); toast(mailMsg(r) || 'AWB salvat.'); loadOrders(); } catch (err) { toast(err.message); }
});
setInterval(() => { if (!$('#app').hidden && !document.hidden) loadOrders(); }, 120000);

/* ---------- produse ---------- */
function renderProducts() {
  const cs = $('#pCat'); cs.innerHTML = '<option value="">Toate categoriile</option>' + D.site.categories.map(c => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
  $('#pdCat').innerHTML = D.site.categories.map(c => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
  $('#subs').innerHTML = [...new Set(D.products.map(p => p.sub).filter(Boolean))].map(s => `<option value="${esc(s)}">`).join('');
  listProducts();
}
function rowHtml(p, i) {
  return `<div class="prow" data-i="${i}">
    <img src="${esc(imgUrl(p.images[0]))}" alt="" loading="lazy">
    <div class="pn" data-edit><strong>${esc(p.name)}</strong><small>${esc(catName(p.category))}${p.sub ? ' · ' + esc(p.sub) : ''} · cod ${esc(p.sku)}</small></div>
    <span class="pp">${lei(p.price)}${p.oldPrice ? `<s>${lei(p.oldPrice)}</s>` : ''}</span>
    <button class="stockbtn${p.inStock ? '' : ' out'}" data-stock title="Schimbă stocul">${p.inStock ? (p.stock ? 'Stoc: ' + p.stock : 'În stoc') : 'Epuizat'}</button>
    <button class="iconbtn${p.featured ? ' on' : ''}" data-feat title="${p.featured ? 'Scoate din carusel' : 'Pune în caruselul de pe prima pagină'}" aria-label="Carusel">★</button>
  </div>`;
}
function listProducts() {
  const q = slugify($('#pSearch').value).replace(/-/g, ' '), c = $('#pCat').value, f = $('#pFilter').value;
  const rows = D.products.map((p, i) => [p, i]).filter(([p]) => (!c || p.category === c) && (!f || (f === 'out' && !p.inStock) || (f === 'feat' && p.featured) || (f === 'sale' && p.oldPrice))
    && (!q || slugify(p.name + ' ' + p.sku).replace(/-/g, ' ').includes(q)));
  $('#plist').innerHTML = rows.length ? rows.map(([p, i]) => rowHtml(p, i)).join('') : '<div class="empty">Niciun produs.</div>';
}
['#pSearch', '#pCat', '#pFilter'].forEach(s => $(s).addEventListener('input', listProducts));
$('#plist').addEventListener('click', e => {
  const row = e.target.closest('.prow'); if (!row) return; const p = D.products[row.dataset.i];
  if (e.target.closest('[data-stock]')) { p.inStock = !p.inStock; p.stock = p.inStock ? null : 0; markDirty('p'); row.outerHTML = rowHtml(p, row.dataset.i); $(`.prow[data-i="${row.dataset.i}"]`).classList.add('dirty'); return; }
  if (e.target.closest('[data-feat]')) { p.featured = !p.featured; if (p.featured) p.featuredOrder = Math.max(0, ...D.products.map(x => x.featuredOrder || 0)) + 1; markDirty('p'); row.outerHTML = rowHtml(p, row.dataset.i); $(`.prow[data-i="${row.dataset.i}"]`).classList.add('dirty'); return; }
  if (e.target.closest('[data-edit]') || e.target.tagName === 'IMG') openEditor(+row.dataset.i);
});

/* ---------- editor produs ---------- */
const dlg = $('#pdlg'), pf = $('#pform'); let editIdx = null, editImgs = [];
function openEditor(i) {
  editIdx = i; const isNew = i === null; const p = isNew ? { name: '', price: '', oldPrice: '', sku: '', slug: '', category: $('#pCat').value || D.site.categories[0].slug, sub: '', inStock: true, stock: null, featured: false, short: '', description: '', images: [], weight: null } : D.products[i];
  $('#pdlgTitle').textContent = isNew ? 'Produs nou' : 'Editează produsul';
  for (const k of ['name', 'price', 'oldPrice', 'sku', 'slug', 'category', 'sub', 'short']) pf[k].value = p[k] ?? '';
  pf.stock.value = p.inStock ? (p.stock ?? '') : 0;
  pf.weightG.value = p.weight ? Math.round(p.weight * 1000) : '';
  pf.featured.checked = !!p.featured; pf.noEasybox.checked = !!p.noEasybox; $('#pdesc').innerHTML = p.description || '';
  editImgs = p.images.slice(); drawImgs(); $('#pdel').hidden = isNew; $('#pmsg').classList.remove('show');
  pf.dataset.new = isNew ? '1' : ''; dlg.showModal();
}
pf.name.addEventListener('input', () => { if (pf.dataset.new && !pf.dataset.slugTouched) { pf.slug.value = slugify(pf.name.value); if (!pf.sku.dataset.touched) pf.sku.value = ''; } });
pf.slug.addEventListener('input', () => pf.dataset.slugTouched = '1');
function drawImgs() {
  $('#pimgs').innerHTML = editImgs.map((n, k) => n.startsWith('…') ? `<figure class="busy">${esc(n)}</figure>` :
    `<figure><img src="${esc(imgUrl(n))}" alt=""><div class="ia"><button type="button" data-mv="${k}" title="Mută la stânga" aria-label="Mută la stânga">‹</button><button type="button" data-rm="${k}" title="Șterge" aria-label="Șterge poza">✕</button></div></figure>`).join('');
}
$('#pimgs').addEventListener('click', e => {
  const m = e.target.closest('[data-mv]'), r = e.target.closest('[data-rm]');
  if (m) { const k = +m.dataset.mv; if (k > 0) [editImgs[k - 1], editImgs[k]] = [editImgs[k], editImgs[k - 1]]; drawImgs(); }
  if (r) { editImgs.splice(+r.dataset.rm, 1); drawImgs(); }
});
$('#pupload').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  for (const f of files) {
    const tmp = '…se încarcă'; editImgs.push(tmp); drawImgs();
    try { const name = await uploadImage(f, 'p', pf.slug.value || slugify(pf.name.value) || 'produs'); editImgs[editImgs.indexOf(tmp)] = name; }
    catch (err) { editImgs.splice(editImgs.indexOf(tmp), 1); toast(err.message); }
    drawImgs();
  }
});
$$('.rte-bar button').forEach(b => b.addEventListener('click', () => { $('#pdesc').focus(); document.execCommand(b.dataset.cmd, false, b.dataset.arg || null); }));
$('#pdesc').addEventListener('paste', e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
pf.addEventListener('submit', e => {
  if (e.submitter && e.submitter.value === 'cancel') return;
  e.preventDefault(); const msg = $('#pmsg'); msg.classList.remove('show');
  const err = t => { msg.textContent = t; msg.classList.add('show'); };
  if (editImgs.some(n => n.startsWith('…'))) return err('Așteaptă să se încarce pozele.');
  const price = parseFloat(pf.price.value), old = parseFloat(pf.oldPrice.value);
  if (!pf.name.value.trim()) return err('Completează numele.');
  if (!(price > 0)) return err('Completează un preț valid.');
  if (!pf.sku.value.trim()) return err('Completează codul produsului.');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(pf.slug.value)) return err('Adresa paginii poate conține doar litere mici, cifre și cratimă.');
  if (!editImgs.length) return err('Adaugă cel puțin o poză.');
  const dupe = D.products.find((x, i) => i !== editIdx && (x.sku === pf.sku.value.trim() || x.slug === pf.slug.value));
  if (dupe) return err(`Codul sau adresa sunt deja folosite la „${dupe.name}”.`);
  const p = editIdx === null ? {} : D.products[editIdx];
  Object.assign(p, { name: pf.name.value.trim(), price, oldPrice: old > price ? old : null, sku: pf.sku.value.trim(), slug: pf.slug.value, category: pf.category.value,
    categoryName: catName(pf.category.value), sub: pf.sub.value.trim() || null, short: pf.short.value.trim(),
    stock: pf.stock.value === '' ? null : Math.max(0, parseInt(pf.stock.value, 10) || 0),
    description: $('#pdesc').innerHTML, images: editImgs.slice(), weight: pf.weightG.value ? Math.round(parseFloat(pf.weightG.value)) / 1000 : null });
  p.inStock = p.stock === null || p.stock > 0;
  if (pf.featured.checked && !p.featured) p.featuredOrder = Math.max(0, ...D.products.map(x => x.featuredOrder || 0)) + 1;
  p.featured = pf.featured.checked; p.noEasybox = pf.noEasybox.checked;
  if (editIdx === null) D.products.push(p);
  markDirty('p'); dlg.close(); renderProducts(); toast('Modificare aplicată. Apasă „Salvează pe site” ca să apară pe site.');
});
$('#pdel').addEventListener('click', () => { if (!confirm('Ștergi definitiv produsul de pe site?')) return; D.products.splice(editIdx, 1); markDirty('p'); dlg.close(); renderProducts(); });
$('#newProduct').addEventListener('click', () => { pf.dataset.slugTouched = ''; openEditor(null); });

/* ---------- încărcare poze (redimensionate în browser) ---------- */
async function uploadImage(file, kind, base) {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('Fișierul nu este o imagine validă.'); });
  const c = document.createElement('canvas'), x = c.getContext('2d');
  if (kind === 'p') { const s = Math.max(bmp.width, bmp.height), S = Math.round(s * 1.12), T = Math.min(1000, S); c.width = c.height = T; x.fillStyle = '#fff'; x.fillRect(0, 0, T, T); const k = T / S; x.drawImage(bmp, (T - bmp.width * k) / 2, (T - bmp.height * k) / 2, bmp.width * k, bmp.height * k); }
  else { const k = Math.min(1, 1600 / bmp.width); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); x.drawImage(bmp, 0, 0, c.width, c.height); }
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .86));
  const fd = new FormData(); fd.append('file', blob, 'poza.jpg'); fd.append('kind', kind); fd.append('name', base);
  const j = await api('upload', { method: 'POST', body: fd });
  localImg[j.name] = URL.createObjectURL(blob);
  return j.name;
}

/* ---------- prima pagină ---------- */
const getP = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);
const setP = (o, path, v) => { const ks = path.split('.'); let a = o; ks.slice(0, -1).forEach(k => a = a[k] = a[k] || {}); a[ks[ks.length - 1]] = v; };
const siteImg = v => v ? (localImg[v.split('/').pop()] || v) : '';
function renderHome() {
  $$('[data-s]').forEach(i => i.value = getP(D.site, i.dataset.s) ?? '');
  $$('[data-s-img]').forEach(i => i.src = siteImg(getP(D.site, i.dataset.sImg)));
  $('#perks').innerHTML = D.site.perks.map((p, k) => `<label class="fl">Avantaj ${k + 1}<input class="field" data-perk="${k}" data-f="t" value="${esc(p.t)}"><input class="field" data-perk="${k}" data-f="d" value="${esc(p.d)}" style="margin-top:6px"></label>`).join('');
  $('#catEdit').innerHTML = D.site.categories.map((c, k) => `<div class="catrow"><div><img src="${esc(siteImg(c.image) || '/img/p/' + ((D.products.find(p => p.category === c.slug) || {}).images || [''])[0])}" alt=""><label class="link" style="display:inline-block">Schimbă poza<input type="file" accept="image/*" hidden data-cat-img="${k}"></label></div>
    <div style="display:flex;flex-direction:column;gap:8px"><label class="fl">Nume<input class="field" data-cat="${k}" data-f="name" value="${esc(c.name)}"></label><label class="fl">Text introductiv<textarea class="field" rows="2" data-cat="${k}" data-f="intro">${esc(c.intro)}</textarea></label></div></div>`).join('');
  renderFeat();
}
function renderFeat() {
  if (!D) return; const f = D.products.filter(p => p.featured).sort((a, b) => (a.featuredOrder || 0) - (b.featuredOrder || 0));
  $('#featList').innerHTML = f.length ? f.map((p, k) => `<div class="prow"><img src="${esc(imgUrl(p.images[0]))}" alt=""><div class="pn"><strong>${esc(p.name)}</strong><small>${lei(p.price)}</small></div>
    <button class="iconbtn" data-fup="${esc(p.sku)}" ${k ? '' : 'disabled'} aria-label="Mai sus">↑</button><button class="iconbtn" data-fdn="${esc(p.sku)}" ${k < f.length - 1 ? '' : 'disabled'} aria-label="Mai jos">↓</button></div>`).join('')
    : '<p class="hint">Niciun produs ales. Apasă steluța din tabul Produse.</p>';
}
$('#featList').addEventListener('click', e => {
  const b = e.target.closest('[data-fup],[data-fdn]'); if (!b) return;
  const f = D.products.filter(p => p.featured).sort((a, b) => (a.featuredOrder || 0) - (b.featuredOrder || 0));
  const k = f.findIndex(p => p.sku === (b.dataset.fup || b.dataset.fdn)), j = b.dataset.fup ? k - 1 : k + 1;
  [f[k], f[j]] = [f[j], f[k]]; f.forEach((p, n) => p.featuredOrder = n + 1); markDirty('p'); renderFeat();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.s) { setP(D.site, t.dataset.s, t.hasAttribute('data-num') ? parseFloat(t.value) || 0 : t.value); markDirty('s'); }
  if (t.dataset.perk) { D.site.perks[t.dataset.perk][t.dataset.f] = t.value; markDirty('s'); }
  if (t.dataset.cat) { D.site.categories[t.dataset.cat][t.dataset.f] = t.value; markDirty('s'); }
  if (t.id === 'popular' || t.id === 'synonyms') markDirty('s');
});
document.addEventListener('change', async e => {
  const t = e.target; if (!(t.dataset.uploadSite || t.dataset.catImg) || !t.files[0]) return;
  try {
    toast('Se încarcă poza…');
    const name = await uploadImage(t.files[0], 'site', 'banner');
    if (t.dataset.uploadSite) setP(D.site, t.dataset.uploadSite, '/img/site/' + name); else D.site.categories[t.dataset.catImg].image = '/img/site/' + name;
    markDirty('s'); renderHome(); toast('Poza a fost încărcată. Apasă „Salvează pe site”.');
  } catch (err) { toast(err.message); }
  t.value = '';
});

/* ---------- căutare ---------- */
function renderSearch() { $('#popular').value = (D.site.popularSearches || []).join(', '); $('#synonyms').value = (D.site.synonyms || []).map(g => g.join(', ')).join('\n'); }
function readSearch() {
  if (!sDirty) return;
  D.site.popularSearches = $('#popular').value.split(',').map(s => s.trim()).filter(Boolean);
  D.site.synonyms = $('#synonyms').value.split('\n').map(l => l.split(',').map(s => s.trim()).filter(Boolean)).filter(g => g.length > 1);
}

/* ---------- pornire ---------- */
fetch('/api/admin/data', { headers: { 'x-admin': '1' } }).then(r => r.status === 401 ? showLogin() : start()).catch(showLogin);
})();
