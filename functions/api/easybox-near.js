// GET /api/easybox-near?county=Cluj&city=Bologa → orașul cu easybox cel mai apropiat de localitatea clientului.
// Harta Sameday cade pe București când primește un sat fără easybox; aici găsim localitatea potrivită pentru centrare.
import { samedayReady, lockerTowns, kvGet, kvSet } from '../_lib/sameday.js';
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(municipiul|orasul|oras|comuna|satul|sat|judetul|jud\.?)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const km = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// Rezervă când lista de lockere Sameday nu e disponibilă: reședința județului (mai bine decât Bucureștiul implicit al hărții).
const SEAT = {"Alba": "Alba Iulia", "Arad": "Arad", "Argeș": "Pitești", "Bacău": "Bacău", "Bihor": "Oradea", "Bistrița-Năsăud": "Bistrița", "Botoșani": "Botoșani", "Brașov": "Brașov", "Brăila": "Brăila", "București": "București", "Buzău": "Buzău", "Caraș-Severin": "Reșița", "Călărași": "Călărași", "Cluj": "Cluj-Napoca", "Constanța": "Constanța", "Covasna": "Sfântu Gheorghe", "Dâmbovița": "Târgoviște", "Dolj": "Craiova", "Galați": "Galați", "Giurgiu": "Giurgiu", "Gorj": "Târgu Jiu", "Harghita": "Miercurea Ciuc", "Hunedoara": "Deva", "Ialomița": "Slobozia", "Iași": "Iași", "Ilfov": "Voluntari", "Maramureș": "Baia Mare", "Mehedinți": "Drobeta-Turnu Severin", "Mureș": "Târgu Mureș", "Neamț": "Piatra Neamț", "Olt": "Slatina", "Prahova": "Ploiești", "Satu Mare": "Satu Mare", "Sălaj": "Zalău", "Sibiu": "Sibiu", "Suceava": "Suceava", "Teleorman": "Alexandria", "Timiș": "Timișoara", "Tulcea": "Tulcea", "Vaslui": "Vaslui", "Vâlcea": "Râmnicu Vâlcea", "Vrancea": "Focșani"};
const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });

async function geocode(env, city, county) {
  const key = 'geo:' + norm(county) + ':' + norm(city);
  const c = await kvGet(env, key); if (c) return c.p || null;
  const tries = [`${city}, județul ${county}, România`, `${city}, ${county}, România`];
  let p = null;
  for (const q of tries) {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ro&q=' + encodeURIComponent(q), { headers: { 'User-Agent': 'magazin-horticol.ro easybox locator (hortifrutstore@gmail.com)', 'Accept-Language': 'ro' } });
    const j = r.ok ? await r.json().catch(() => []) : [];
    if (j[0]) { p = [+j[0].lat, +j[0].lon]; break; }
  }
  await kvSet(env, key, { p }, p ? 90 * 86400 : 7 * 86400);
  return p;
}

export async function onRequestGet({ env, request }) {
  const u = new URL(request.url), city = (u.searchParams.get('city') || '').slice(0, 80), county = (u.searchParams.get('county') || '').slice(0, 40);
  if (!city || !county) return out({ ok: false, why: 'lipsă localitate' });
  const seat = SEAT[county] ? { ok: true, city: SEAT[county], county, approx: true } : { ok: false };
  if (!samedayReady(env)) return out({ ...seat, why: 'Sameday neconfigurat' });
  try {
    const towns = await lockerTowns(env);
    const nc = norm(city), nj = norm(county);
    const inCounty = towns.filter(t => !t.county || norm(t.county) === nj);
    const same = inCounty.find(t => norm(t.city) === nc);
    if (same) return out({ ok: true, city: same.city, county: same.county, exact: true });
    const p = await geocode(env, city, county);
    if (!p) return out({ ...seat, why: 'localitate negăsită' });
    let best = null;
    for (const t of towns) for (const q of t.pts) { const d = km(p, q); if (!best || d < best.d) best = { t, d }; }
    return best ? out({ ok: true, city: best.t.city, county: best.t.county, km: Math.round(best.d) }) : out(seat);
  } catch (e) { console.log('easybox-near', e && e.message); return out({ ...seat, why: String(e && e.message || e).slice(0, 160) }); }
}
