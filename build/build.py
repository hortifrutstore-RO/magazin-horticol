"""Generează site-ul static în dist/ din data/*.json, templates/ și content/.
Rulare: python3 build/build.py"""
import json, os, shutil, datetime, re, html
from jinja2 import Environment, FileSystemLoader, select_autoescape
import bleach

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
site = json.load(open(os.path.join(ROOT, 'data/site.json'), encoding='utf-8'))
products = json.load(open(os.path.join(ROOT, 'data/products.json'), encoding='utf-8'))
V = datetime.datetime.now().strftime('%Y%m%d%H%M')

def lei(n):
    s = f"{n:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    return s + ' lei'

env = Environment(loader=FileSystemLoader(os.path.join(ROOT, 'templates')), autoescape=select_autoescape(['html']))
env.filters['lei'] = lei
JUDETE = ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brașov","Brăila","București","Buzău","Caraș-Severin","Călărași","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Giurgiu","Gorj","Harghita","Hunedoara","Ialomița","Iași","Ilfov","Maramureș","Mehedinți","Mureș","Neamț","Olt","Prahova","Satu Mare","Sălaj","Sibiu","Suceava","Teleorman","Timiș","Tulcea","Vaslui","Vâlcea","Vrancea"]
base = dict(site=site, v=V, year=datetime.date.today().year)

for p in products:
    p['description'] = bleach.clean(p.get('description') or '', tags=['p','br','ul','ol','li','strong','h3','h4','table','tbody','tr','td','th'], attributes={}, strip=True)
    p['off'] = round((1 - p['price'] / p['oldPrice']) * 100) if p.get('oldPrice') else 0

def write(path, htmltext):
    out = os.path.join(DIST, path.strip('/'), 'index.html') if not path.endswith('.html') else os.path.join(DIST, path.strip('/'))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(htmltext)

def render(tpl, path, **kw):
    write(path, env.get_template(tpl).render(**base, path=path, **kw))

if os.path.exists(DIST): shutil.rmtree(DIST)
shutil.copytree(os.path.join(ROOT, 'public'), DIST)

# Prima pagină
featured = sorted([p for p in products if p.get('featured')], key=lambda p: p.get('featuredOrder') or 0) or products[:4]
cats = []
for c in site['categories']:
    items = [p for p in products if p['category'] == c['slug']]
    img = c.get('image') or ('/img/p/' + items[0]['images'][0] if items else '')
    cats.append(dict(slug=c['slug'], name=c['name'], count=len(items), img=img, contain=img.startswith('/img/p/')))
render('home.html', '/', featured=featured, cats=cats)

# Categorii
for c in site['categories']:
    items = [p for p in products if p['category'] == c['slug']]
    items.sort(key=lambda p: (not p['inStock'], -p['off'], p['name']))
    subs = {}
    for p in items:
        if p.get('sub'): subs[p['sub']] = subs.get(p['sub'], 0) + 1
    prices = [p['price'] for p in items] or [0]
    render('category.html', f"/categorie/{c['slug']}/", cat=c, products=items, active_cat=c['slug'],
           subs=[dict(name=k, n=v) for k, v in sorted(subs.items(), key=lambda x: -x[1])],
           pmin=int(min(prices)), pmax=int(max(prices)) + 1)

# Produse
for p in products:
    rel = [r for r in products if r['category'] == p['category'] and r['sku'] != p['sku'] and r['inStock']]
    rel.sort(key=lambda r: (r.get('sub') != p.get('sub'), abs(r['price'] - p['price'])))
    ld = {"@context": "https://schema.org", "@type": "Product", "name": p['name'], "sku": p['sku'],
          "image": [site['url'] + '/img/p/' + i for i in p['images']],
          "description": re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]+>', ' ', p['description'])))[:500],
          "brand": {"@type": "Brand", "name": "Barnel" if 'barnel' in p['name'].lower() or p['category'] == 'foarfeci-barnel' else "HORTIFRUT"},
          "offers": {"@type": "Offer", "price": f"{p['price']:.2f}", "priceCurrency": "RON",
                     "availability": "https://schema.org/InStock" if p['inStock'] else "https://schema.org/OutOfStock",
                     "url": f"{site['url']}/produs/{p['slug']}/"}}
    render('product.html', f"/produs/{p['slug']}/", p=p, related=rel[:4], active_cat=p['category'],
           ld=json.dumps(ld, ensure_ascii=False).replace('</', '<\\/'))

