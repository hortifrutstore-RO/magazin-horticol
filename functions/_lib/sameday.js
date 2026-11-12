// Integrare Sameday (API REST oficial, aceleași câmpuri ca SDK-ul lor PHP).
// Secrete în Cloudflare: SAMEDAY_USER, SAMEDAY_PASS. Opțional SAMEDAY_API (implicit producție;
// pentru test: https://sameday-api.demo.zitec.com, cu userul de test primit de la Sameday).
const PROD = 'https://api.sameday.ro';
export const samedayReady = env => !!(env.SAMEDAY_USER && env.SAMEDAY_PASS && env.DB);
const host = env => (env.SAMEDAY_API || PROD).replace(/\/+$/, '');

async function kvGet(env, k) {
  const r = await env.DB.prepare('SELECT v, exp FROM kv WHERE k = ?1').bind(k).first();
  return r && (!r.exp || r.exp > new Date().toISOString()) ? JSON.parse(r.v) : null;
}
async function kvSet(env, k, v, ttlSec) {
  const exp = ttlSec ? new Date(Date.now() + ttlSec * 1000).toISOString() : null;
  await env.DB.prepare('INSERT INTO kv (k, v, exp) VALUES (?1, ?2, ?3) ON CONFLICT(k) DO UPDATE SET v = ?2, exp = ?3').bind(k, JSON.stringify(v), exp).run();
}

// Câmpuri imbricate în stilul PHP: awbRecipient[name]=..., parcels[0][weight]=...
function form(obj, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return out;
}

async function token(env, fresh = false) {
  const key = 'sameday_token:' + host(env) + ':' + env.SAMEDAY_USER;
  if (!fresh) { const t = await kvGet(env, key); if (t) return t; }
  const r = await fetch(host(env) + '/api/authenticate', {
    method: 'POST', body: form({ remember_me: 1 }),
    headers: { 'X-AUTH-USERNAME': String(env.SAMEDAY_USER).trim(), 'X-AUTH-PASSWORD': String(env.SAMEDAY_PASS).trim() }
  });
  const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch {}
  if (!r.ok || !j.token) {
    console.log('Sameday auth', r.status, txt.slice(0, 300));
    const sv = v => typeof v === 'string' ? v : v ? JSON.stringify(v).slice(0, 200) : '';
    const why = sv(j.message) || sv(j.error) || sv(j.errors) || (/<html/i.test(txt) ? 'răspuns HTML (posibil blocat de firewall-ul Sameday)' : txt.slice(0, 120));
    throw new Error(`Sameday: autentificare eșuată (cod ${r.status}${why ? ': ' + why : ''}). Verifică SAMEDAY_USER / SAMEDAY_PASS.`);
  }
  await kvSet(env, key, j.token, 12 * 3600); // tokenul e valabil mai mult; îl reînnoim de două ori pe zi
  return j.token;
}

export async function call(env, method, path, body, { raw = false } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await token(env, attempt > 0);
    const r = await fetch(host(env) + path, { method, body: body ? form(body) : undefined, headers: { 'X-AUTH-TOKEN': t } });
    if (r.status === 401 && attempt === 0) continue;
    if (raw) { if (!r.ok) throw new Error(`Sameday: eroare ${r.status}.`); return r; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Sameday: ' + explain(j, r.status));
    return j;
  }
}
function explain(j, status) {
  const errs = [];
  const walk = (o, p) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o.errors)) o.errors.forEach(e => errs.push((p ? p + ': ' : '') + e)); for (const [k, v] of Object.entries(o.children || {})) walk(v, k); };
  walk(j.errors || j, '');
  return errs.length ? errs.join('; ') : (j.message || j.error || `eroare ${status}`);
}

// Servicii și punct de ridicare: citite din contul Sameday, ținute 24 h.
export async function account(env, fresh = false) {
  const key = 'sameday_account:' + host(env) + ':' + env.SAMEDAY_USER;
  if (!fresh) { const a = await kvGet(env, key); if (a) return a; }
  const [sv, pp] = await Promise.all([call(env, 'GET', '/api/client/services?countPerPage=100'), call(env, 'GET', '/api/client/pickup-points?countPerPage=100')]);
  const services = (sv.data || []).map(s => ({ id: s.id, name: s.name, code: s.serviceCode }));
  const points = (pp.data || []).map(p => ({ id: p.id, alias: p.alias, address: p.address, isDefault: !!p.defaultPickupPoint,
    contact: ((p.pickupPointContactPerson || []).find(c => c.defaultContactPerson) || (p.pickupPointContactPerson || [])[0] || {}).id || null }));
  const a = { services, points };
  await kvSet(env, key, a, 24 * 3600);
  return a;
}

