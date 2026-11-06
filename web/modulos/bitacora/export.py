import os, re, json, sys, yaml, markdown, html
src = sys.argv[1]; out = sys.argv[2]
BASE = "https://malkevnia.com"
posts = []
for fn in sorted(os.listdir(src)):
    if not fn.endswith('.md'): continue
    raw = open(os.path.join(src, fn), encoding='utf-8').read()
    m = re.match(r'^---\n(.*?)\n---\n?(.*)$', raw, re.S)
    fm = yaml.safe_load(m.group(1)); body = m.group(2).strip()
    if fm.get('published') is False: continue
    slug = re.sub(r'^\d{4}-\d{2}-\d{2}-', '', fn[:-3])
    d = str(fm['date']); y, mo, da = d[:4], d[5:7], d[8:10]
    h = markdown.markdown(body, extensions=['nl2br', 'extra', 'sane_lists'])
    h = re.sub(r'(src|href)="/(?!/)', r'\1="' + BASE + '/', h)
    h = re.sub(r'<img ', '<img loading="lazy" ', h)
    text = re.sub(r'<[^>]+>', ' ', h); text = html.unescape(re.sub(r'\s+', ' ', text)).strip()
    img = re.search(r'<img[^>]*src="([^"]+)"', h)
    posts.append({
        'id': slug, 'title': str(fm['title']), 'date': f"{y}-{mo}-{da}",
        'datetime': d, 'year': int(y),
        'url': f"{BASE}/blog/{y}/{mo}/{da}/{slug}/",
        'description': str(fm.get('description', '')), 'tags': fm.get('tags') or [],
        'cover': img.group(1) if img else None,
        'words': len(text.split()), 'readingMinutes': max(1, -(-len(text.split()) // 200)),
        'html': h,
    })
posts.sort(key=lambda p: p['datetime'], reverse=True)
json.dump({'source': BASE, 'generated': '2026-11-06', 'count': len(posts), 'posts': posts},
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(posts), os.path.getsize(out))
