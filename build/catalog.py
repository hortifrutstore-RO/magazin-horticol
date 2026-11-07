import pandas as pd, json, re, html, bleach, sys
SRC='/home/claude/data/products.csv'; SEL='/home/claude/selectie.csv'; IMG='/home/claude/imgmap.json'
df=pd.read_csv(SRC,dtype=str,keep_default_na=False)
sel=pd.read_csv(SEL,dtype=str,keep_default_na=False)
imgs=json.load(open(IMG))
b=df[(df.store_view_code=='')&df.sku.isin(sel.sku)]
grp=dict(zip(sel.sku,sel.grup))
CAT={'Barnel':('foarfeci-barnel','Foarfeci Barnel'),'Unelte de plantat':('unelte-de-plantat','Unelte de plantat'),
     'Dispozitive de recoltat / greble':('recoltat-si-greble','Recoltat și greble'),'Unelte si accesorii':('manusi-si-accesorii','Mănuși și accesorii'),
     'Pardoseala exterior':('pardoseala-exterior','Pardoseală exterior'),'Articole anti-daunatori':('anti-daunatori','Anti-dăunători')}
SUB=[('Fierastraie','Fierăstraie profesionale'),('doua maini','Foarfeci la două mâini'),('telescopice','Telescopice și mânere'),
     ('pentru flori','Foarfeci pentru flori'),('Pile','Pile și întreținere'),('Husa','Huse și tocuri'),('Foarfeci profesionale','Foarfeci profesionale')]
def sub(cats,name):
    n=name.lower()
    if 'fierastr' in n: return 'Fierăstraie profesionale'
    if 'telescop' in n: return 'Telescopice și mânere'
    if 'toc' in n or 'husa' in n: return 'Huse și tocuri'
    if 'pila' in n or 'b-clean' in n or 'kit' in n or 'ulei' in n or 'oil' in n: return 'Pile și întreținere'
    for k,v in SUB:
        if k in cats: return v
    if 'foarfec' in n: return 'Foarfeci profesionale'
    return 'Alte unelte Barnel'
ALLOWED=['p','br','ul','ol','li','strong','h3','h4','table','tbody','tr','td','th']
def clean(h):
    h=html.unescape(h or '')
    h=re.sub(r'(?is)<(script|style|iframe|object)[^>]*>.*?</\1>','',h)
    h=re.sub(r'(?i)<h[12]','<h3',h); h=re.sub(r'(?i)</h[12]','</h3',h)
    h=re.sub(r'(?i)<(/?)b(\s[^>]*)?>',r'<\1strong>',h)
    h=bleach.clean(h,tags=ALLOWED,attributes={},strip=True)
    h=h.replace('</strong><strong>','')
    h=re.sub(r'(&nbsp;|\s)+',' ',h); h=re.sub(r'(<p>\s*</p>)+','',h)
    return h.strip()
def num(x):
    try: return round(float(x),2)
    except: return None
out=[]
for _,r in b.iterrows():
    price=num(r.price); sp=num(r.special_price)
    final=sp if sp and sp<price else price
    slug,cname=CAT[grp[r.sku]]
    name=r['name'].strip()
    if r.sku=='5050-Negru': name='Pardoseală compozit pentru exterior 500×500×25 mm, neagră'
    short=re.sub(r'\s+',' ',bleach.clean(html.unescape(r.short_description),tags=[],strip=True)).strip()
    out.append(dict(sku=r.sku,slug=r.url_key,name=name,category=slug,categoryName=cname,
        sub=sub(r.categories,name) if slug=='foarfeci-barnel' else None,
        price=final,oldPrice=price if final!=price else None,inStock=r.is_in_stock=='1',
        short=short[:300],description=clean(r.description),images=imgs[r.sku],
        weight=num(r.weight),featured=False,oldUrl='/'+r.url_key+'.html'))
for o in out:
    if o['sku'] in ('300','5016','5038','3101'): o['featured']=True
out.sort(key=lambda o:(o['category'],o['name']))
json.dump(out,open(sys.argv[1],'w'),ensure_ascii=False,indent=1)
print(len(out)); import collections; print(collections.Counter(o['category'] for o in out)); print(collections.Counter(o['sub'] for o in out if o['sub']))
