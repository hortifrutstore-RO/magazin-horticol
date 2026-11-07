import { checkSession, json } from '../../_lib/auth.js';
// Toate rutele /api/admin/* cer sesiune validă, în afară de login. Cererile care modifică date cer și antetul x-admin (protecție CSRF).
export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  if (path === '/api/admin/login') return next();
  if (!env.SESSION_SECRET) return json({ ok: false, error: 'Panoul nu este configurat (SESSION_SECRET lipsește).' }, 500);
  if (!(await checkSession(request, env.SESSION_SECRET))) return json({ ok: false, error: 'Neautentificat', auth: false }, 401);
  if (request.method !== 'GET' && request.headers.get('x-admin') !== '1') return json({ ok: false, error: 'Cerere respinsă.' }, 403);
  try { return await next(); } catch (e) { return json({ ok: false, error: e.message || 'Eroare' }, 500); }
}
