// POST {credential}: tokenul primit de la butonul Google. Dacă e valid, clientul e conectat (cookie de cont).
import { json } from '../../_lib/auth.js';
import { verifyGoogle } from '../../_lib/google.js';
import { makeCookie } from '../../_lib/customer.js';
import SHOP from '../_shop.json';
export async function onRequestPost({ request, env }) {
  let b = {}; try { b = await request.json(); } catch {}
  if (!env.SESSION_SECRET || !SHOP.googleClientId) return json({ ok: false, error: 'Conectarea cu Google nu este activă.' }, 422);
  let u = null; try { u = await verifyGoogle(b.credential, SHOP.googleClientId); } catch {}
  if (!u) return json({ ok: false, error: 'Conectarea cu Google nu a reușit. Încearcă din nou sau folosește linkul pe email.' }, 401);
  return json({ ok: true, email: u.email }, 200, { 'set-cookie': await makeCookie(env, u.email) });
}
