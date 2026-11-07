import { json } from '../../_lib/auth.js';
import { ghPut } from '../../_lib/gh.js';
// Încărcare poză: panoul o redimensionează în browser (max 1600 px), aici verificăm tipul și o salvăm în depozit.
const TYPES = { jpg: [0xff, 0xd8, 0xff], png: [0x89, 0x50, 0x4e, 0x47], webp: [0x52, 0x49, 0x46, 0x46] };
export async function onRequestPost({ request, env }) {
  const fd = await request.formData();
  const f = fd.get('file'); const kind = fd.get('kind') === 'site' ? 'site' : 'p';
  if (!f || typeof f === 'string') return json({ ok: false, error: 'Lipsește fișierul.' }, 400);
  if (f.size > 3 * 1024 * 1024) return json({ ok: false, error: 'Poza depășește 3 MB.' }, 400);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const ext = Object.keys(TYPES).find(k => TYPES[k].every((v, i) => bytes[i] === v));
  if (!ext) return json({ ok: false, error: 'Acceptăm doar JPG, PNG sau WebP.' }, 400);
  const base = String(fd.get('name') || 'poza').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'poza';
  const name = `${base}-${Date.now().toString(36)}.${ext}`;
  await ghPut(env, `public/img/${kind}/${name}`, bytes, `Panou: poză ${name}`, null);
  return json({ ok: true, name, url: `/img/${kind}/${name}` });
}
