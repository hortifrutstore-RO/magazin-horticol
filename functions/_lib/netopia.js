// Plata cu cardul prin NETOPIA Payments (API v2).
// Secrete / variabile în Cloudflare:
//   NETOPIA_API_KEY     — cheia API (admin Netopia → Profil → Securitate)
//   NETOPIA_POS         — semnătura punctului de vânzare (XXXX-XXXX-XXXX-XXXX-XXXX)
//   NETOPIA_PUBLIC_KEY  — conținutul fișierului .cer „Cheie publică” (verifică notificările IPN)
//   NETOPIA_LIVE        — "1" pentru plăți reale; altfel se folosește sandbox-ul
// În sandbox, opțiunea „Card” apare în coș doar când ești autentificat în panoul de administrare.

export const netopiaReady = env => !!(env.NETOPIA_API_KEY && env.NETOPIA_POS && env.NETOPIA_PUBLIC_KEY);
export const netopiaLive = env => env.NETOPIA_LIVE === '1';
const base = env => netopiaLive(env) ? 'https://secure.mobilpay.ro/pay' : 'https://secure-sandbox.netopia-payments.com';

// Statusuri Netopia → statusul plății în comanda noastră
const PAID = [3, 5], FAILED = [4, 11, 12, 23], REFUND = [8, 17], REVIEW = [13];
export function payState(status) {
  const s = parseInt(status, 10);
  if (PAID.includes(s)) return 'paid';
  if (FAILED.includes(s)) return 'failed';
  if (REFUND.includes(s)) return 'refunded';
  if (REVIEW.includes(s)) return 'review';
  return 'pending';
}

const split = full => { const p = String(full || '').trim().split(/\s+/); return p.length > 1 ? { first: p.slice(1).join(' '), last: p[0] } : { first: p[0] || '-', last: p[0] || '-' }; };
const addr = (o, name) => ({
  email: o.email, phone: o.phone, firstName: name.first, lastName: name.last, city: o.city || '-', country: 642, countryName: 'Romania',
  state: o.county || '-', postalCode: o.zip || '', details: (o.delivery === 'easybox' ? 'Easybox: ' + o.easybox : o.address || '').slice(0, 250)
});

// Pornește plata. Întoarce { ok, url, ntpID } sau { ok:false, error }.
export async function startPayment(env, origin, o, items, attempt, token) {
  const name = split(o.name);
  const body = {
    config: {
      emailTemplate: '', emailSubject: '', cancelUrl: `${origin}/comanda-plasata/?nr=${encodeURIComponent(o.number)}&t=${token}`,
      notifyUrl: `${origin}/api/pay/ipn`, redirectUrl: `${origin}/comanda-plasata/?nr=${encodeURIComponent(o.number)}&t=${token}`, language: 'ro'
    },
    payment: { options: { installments: 0, bonus: 0 }, instrument: null, data: {} },
    order: {
      ntpID: '', posSignature: env.NETOPIA_POS, dateTime: new Date().toISOString(),
      description: `Comanda ${o.number} – magazin-horticol.ro`, orderID: attempt > 1 ? `${o.number}-P${attempt}` : o.number,
      amount: Math.round(o.total * 100) / 100, currency: 'RON',
      billing: addr(o, name), shipping: addr(o, name),
      products: items.map(i => ({ name: i.name.slice(0, 120), code: String(i.sku), category: 'produse', price: i.total, vat: 0 }))
        .concat(o.shipping ? [{ name: 'Transport', code: 'TRANSPORT', category: 'transport', price: o.shipping, vat: 0 }] : []),
      installments: { selected: 0, available: [0] }, data: {}
    }
  };
  let r, j;
  try {
    r = await fetch(base(env) + '/payment/card/start', { method: 'POST', headers: { authorization: env.NETOPIA_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    j = await r.json();
  } catch { return { ok: false, error: 'Netopia nu răspunde.' }; }
  const url = j && j.payment && j.payment.paymentURL;
  if (!r.ok || !url) return { ok: false, error: (j && j.error && j.error.message) || `Netopia a răspuns cu eroarea ${r.status}.`, raw: j };
  return { ok: true, url, ntpID: j.payment.ntpID || '' };
}

// Interoghează statusul unei plăți (când IPN-ul întârzie).
export async function paymentStatus(env, ntpID, orderID) {
  try {
    const r = await fetch(base(env) + '/operation/status', { method: 'POST', headers: { authorization: env.NETOPIA_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ posID: env.NETOPIA_POS, ntpID, orderID }) });
    const j = await r.json();
    const s = j && (j.payment ? j.payment.status : j.status);
    return s === undefined ? null : parseInt(s, 10);
  } catch { return null; }
}

/* ---------- verificarea notificării IPN (JWT RS512 semnat de Netopia) ---------- */
const b64d = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

// Din certificatul X.509 (PEM) scoatem cheia publică (SubjectPublicKeyInfo). Acceptă și direct „BEGIN PUBLIC KEY”.
export function spkiFromPem(pem) {
  const der = b64d(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''));
  if (/BEGIN PUBLIC KEY/.test(pem)) return der;
  let p = 0;
  const hdr = () => { const tag = der[p++]; let len = der[p++]; if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = len * 256 + der[p++]; } return { tag, len, start: p }; };
  hdr();                         // Certificate SEQUENCE
  hdr();                         // tbsCertificate SEQUENCE
  let h = hdr();
  if (h.tag === 0xa0) { p = h.start + h.len; h = hdr(); } // [0] version
  p = h.start + h.len;           // serialNumber
  for (let i = 0; i < 4; i++) { h = hdr(); p = h.start + h.len; } // signature, issuer, validity, subject
  const s = p; h = hdr();        // subjectPublicKeyInfo
  return der.slice(s, h.start + h.len);
}

let keyCache = null;
async function publicKey(env) {
  if (keyCache && keyCache.pem === env.NETOPIA_PUBLIC_KEY) return keyCache.key;
  const key = await crypto.subtle.importKey('spki', spkiFromPem(env.NETOPIA_PUBLIC_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, false, ['verify']);
  keyCache = { pem: env.NETOPIA_PUBLIC_KEY, key };
  return key;
}

// Întoarce { ok:true } sau { ok:false, error }.
export async function verifyIpn(env, token, rawBody) {
  if (!token) return { ok: false, error: 'Lipsește Verification-token.' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'Token invalid.' };
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(b64d(parts[0]))); claims = JSON.parse(new TextDecoder().decode(b64d(parts[1]))); }
  catch { return { ok: false, error: 'Token ilizibil.' }; }
  if (head.alg !== 'RS512') return { ok: false, error: 'Algoritm neacceptat: ' + head.alg };
  const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', await publicKey(env), b64d(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  if (!good) return { ok: false, error: 'Semnătură invalidă.' };
  if (claims.iss !== 'NETOPIA Payments') return { ok: false, error: 'Emitent invalid.' };
  const aud = Array.isArray(claims.aud) ? claims.aud[0] : claims.aud;
  if (aud !== env.NETOPIA_POS) return { ok: false, error: 'Punct de vânzare greșit.' };
  if (claims.exp && claims.exp * 1000 < Date.now() - 300e3) return { ok: false, error: 'Token expirat.' };
  const hash = b64(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(rawBody)));
  if (hash !== claims.sub) return { ok: false, error: 'Conținutul notificării a fost modificat.' };
  return { ok: true };
}

// Numărul comenzii din orderID-ul trimis la Netopia (încercările repetate au sufixul -P2, -P3...).
export const orderNumber = id => String(id || '').replace(/-P\d+$/, '');