render('search.html', '/cautare/')
render('cart.html', '/cos/', judete=JUDETE)

# Pagini de text
for fn in sorted(os.listdir(os.path.join(ROOT, 'content'))):
    raw = open(os.path.join(ROOT, 'content', fn), encoding='utf-8').read()
    title, body = raw.split('\n', 1)
    body = env.from_string(body).render(**base)
    slug = fn[:-5]
    render('page.html', f'/{slug}/', page=dict(title=title.strip(), body=body, noindex=slug == 'comanda-plasata'))
open(os.path.join(DIST, '404.html'), 'w', encoding='utf-8').write(env.get_template('page.html').render(**base, path='/404', page=dict(
    title='Pagina nu există', noindex=True,
    body='<p>Pagina căutată nu mai există sau a fost mutată. Caută produsul în bara de sus sau mergi la <a href="/">prima pagină</a>.</p>')))

# Index pentru căutare și coș (public, doar date de afișare)
os.makedirs(os.path.join(DIST, 'data'), exist_ok=True)
idx = [dict(sku=p['sku'], slug=p['slug'], name=p['name'], cat=p['categoryName'], catSlug=p['category'], sub=p.get('sub'),
            price=p['price'], old=p.get('oldPrice'), off=p['off'], inStock=p['inStock'], img=p['images'][0], featured=p.get('featured', False))
       for p in products]
json.dump(idx, open(os.path.join(DIST, 'data/search.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# Catalog pentru funcția de comenzi (prețurile reale, verificate pe server)
os.makedirs(os.path.join(ROOT, 'functions/api'), exist_ok=True)
json.dump({p['sku']: dict(name=p['name'], price=p['price'], inStock=p['inStock']) for p in products},
          open(os.path.join(ROOT, 'functions/api/_catalog.json'), 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(dict(freeOver=site['shipping']['freeOver'], cost=site['shipping']['cost'], email=site['contact']['email'], name=site['name'], carrier=site['shipping']['carrier'], trackingUrl=site['shipping'].get('trackingUrl') or 'https://sameday.ro/status-colet/?awb={awb}'),
          open(os.path.join(ROOT, 'functions/api/_shop.json'), 'w', encoding='utf-8'), ensure_ascii=False)

# Redirecționări 301 de la adresele Magento
red = ['# Generat automat - adresele vechi Magento']
for p in products:
    red.append(f"/{p['slug']}.html /produs/{p['slug']}/ 301")
for extra in json.load(open(os.path.join(ROOT, 'data/redirects_extra.json'), encoding='utf-8')) if os.path.exists(os.path.join(ROOT, 'data/redirects_extra.json')) else []:
    red.append(f"{extra[0]} {extra[1]} 301")
red += ['/checkout/* /cos/ 301', '/customer/* / 301', '/catalogsearch/* /cautare/ 301', '/admin_1lgliu* / 301', '/index.php/* / 301']
open(os.path.join(DIST, '_redirects'), 'w').write('\n'.join(red) + '\n')

open(os.path.join(DIST, '_headers'), 'w').write("""/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; connect-src 'self' https://*.google-analytics.com https://*.googletagmanager.com https://*.google.com; img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com https://*.google.com https://*.doubleclick.net; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src https://*.doubleclick.net https://*.google.com; base-uri 'self'; form-action 'self'
/admin/*
  Cache-Control: no-store
  X-Robots-Tag: noindex, nofollow
/api/*
  Cache-Control: no-store
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=2592000
""")

urls = ['/'] + [f"/categorie/{c['slug']}/" for c in site['categories']] + [f"/produs/{p['slug']}/" for p in products] + \
       ['/livrare-si-plata/', '/retur/', '/termeni-si-conditii/', '/confidentialitate/', '/cookie-uri/', '/contact/']
open(os.path.join(DIST, 'sitemap.xml'), 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    ''.join(f'<url><loc>{site["url"]}{u}</loc></url>\n' for u in urls) + '</urlset>\n')
open(os.path.join(DIST, 'robots.txt'), 'w').write(f"User-agent: *\nDisallow: /cos/\nDisallow: /cautare/\nDisallow: /comanda-plasata/\nDisallow: /api/\nDisallow: /admin/\nSitemap: {site['url']}/sitemap.xml\n")
print('OK', len(products), 'produse ->', DIST)
