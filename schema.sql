-- Baza de date pentru comenzi (Cloudflare D1)
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'noua',      -- noua | expediata | livrata | anulata
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
  county TEXT, city TEXT, zip TEXT, address TEXT,
  delivery TEXT NOT NULL,                    -- address | easybox
  easybox TEXT,
  payment TEXT NOT NULL,                     -- cod | transfer
  company_name TEXT, company_cui TEXT,
  notes TEXT, newsletter INTEGER DEFAULT 0,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL, shipping REAL NOT NULL, total REAL NOT NULL,
  awb TEXT,
  admin_note TEXT,
  awb_notified_at TEXT
);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ts TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS login_attempts_ip ON login_attempts(ip, ts);

CREATE TABLE IF NOT EXISTS stock (sku TEXT PRIMARY KEY, qty INTEGER NOT NULL);
