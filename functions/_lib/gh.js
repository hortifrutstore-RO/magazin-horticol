// Salvează fișierele site-ului în depozitul GitHub. Fiecare salvare = un commit; Cloudflare Pages reconstruiește site-ul automat (~1–2 min).
// Variabile: GITHUB_TOKEN (token cu drept de scriere doar pe acest depozit), GITHUB_REPO ("utilizator/depozit"), GITHUB_BRANCH (implicit "main").
// GITHUB_API se folosește doar la testare locală.
const api = env => (env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
const hdr = env => ({ authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'magazin-horticol-admin', 'content-type': 'application/json' });
const url = (env, path) => `${api(env)}/repos/${env.GITHUB_REPO}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
const branch = env => env.GITHUB_BRANCH || 'main';

function b64encodeBytes(bytes) { let s = ''; const ch = 0x8000; for (let i = 0; i < bytes.length; i += ch) s += String.fromCharCode(...bytes.subarray(i, i + ch)); return btoa(s); }
const b64decodeText = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), c => c.charCodeAt(0)));

export function ghReady(env) { return !!(env.GITHUB_TOKEN && env.GITHUB_REPO); }

export async function ghGet(env, path) {
  const r = await fetch(`${url(env, path)}?ref=${branch(env)}`, { headers: hdr(env) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} la citirea ${path}`);
  const j = await r.json();
  let text = j.content ? b64decodeText(j.content) : null;
  if (text === null && j.download_url) text = await (await fetch(j.download_url, { headers: hdr(env) })).text();
  return { sha: j.sha, text };
}

export async function ghPut(env, path, content, message, sha) {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  if (sha === undefined) { const cur = await ghGet(env, path).catch(() => null); sha = cur && cur.sha; }
  const body = { message, content: b64encodeBytes(bytes), branch: branch(env), ...(sha ? { sha } : {}) };
  const r = await fetch(url(env, path), { method: 'PUT', headers: hdr(env), body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) throw new Error('Fișierul a fost modificat între timp. Reîncarcă pagina și încearcă din nou.');
  if (!r.ok) throw new Error(`GitHub ${r.status} la salvarea ${path}`);
  return (await r.json()).content.sha;
}

export async function ghDelete(env, path, message) {
  const cur = await ghGet(env, path); if (!cur) return;
  const r = await fetch(url(env, path), { method: 'DELETE', headers: hdr(env), body: JSON.stringify({ message, sha: cur.sha, branch: branch(env) }) });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status} la ștergerea ${path}`);
}
