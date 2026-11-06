import json, re, os, sys, colorsys, concurrent.futures as cf, urllib.request
from PIL import Image
D='/tmp/claude-0/build'
items=[i for i in json.load(open('/tmp/claude-0/col.json'))['items'] if i['kind'] in('book','manga') and not i.get('hidden')]
def fetch(ix):
    i=items[ix]; p=f'{D}/covers/{ix}.img'
    if not os.path.exists(p):
        try:
            req=urllib.request.Request(i['cover_url'],headers={'User-Agent':'malkevnia-builder'})
            open(p,'wb').write(urllib.request.urlopen(req,timeout=30).read())
        except Exception as e: print('fail',ix,e,file=sys.stderr); return None
    return p
with cf.ThreadPoolExecutor(16) as ex: paths=list(ex.map(fetch,range(len(items))))
CW,CH,COLS=128,192,16
rows=(len(items)+COLS-1)//COLS
atlas=Image.new('RGB',(CW*COLS,CH*rows),(30,20,50))
out=[]
for ix,(i,p) in enumerate(zip(items,paths)):
    col=None; slot=None
    if p:
        try:
            im=Image.open(p).convert('RGB')
            # cover-fit into 2:3
            w,h=im.size; tr=CW/CH
            if w/h>tr: nw=int(h*tr); im=im.crop(((w-nw)//2,0,(w-nw)//2+nw,h))
            else: nh=int(w/tr); im=im.crop((0,(h-nh)//2,w,(h-nh)//2+nh))
            im=im.resize((CW,CH),Image.LANCZOS)
            slot=ix; atlas.paste(im,((ix%COLS)*CW,(ix//COLS)*CH))
            # dominant-ish colour: most saturated frequent bucket
            sm=im.resize((24,36)).quantize(6).convert('RGB')
            cnt=sorted(sm.getcolors(2000),reverse=True)
            best=max(cnt,key=lambda c:c[0]*(0.35+colorsys.rgb_to_hsv(*[x/255 for x in c[1]])[1]))
            col='#%02x%02x%02x'%best[1]
        except Exception as e: print('img fail',ix,e,file=sys.stderr)
    t=i['title']; series=None
    t=re.sub(r'\s*\((Spanish|English) Edition\)','',t)
    m=re.search(r'\s*\(([^()]*?),?\s*#\s*([\d.]+)\)\s*$',t)
    if m: series=f"{m.group(1).strip().rstrip(',')} #{m.group(2)}"; t=t[:m.start()]
    meta=i.get('meta') or {}
    st={'done':'leido','reading':'leyendo','wishlist':'pendiente','owned':'en-estanteria'}.get(i['status'],i['status'])
    b={'id':ix,'tipo':'libro' if i['kind']=='book' else 'manga','titulo':t.strip(),'autor':i['creator'] or '',
       'anio':i['year'],'nota':i['rating'],'estado':st,'color':col or i.get('color') or '#6b4fb3','portada':slot}
    if series: b['serie']=series
    if meta.get('pages'): b['paginas']=meta['pages']
    if meta.get('chapters_read'): b['capitulosLeidos']=meta['chapters_read']
    if meta.get('origin'): b['origen']=meta['origin']
    if meta.get('chapters'): b['capitulos']=meta['chapters']
    if meta.get('title_native'): b['tituloOriginal']=meta['title_native']
    if meta.get('goodreads_id'): b['goodreads']=meta['goodreads_id']
    if meta.get('anilist_id'): b['anilist']=meta['anilist_id']
    out.append(b)
atlas.save(f'{D}/portadas.jpg',quality=82,optimize=True,progressive=True)
hdr='// Datos REALES de la biblioteca de Malkev (export de la POC: Goodreads + AniList).\n// Generado automaticamente. portada = indice en portadas.jpg (atlas de %dx%d, celdas %dx%d).\n'%(COLS,rows,CW,CH)
open(f'{D}/libreria-datos.js','w').write(hdr+'export const ATLAS = '+json.dumps({'cols':COLS,'rows':rows,'cellW':CW,'cellH':CH})+';\nexport const LIBROS = '+json.dumps(out,ensure_ascii=False,indent=0).replace('\n','')+';\n')
print(len(out), 'items', sum(1 for b in out if b['portada'] is not None),'with cover', os.path.getsize(f'{D}/portadas.jpg'))
