// POST: estimează tariful Sameday pentru un colet (greutate, dimensiuni, serviciu, ramburs, destinație).
import { json } from '../../../_lib/auth.js';
import { samedayReady, estimate } from '../../../_lib/sameday.js';
export async function onRequestPost({ env, request }) {
  if (!samedayReady(env)) return json({ ok: false, error: 'Sameday nu e configurat (lipsesc SAMEDAY_USER / SAMEDAY_PASS).' }, 400);
  const b = await request.json().catch(() => ({}));
  try { return json({ ok: true, ...(await estimate(env, b)) }); }
  catch (e) { return json({ ok: false, error: e.message }, 502); }
}
