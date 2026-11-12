// Conectare cu Google („Sign in with Google”): browserul primește de la Google un token semnat (JWT),
// iar aici verificăm semnătura cu cheile publice Google, destinatarul (Client ID-ul nostru) și expirarea.
// Nu e nevoie de nicio cheie secretă.
const ISS = ['accounts.google.com', 'https://accounts.google.com'];
const b64d = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
let KEYS = null, KEYS_AT = 0;
async function keys() {
  if (KEYS && Date.now() - KEYS_AT < 3600e3) return KEYS;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs', { cf: { cacheTtl: 3600 } });
  if (!r.ok) throw new Error('certs');
  KEYS = (await r.json()).keys; KEYS_AT = Date.now(); return KEYS;
}
export async function verifyGoogle(jwt, clientId) {
  const [h64, p64, s64] = String(jwt || '').split('.');
  if (!h64 || !p64 || !s64 || !clientId) return null;
  const head = JSON.parse(new TextDecoder().decode(b64d(h64)));
  const pay = JSON.parse(new TextDecoder().decode(b64d(p64)));
  if (head.alg !== 'RS256') return null;
  const jwk = (await keys()).find(k => k.kid === head.kid); if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64d(s64), new TextEncoder().encode(`${h64}.${p64}`));
  if (!ok || !ISS.includes(pay.iss) || pay.aud !== clientId || !(pay.exp * 1000 > Date.now()) || !pay.email || pay.email_verified === false) return null;
  return { email: String(pay.email).toLowerCase(), name: pay.name || '' };
}
