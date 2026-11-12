// Contul clientului, fără parolă: clientul primește pe email un link de conectare (valabil 30 de minute, o singură folosire),
// apoi un cookie semnat îl ține conectat 30 de zile. Contul = comenzile plasate cu acel email.
import { safeEqual } from './auth.js';

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const ACC_COOKIE = 'acc';
export const LINK_MIN = 30, SESSION_DAYS = 30;
export const normEmail = e => String(e || '').trim().toLowerCase();
export const validEmail = e => /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[a-z]{2,}$/i.test(e) && e.length <= 160;

async function hmac(env, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode((env.SESSION_SECRET || '') + ':customer'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}
export async function sha256(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))); }
export function newToken() { return b64u(crypto.getRandomValues(new Uint8Array(32))); }

export async function makeCookie(env, email) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const v = `${btoa(unescape(encodeURIComponent(email))).replace(/=+$/, '')}.${exp}`;
  return `${ACC_COOKIE}=${v}.${await hmac(env, v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = () => `${ACC_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// Întoarce emailul clientului conectat sau null.
export async function customer(request, env) {
  if (!env.SESSION_SECRET) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|; )${ACC_COOKIE}=([^;]+)`));
  if (!m) return null;
  const p = m[1].split('.'); if (p.length !== 3) return null;
  const [e64, exp, sig] = p;
  if (!(parseInt(exp, 10) > Date.now())) return null;
  if (!safeEqual(await hmac(env, `${e64}.${exp}`), sig)) return null;
  try { return decodeURIComponent(escape(atob(e64))); } catch { return null; }
}
