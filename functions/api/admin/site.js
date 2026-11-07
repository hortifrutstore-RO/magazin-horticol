import { json } from '../../_lib/auth.js';
import { ghPut } from '../../_lib/gh.js';
import { cleanSite } from '../../_lib/validate.js';
export async function onRequestPut({ request, env }) {
  const b = await request.json();
  const { site, error } = cleanSite(b.site);
  if (error) return json({ ok: false, error }, 400);
  const sha = await ghPut(env, 'data/site.json', JSON.stringify(site, null, 2) + '\n', 'Panou: ' + String(b.message || 'setări site').slice(0, 100), b.sha);
  return json({ ok: true, sha });
}
