# magazin-horticol.ro — site static pe Cloudflare Pages

## Structură
- `data/products.json` — cele 76 de produse (preț, stoc, poze, descriere). Generat din exportul Magento cu `build/catalog.py`.
- `data/site.json` — texte, banner, transport, date firmă, sinonime pentru căutare, ID-uri Google.
- `templates/` — paginile (Jinja2). `content/` — paginile legale și de informații.
- `public/` — CSS, JS, fonturi, poze (`img/p/` produse, `img/site/` bannere).
- `functions/api/order.js` — primește comenzile, recalculează prețurile pe server, salvează în D1, trimite emailuri.
- `schema.sql` — tabela de comenzi.

## Generare
```
pip install jinja2 bleach
python3 build/build.py        # -> dist/
```

## Panoul de administrare (/admin/)
Comenzi (status, AWB), produse (preț, preț tăiat, stoc, poze, descriere, carusel, produse noi), prima pagină (bandă, banner, avantaje, bandă Barnel, categorii, transport, Google), căutare (căutate des, sinonime).
- Autentificare: parolă + cod din aplicația de autentificare (2FA), max. 5 încercări / 15 min, sesiune 12 h.
- Salvarea scrie în depozitul GitHub (`data/*.json`, `public/img/`), iar Cloudflare Pages reconstruiește site-ul automat în 1–2 minute. Fiecare salvare e un commit, deci orice modificare se poate anula.
- Comenzile stau în baza D1 și se văd imediat.

Configurare acces: `python3 tools/setup_admin.py` → afișează `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `SESSION_SECRET` și salvează codul QR de scanat în aplicația de autentificare.

## Publicare (o singură dată)
0. Depozit privat pe GitHub cu acest folder. În Cloudflare Pages: Connect to Git, build command `pip install jinja2 bleach && python3 build/build.py`, output `dist`.
   Token GitHub „fine-grained”, doar pentru acest depozit, permisiunea Contents: Read and write → secretele `GITHUB_TOKEN`, `GITHUB_REPO` (utilizator/depozit), `GITHUB_BRANCH` (main).
1. Cont Cloudflare → Workers & Pages → Create → Pages → upload sau conectare la Git.
2. `npx wrangler d1 create magazin-horticol-comenzi` → pune `database_id` în `wrangler.toml`.
3. `npx wrangler d1 execute magazin-horticol-comenzi --remote --file schema.sql`
4. `npx wrangler pages deploy dist`
5. Secrete (Settings → Variables): `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `SESSION_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`, `RESEND_API_KEY`, `MAIL_FROM`, `NOTIFY_EMAIL`, `BANK_DETAILS`.
6. Custom domain: magazin-horticol.ro și www. Email Routing: info@ → Gmail.

## Local
```
npx wrangler d1 execute magazin-horticol-comenzi --local --file schema.sql
npx wrangler pages dev dist
```

## Plata cu cardul (NETOPIA Payments, API v2)
- Variabile în Cloudflare Pages (Settings → Variables and secrets): `NETOPIA_API_KEY` (secret), `NETOPIA_POS` (semnătura punctului de vânzare), `NETOPIA_PUBLIC_KEY` (conținutul fișierului .cer „Cheie publică”, inclusiv liniile BEGIN/END), `NETOPIA_LIVE` = `1` doar pentru plăți reale.
- Fără `NETOPIA_LIVE=1` se folosește sandbox-ul, iar opțiunea „Card” apare în coș doar dacă ești autentificat în /admin/ (clienții nu o văd).
- Fluxul: `/api/order` creează comanda (status plată `pending`) și trimite clientul la Netopia → Netopia anunță rezultatul la `/api/pay/ipn` (verificat cu cheia publică) → pagina `/comanda-plasata/` afișează rezultatul (`/api/pay/status`), cu „Încearcă din nou” sau „Plătesc la livrare” dacă plata eșuează.
- Emailurile de confirmare pentru comenzile cu cardul pleacă abia după confirmarea plății. În panou, comenzile neplătite nu pot primi AWB.
- La trecerea în producție: se schimbă `NETOPIA_POS` și `NETOPIA_PUBLIC_KEY` cu cele live, cheia API live și `NETOPIA_LIVE=1`.
