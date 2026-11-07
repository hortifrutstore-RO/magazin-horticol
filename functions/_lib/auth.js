// Autentificare admin: parolă (PBKDF2) + cod 2FA (TOTP, aplicație de tip Google Authenticator) + sesiune semnată HMAC.
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ADMIN_PASSWORD_HASH = "pbkdf2$<iteratii>$<salt hex>$<hash hex>"
export async function verifyPassword(password, stored) {
  if (!stored || typeof password !== 'string') return false;
  const [alg, it, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: parseInt(it, 10) }, key, 256);
  return safeEqual(hex(bits), hash);
}

function base32(s) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '', out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')) { const v = a.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, '0'); }
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return new Uint8Array(out);
}
async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey('raw', base32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8); const v = new DataView(msg); v.setUint32(0, Math.floor(counter / 2 ** 32)); v.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg)); const o = h[19] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
export async function verifyTotp(code, secret, now = Date.now()) {
  if (!secret || !/^\d{6}$/.test(code || '')) return false;
  const c = Math.floor(now / 30000);
  for (const d of [-1, 0, 1]) if (safeEqual(await totpAt(secret, c + d), code)) return true;
  return false;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
export const COOKIE = 'mh_admin';
export async function makeSession(secret, hours = 12) {
  const exp = Date.now() + hours * 3600e3; const v = `${exp}.${crypto.randomUUID()}`;
  return `${v}.${await hmac(secret, v)}`;
}
export async function checkSession(request, secret) {
  if (!secret) return false;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!m) return false;
  const parts = m[1].split('.'); if (parts.length !== 3) return false;
  const [exp, id, sig] = parts;
  if (!(parseInt(exp, 10) > Date.now())) return false;
  return safeEqual(await hmac(secret, `${exp}.${id}`), sig);
}
export const cookieHeader = (val, maxAge) => `${COOKIE}=${val}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
