// Validare și curățare a datelor trimise din panou, înainte de salvare.
const ALLOWED = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'h3', 'h4'];
export function cleanHtml(h) {
  h = String(h || '').slice(0, 20000);
  h = h.replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, '');
  h = h.replace(/<(\/?)(b)(\s[^>]*)?>/gi, '<$1strong>').replace(/<(\/?)(div)(\s[^>]*)?>/gi, '<$1p>');
  h = h.replace(/<\/?([a-z0-9]+)[^>]*>/gi, (m, t) => ALLOWED.includes(t.toLowerCase()) ? (m[1] === '/' ? `</${t.toLowerCase()}>` : `<${t.toLowerCase()}>`) : '');
  return h.replace(/<p>\s*<\/p>/g, '').trim();
}
const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const num = v => { const x = Math.round(parseFloat(v) * 100) / 100; return Number.isFinite(x) && x >= 0 ? x : null; };
const IMG = /^[a-z0-9][a-z0-9._-]{0,150}\.(jpg|jpeg|png|webp)$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CATS = ['foarfeci-barnel', 'unelte-de-plantat', 'recoltat-si-greble', 'manusi-si-accesorii', 'pardoseala-exterior', 'anti-daunatori'];

export function cleanProducts(list, catNames = {}) {
  if (!Array.isArray(list) || list.length > 2000) return { error: 'Listă de produse invalidă.' };
  const skus = new Set(), slugs = new Set(), out = [];
  for (const p of list) {
    const o = {
      sku: str(p.sku, 40), slug: str(p.slug, 120).toLowerCase(), name: str(p.name, 200), category: str(p.category, 60),
      categoryName: str(p.categoryName, 80), sub: p.sub ? str(p.sub, 80) : null, price: num(p.price),
      oldPrice: p.oldPrice ? num(p.oldPrice) : null, inStock: !!p.inStock,
      stock: p.stock === null || p.stock === undefined || p.stock === '' ? null : Math.max(0, Math.min(100000, parseInt(p.stock, 10) || 0)), short: str(p.short, 400),
      description: cleanHtml(p.description), images: (Array.isArray(p.images) ? p.images : []).filter(x => IMG.test(x)).slice(0, 20),
      weight: p.weight ? num(p.weight) : null, noEasybox: !!p.noEasybox, featured: !!p.featured, featuredOrder: parseInt(p.featuredOrder, 10) || 0, oldUrl: p.oldUrl ? str(p.oldUrl, 200) : null
    };
    const who = o.name || o.sku || '(fără nume)';
    if (!o.sku) return { error: `Produsul „${who}” nu are cod.` };
    if (!o.name) return { error: `Produsul ${o.sku} nu are nume.` };
    if (!SLUG.test(o.slug)) return { error: `Adresa produsului „${who}” poate conține doar litere mici, cifre și cratimă.` };
    if (o.price === null || o.price <= 0) return { error: `Preț invalid la „${who}”.` };
    if (o.oldPrice !== null && o.oldPrice <= o.price) o.oldPrice = null;
    if (o.stock !== null) o.inStock = o.stock > 0;
    if (!o.images.length) return { error: `Produsul „${who}” are nevoie de cel puțin o poză.` };
    if (skus.has(o.sku)) return { error: `Codul ${o.sku} apare de două ori.` };
    if (slugs.has(o.slug)) return { error: `Adresa ${o.slug} apare de două ori.` };
    skus.add(o.sku); slugs.add(o.slug); out.push(o);
  }
  return { list: out };
}

export function cleanSite(s) {
  if (!s || typeof s !== 'object') return { error: 'Setări invalide.' };
  const t = (v, n = 300) => str(v, n);
  const href = v => { v = str(v, 300); return /^(\/[^\s]*|https:\/\/[^\s]+|tel:[+0-9]+)$/.test(v) ? v : '/'; };
  const img = v => { v = str(v, 300); return /^\/img\/(site|p)\/[a-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(v) ? v : ''; };
  const o = JSON.parse(JSON.stringify(s));
  o.announcement = t(s.announcement, 200);
  o.hero = { eyebrow: t(s.hero?.eyebrow, 80), title: t(s.hero?.title, 140), text: t(s.hero?.text, 400), image: img(s.hero?.image) || '/img/site/hero-livada.jpg',
    imageAlt: t(s.hero?.imageAlt, 140), cta: { label: t(s.hero?.cta?.label, 60), href: href(s.hero?.cta?.href) }, cta2: { label: t(s.hero?.cta2?.label, 60), href: href(s.hero?.cta2?.href) } };
  o.barnelBand = { eyebrow: t(s.barnelBand?.eyebrow, 80), title: t(s.barnelBand?.title, 140), text: t(s.barnelBand?.text, 400),
    image: img(s.barnelBand?.image) || '/img/site/barnel-or32a.jpg', href: href(s.barnelBand?.href) };
  o.featuredTitle = t(s.featuredTitle, 80);
  o.perks = (Array.isArray(s.perks) ? s.perks : []).slice(0, 6).map(p => ({ t: t(p.t, 60), d: t(p.d, 80) }));
  o.popularSearches = (Array.isArray(s.popularSearches) ? s.popularSearches : []).map(x => t(x, 40)).filter(Boolean).slice(0, 12);
  o.synonyms = (Array.isArray(s.synonyms) ? s.synonyms : []).map(g => (Array.isArray(g) ? g : []).map(x => t(x, 40)).filter(Boolean)).filter(g => g.length > 1).slice(0, 200);
  o.categories = (Array.isArray(s.categories) ? s.categories : []).map(c => ({ slug: t(c.slug, 60), name: t(c.name, 80), intro: t(c.intro, 500), image: img(c.image) }));
  o.shipping = { ...o.shipping, trackingUrl: /^https:\/\/[^\s<>"]+\{awb\}[^\s<>"]*$/.test(s.shipping?.trackingUrl || '') ? s.shipping.trackingUrl : 'https://sameday.ro/status-colet/?awb={awb}', freeOver: num(s.shipping?.freeOver) ?? 200, cost: num(s.shipping?.cost) ?? 16.99, returnCost: num(s.shipping?.returnCost) ?? 16.99 };
  o.analytics = { ga4: /^G-[A-Z0-9]+$/.test(s.analytics?.ga4 || '') ? s.analytics.ga4 : '', googleAds: /^AW-[0-9]+$/.test(s.analytics?.googleAds || '') ? s.analytics.googleAds : '' };
  return { site: o };
}
