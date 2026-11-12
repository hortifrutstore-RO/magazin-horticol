// Creează la prima cerere tabelele necesare contului de client (o dată pe instanță).
const SCHEMA = [
 "CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, email TEXT NOT NULL, ip TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)",
 "CREATE INDEX IF NOT EXISTS login_tokens_created ON login_tokens(created_at)",
 "CREATE INDEX IF NOT EXISTS orders_email ON orders(email COLLATE NOCASE)",
 "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp TEXT)"
];
// Coloane adăugate ulterior (pe o bază existentă ALTER dă eroare dacă există deja: o ignorăm).
const COLUMNS = ['locker_json TEXT', 'awb_status TEXT', 'awb_checked_at TEXT'];
let ready = null;
export async function onRequest(ctx) {
  if (ctx.env.DB && /^\/api\//.test(new URL(ctx.request.url).pathname)) {
    if (!ready) ready = ctx.env.DB.batch(SCHEMA.map(s => ctx.env.DB.prepare(s)))
      .then(() => Promise.all(COLUMNS.map(c => ctx.env.DB.prepare('ALTER TABLE orders ADD COLUMN ' + c).run().catch(() => null))))
      .catch(e => { ready = null; throw e; });
    await ready;
  }
  return ctx.next();
}
