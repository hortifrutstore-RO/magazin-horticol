// POST: cererea clientului de anulare a comenzii sau de retragere din contract (art. 11¹ din OUG 34/2014).
// Salvează cererea în D1, o notează pe comandă (dacă numărul și emailul se potrivesc) și trimite confirmarea
// de primire pe email (suport durabil), cu conținutul cererii, data și ora.
import { json } from '../_lib/auth.js';
import { sendMail, esc } from '../_lib/mail.js';
import { normEmail, validEmail } from '../_lib/customer.js';
import SHOP from './_shop.json';

const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  let b = {}; try { b = await request.json(); } catch {}
  if (b.website) return json({ ok: true, ref: 'OK', at: new Date().toISOString() }); // capcană pentru roboți
  const w = {
    kind: b.kind === 'anulare' ? 'anulare' : 'retragere',
    number: str(b.number, 40).toUpperCase(), name: str(b.name, 120), email: normEmail(b.email), phone: str(b.phone, 30),
    items: str(b.items, 1500), iban: str(b.iban, 60).replace(/\s+/g, ' '), message: str(b.message, 1500)
  };
  if (!w.name) return json({ ok: false, error: 'Completează numele.' }, 400);
  if (!validEmail(w.email)) return json({ ok: false, error: 'Adresa de email nu pare corectă.' }, 400);
  if (!w.number) return json({ ok: false, error: 'Completează numărul comenzii (îl găsești în emailul de confirmare).' }, 400);

  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS withdrawals (id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL,
    kind TEXT NOT NULL, order_number TEXT, order_id INTEGER, name TEXT, email TEXT, phone TEXT, items TEXT, iban TEXT, message TEXT, ip TEXT)`).run();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const since = new Date(Date.now() - 60 * 60e3).toISOString();
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM withdrawals WHERE ip = ?1 AND created_at > ?2').bind(ip, since).first();
  if ((r?.n || 0) >= 5) return json({ ok: false, error: `Ai trimis deja mai multe cereri. Dacă e nevoie, scrie-ne la ${SHOP.email} sau sună la ${SHOP.phone}.` }, 429);

  const order = await env.DB.prepare('SELECT * FROM orders WHERE number = ?1 AND email = ?2 COLLATE NOCASE').bind(w.number, w.email).first();
  const now = new Date(), at = now.toISOString();
  const ref = 'R' + at.slice(2, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  await env.DB.prepare(`INSERT INTO withdrawals (ref, created_at, kind, order_number, order_id, name, email, phone, items, iban, message, ip)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(ref, at, w.kind, w.number, order ? order.id : null, w.name, w.email, w.phone, w.items, w.iban, w.message, ip).run();

  if (order) {
    const when = now.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const line = `${when}: clientul a cerut ${w.kind === 'anulare' ? 'ANULAREA comenzii' : 'RETRAGEREA din contract'} prin site (cererea ${ref}).`;
    await env.DB.prepare('UPDATE orders SET admin_note = CASE WHEN COALESCE(admin_note, \'\') = \'\' THEN ?1 ELSE admin_note || char(10) || ?1 END WHERE id = ?2').bind(line, order.id).run();
  }

  const origin = new URL(request.url).origin;
  const data = { ...w, ref, at, matched: !!order, shipped: !!(order && (order.awb || order.status === 'expediata' || order.status === 'livrata')) };
  const c = receipt(data, origin), n = notice(data);
  const [mc] = await Promise.all([
    sendMail(env, { to: w.email, replyTo: SHOP.email, subject: c.subject, html: c.html }),
    sendMail(env, { to: env.NOTIFY_EMAIL || SHOP.email, replyTo: w.email, subject: n.subject, html: n.html })
  ]);
  return json({ ok: true, ref, at, emailed: !!mc.ok, matched: !!order, shipped: data.shipped });
}

const fmt = iso => new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function rows(w) {
  const r = (k, v) => v ? `<tr><td style="padding:4px 12px 4px 0;color:#6B7C70;vertical-align:top">${k}</td><td style="padding:4px 0">${esc(v).replace(/\n/g, '<br>')}</td></tr>` : '';
  return `<table cellpadding="0" cellspacing="0">${r('Tip cerere', w.kind === 'anulare' ? 'Anularea comenzii' : 'Retragere din contract')}${r('Număr cerere', w.ref)}${r('Primită la', fmt(w.at))}
    ${r('Comanda', w.number)}${r('Nume', w.name)}${r('Email', w.email)}${r('Telefon', w.phone)}${r('Produse', w.items || 'Toate produsele din comandă')}${r('IBAN rambursare', w.iban)}${r('Mesaj', w.message)}</table>`;
}
function receipt(w, origin) {
  const a = w.kind === 'anulare';
  const next = a ? 'Dacă coletul nu a plecat încă, anulăm comanda și îți confirmăm pe email. Dacă a plecat deja, poți refuza coletul la livrare sau îl poți returna în 14 zile de la primire.'
    : 'Trimite produsele în cel mult 14 zile de la această cerere. Îți scriem în cel mult o zi lucrătoare cu detaliile returului. Îți returnăm banii în cel mult 14 zile de la primirea acestei cereri; putem aștepta până primim produsele sau dovada expedierii lor.';
  return { subject: `Am primit cererea ta de ${a ? 'anulare' : 'retragere'} – ${w.number}`,
    html: `<p>Bună, ${esc(w.name)}!</p><p><b>Confirmăm că am primit cererea ta de ${a ? 'anulare a comenzii' : 'retragere din contract'}</b>, trimisă prin site, cu datele de mai jos. Păstrează acest email: este dovada cererii tale.</p>${rows(w)}
      <p><b>Ce urmează:</b> ${next}</p><p>Ai întrebări? Răspunde la acest email sau sună la ${esc(SHOP.phone || '0746 242 877')}.</p><p style="font-size:13px"><a href="${origin}/retur/">Retur</a> · <a href="${origin}/retragere/">Retragere din contract</a> · <a href="${origin}/termeni-si-conditii/">Termeni</a></p>` };
}
function notice(w) {
  const a = w.kind === 'anulare';
  const st = !w.matched ? 'Numărul comenzii și emailul NU se potrivesc cu nicio comandă din baza de date: verifică manual.'
    : w.shipped ? 'Comanda are deja AWB / e expediată.' : 'Comanda nu are încă AWB: nu o expedia.';
  return { subject: `${a ? 'ANULARE' : 'RETRAGERE'} ${w.number} – ${w.name}`,
    html: `<p><b>${a ? 'Cerere de ANULARE' : 'Cerere de RETRAGERE din contract'}</b></p><p style="color:#B42318"><b>${st}</b></p>${rows(w)}<p style="font-size:13px;color:#6B7C70">Clientul a primit automat confirmarea de primire. Rambursarea: în cel mult 14 zile de la cerere (se poate amâna până la primirea produselor).</p>` };
}