// Emite AWB pentru o comandă din baza de date.
// opts: { weight (kg), parcels (nr. colete), cod (lei), observation, pickupPoint }
export async function createAwb(env, o, opts) {
  const acc = await account(env);
  const locker = o.locker_json ? JSON.parse(o.locker_json) : null;
  const pudo = locker && Number(locker.oohType) === 1;
  const code = o.delivery === 'easybox' ? (pudo ? 'PP' : 'LN') : '24';
  const svc = acc.services.find(s => s.code === code) || (code === '24' ? acc.services.find(s => /24/.test(s.name)) : null);
  if (!svc) throw new Error(`Sameday: contul nu are activ serviciul ${code === 'LN' ? 'Locker NextDay (easybox)' : code === 'PP' ? 'PUDO' : '24H'}.`);
  const pt = acc.points.find(p => String(p.id) === String(opts.pickupPoint)) || acc.points.find(p => p.isDefault) || acc.points[0];
  if (!pt) throw new Error('Sameday: contul nu are niciun punct de ridicare.');
  if (o.delivery === 'easybox' && !(locker && locker.lockerId)) throw new Error('Comanda nu are un easybox ales de pe hartă. Editează AWB-ul direct în Sameday sau sună clientul.');

  const n = Math.max(1, Math.min(10, parseInt(opts.parcels, 10) || 1));
  const w = Math.max(0.1, Math.min(30, Number(opts.weight) || 1));
  const each = Math.round((w / n) * 100) / 100;
  const company = o.company_name ? { personType: 1, companyName: o.company_name, companyCui: o.company_cui } : { personType: 0 };
  const recipient = locker
    ? { name: o.name, phoneNumber: o.phone, email: o.email, cityString: locker.city, countyString: locker.county, address: locker.address, postalCode: locker.postalCode || '', ...company }
    : { name: o.name, phoneNumber: o.phone, email: o.email, cityString: o.city, countyString: o.county, address: o.address, postalCode: o.zip || '', ...company };
  const body = {
    pickupPoint: pt.id, contactPerson: pt.contact, packageType: 0, packageNumber: n, packageWeight: w,
    service: svc.id, awbPayment: 1, cashOnDelivery: o.payment === 'cod' ? Math.round((Number(opts.cod ?? o.total)) * 100) / 100 : 0,
    cashOnDeliveryReturns: o.payment === 'cod' ? 1 : null, insuredValue: 0, thirdPartyPickup: 0,
    awbRecipient: recipient,
    parcels: Array.from({ length: n }, () => ({ weight: each, width: opts.width || 30, length: opts.length || 20, height: opts.height || 12 })),
    observation: String(opts.observation || '').slice(0, 200), clientInternalReference: o.number,
    ...(locker ? (pudo ? { oohLastMile: locker.lockerId } : { lockerLastMile: locker.lockerId }) : {})
  };
  const j = await call(env, 'POST', '/api/awb', body);
  if (!j.awbNumber) throw new Error('Sameday nu a întors numărul AWB.');
  return { awb: j.awbNumber, cost: j.awbCost ?? null, service: svc.name };
}

export const awbPdf = (env, awb, size = 'A6') => call(env, 'GET', `/api/awb/download/${encodeURIComponent(awb)}/${size}`, null, { raw: true });
export const deleteAwb = (env, awb) => call(env, 'DELETE', `/api/awb/${encodeURIComponent(awb)}`);
export async function awbStatus(env, awb) {
  const j = await call(env, 'GET', `/api/client/awb/${encodeURIComponent(awb)}/status`);
  const s = j.expeditionSummary || {}, e = j.expeditionStatus || {};
  return { delivered: !!s.delivered, canceled: !!s.canceled, label: e.statusLabel || e.status || '', date: e.statusDate || null };
}

// Easybox-uri: lista tuturor lockerelor Sameday (oraș, județ, coordonate), ținută 24 h.
// Harta Sameday se centrează doar pe localități care au easybox; pentru sate găsim noi orașul cel mai apropiat.
export async function lockerTowns(env) {
  const key = 'sameday_lockers:' + host(env);
  const c = await kvGet(env, key); if (c) return c;
  const all = [];
  for (let page = 1; page <= 40; page++) {
    const j = await call(env, 'GET', `/api/client/lockers?page=${page}&countPerPage=500`);
    const d = j.data || []; all.push(...d);
    if (!d.length || page >= (j.pages || 1)) break;
  }
  const towns = {};
  for (const l of all) {
    const lat = parseFloat(l.lat ?? l.latitude), lng = parseFloat(l.lng ?? l.longitude);
    const city = l.city && (l.city.name || l.city), county = l.county && (l.county.name || l.county);
    if (!city || !isFinite(lat) || !isFinite(lng)) continue;
    const k = city + '|' + (county || '');
    (towns[k] = towns[k] || { city, county: county || '', pts: [] }).pts.push([+lat.toFixed(5), +lng.toFixed(5)]);
  }
  const list = Object.values(towns);
  if (list.length) await kvSet(env, key, list, 24 * 3600);
  return list;
}
export { kvGet, kvSet };
