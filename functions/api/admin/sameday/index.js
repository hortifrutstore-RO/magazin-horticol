// GET: starea integrării (servicii și puncte de ridicare din contul Sameday). ?fresh=1 recitește din Sameday.
import { json } from '../../../_lib/auth.js';
import { samedayReady, account } from '../../../_lib/sameday.js';
export async function onRequestGet({ env, request }) {
  if (!samedayReady(env)) return json({ ok: true, ready: false });
  try { return json({ ok: true, ready: true, test: /demo/.test(env.SAMEDAY_API || ''), ...(await account(env, new URL(request.url).searchParams.get('fresh') === '1')) }); }
  catch (e) { return json({ ok: true, ready: true, error: e.message }); }
}
