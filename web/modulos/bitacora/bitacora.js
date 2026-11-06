// bitacora.js · Bitácora del capitán para La Malkevnia
// Módulo ES autocontenido, sin dependencias. Three.js NO se importa: quien lo use pasa su propio THREE
// a createHoloWall(), así comparte instancia con la nave (three@0.160).
//
// Piezas:
//   loadPosts(src)            -> Promise<Post[]>   (posts.json exportado de malkevnia.com, más recientes primero)
//   filterPosts(posts, f)     -> Post[]            (f = { year, tag, q })
//   createReader(opts)        -> lector DOM a pantalla completa (open/close/next/prev)
//   createBrowser(opts)       -> índice DOM con búsqueda, años y etiquetas
//   createHoloWall(THREE, o)  -> THREE.Group con holopaneles en arco + pick()/update()/focus()
//   mountBitacora(el, opts)   -> índice + lector juntos, sin 3D
// Ver README.md para la API completa.

export const PALETTE = {
  amber: 0xffc27a,   // color de la sala Bitácora en la nave
  violet: 0xb59bff,
  cyan: 0x7fd6ff,
  text: 0xf3ecff,
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatDate(iso, long = false) {
  const [y, m, d] = iso.split('-').map(Number);
  return long ? `${d} de ${MESES_LARGOS[m - 1]} de ${y}` : `${String(d).padStart(2, '0')} ${MESES[m - 1]} ${y}`;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- datos

/** Carga posts.json (url) o acepta directamente el objeto/array ya cargado. Añade p.n (nº de entrada, 1 = la más antigua). */
export async function loadPosts(src = './posts.json') {
  let data = src;
  if (typeof src === 'string') {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`No se pudo cargar la bitácora (${res.status})`);
    data = await res.json();
  }
  const posts = (Array.isArray(data) ? data : data.posts).slice();
  posts.sort((a, b) => (a.datetime < b.datetime ? 1 : -1));
  posts.forEach((p, i) => { p.n = posts.length - i; p._q = norm(p.title + ' ' + p.description + ' ' + p.tags.join(' ')); });
  return posts;
}

export const yearsOf = (posts) => [...new Set(posts.map((p) => p.year))].sort((a, b) => b - a);
export function tagsOf(posts) {
  const c = new Map();
  posts.forEach((p) => p.tags.forEach((t) => c.set(t, (c.get(t) || 0) + 1)));
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

export function filterPosts(posts, { year = null, tag = null, q = '' } = {}) {
  const nq = norm(q).trim();
  return posts.filter((p) => (!year || p.year === +year) && (!tag || p.tags.includes(tag)) && (!nq || (p._q || norm(p.title + ' ' + p.description)).includes(nq)));
}

// ---------------------------------------------------------------- estilos DOM

const CSS = `
.bx{--bx-bg:rgba(14,9,30,.86);--bx-panel:rgba(22,14,44,.92);--bx-line:rgba(255,194,122,.28);--bx-line2:rgba(181,155,255,.24);
--bx-text:#f3ecff;--bx-muted:#b4a6d8;--bx-amber:#ffc27a;--bx-violet:#b59bff;--bx-cyan:#7fd6ff;
--bx-display:"Orbitron","Exo 2",system-ui,sans-serif;--bx-body:"Exo 2",system-ui,sans-serif;--bx-mono:"JetBrains Mono",ui-monospace,monospace;
color:var(--bx-text);font-family:var(--bx-body);color-scheme:dark}
.bx *{box-sizing:border-box}
.bx button{font:inherit;color:inherit;cursor:pointer}
.bx :focus-visible{outline:2px solid var(--bx-cyan);outline-offset:2px}
.bx-eb{font:600 10.5px var(--bx-mono);letter-spacing:.2em;text-transform:uppercase;color:var(--bx-amber)}

/* Lector */
.bx-reader{position:fixed;inset:0;z-index:60;display:grid;place-items:center;
  padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
  background:radial-gradient(ellipse at 50% 30%,rgba(70,40,120,.45),rgba(5,3,12,.9) 70%);backdrop-filter:blur(6px);
  opacity:0;transition:opacity .35s ease}
.bx-reader.bx-on{opacity:1}
.bx-sheet{position:relative;width:min(780px,100%);max-height:100%;display:grid;grid-template-rows:auto 1fr auto;
  background:linear-gradient(180deg,rgba(40,24,66,.94),rgba(16,10,32,.96));border:1px solid var(--bx-line);border-radius:14px;
  box-shadow:0 0 0 1px rgba(255,194,122,.06),0 0 60px rgba(255,194,122,.12),0 30px 80px rgba(0,0,0,.6);
  transform:translateY(14px) scale(.985);transition:transform .45s cubic-bezier(.2,.8,.2,1);overflow:hidden}
.bx-reader.bx-on .bx-sheet{transform:none}
.bx-sheet::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:repeating-linear-gradient(180deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px)}
.bx-head{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;padding:20px 22px 14px;border-bottom:1px solid var(--bx-line2)}
.bx-head h2{margin:6px 0 0;font:700 clamp(22px,4.4vw,32px)/1.15 var(--bx-body);letter-spacing:.01em;text-wrap:balance}
.bx-meta{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px;font:400 12.5px var(--bx-mono);color:var(--bx-muted)}
.bx-tag{color:var(--bx-violet)}
.bx-x{width:38px;height:38px;border-radius:50%;border:1px solid var(--bx-line);background:transparent;font-size:18px;line-height:1}
.bx-x:hover{background:rgba(255,194,122,.12)}
.bx-body{overflow:auto;overscroll-behavior:contain;padding:20px 22px 28px;min-height:0}
.bx-prose{max-width:66ch;margin:0 auto;font:400 17px/1.7 var(--bx-body);color:#e8e0fa}
.bx-prose>*:first-child{margin-top:0}
.bx-prose p{margin:0 0 1em}
.bx-prose h1,.bx-prose h2,.bx-prose h3{font-family:var(--bx-body);font-weight:600;line-height:1.25;margin:1.6em 0 .5em;color:var(--bx-text);text-wrap:balance}
.bx-prose h2{font-size:1.35em}.bx-prose h3{font-size:1.15em}
.bx-prose a{color:var(--bx-cyan);text-underline-offset:3px}
.bx-prose em{color:#f6e3c6}
.bx-prose blockquote{margin:1.2em 0;padding:.2em 0 .2em 1em;border-left:2px solid var(--bx-amber);color:var(--bx-muted)}
.bx-prose img{display:block;max-width:100%;height:auto;margin:1em auto;border-radius:8px;border:1px solid var(--bx-line2)}
.bx-prose hr{border:0;border-top:1px solid var(--bx-line2);margin:2em 0}
.bx-prose ul,.bx-prose ol{padding-left:1.4em}
.bx-prose table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%}
.bx-prose td,.bx-prose th{border:1px solid var(--bx-line2);padding:4px 8px}
.bx-prose pre{overflow-x:auto;background:rgba(0,0,0,.3);padding:12px;border-radius:8px}
.bx-media{display:flex;align-items:center;gap:10px;margin:1em 0;padding:10px 14px;border:1px dashed var(--bx-line);border-radius:10px;
  font:500 13px var(--bx-mono);color:var(--bx-muted);text-decoration:none}
a.bx-media:hover{background:rgba(255,194,122,.08);color:var(--bx-text)}
.bx-media b{color:var(--bx-amber);font-weight:600}
.bx-foot{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid var(--bx-line2);background:rgba(0,0,0,.18)}
.bx-nav{display:grid;gap:2px;padding:8px 12px;border:1px solid transparent;border-radius:10px;background:transparent;text-align:left;min-width:0}
.bx-nav:hover:not(:disabled){border-color:var(--bx-line)}
.bx-nav:disabled{opacity:.3;cursor:default}
.bx-nav.bx-r{text-align:right}
.bx-nav span{font:600 10px var(--bx-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--bx-muted)}
.bx-nav strong{font:500 14px var(--bx-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bx-ext{font:600 11px var(--bx-mono);letter-spacing:.08em;color:var(--bx-cyan);text-decoration:none;white-space:nowrap}
@media (max-width:560px){.bx-foot{grid-template-columns:1fr 1fr}.bx-ext{grid-column:1/-1;grid-row:1;text-align:center}.bx-prose{font-size:16px}}

/* Índice */
.bx-browser{display:grid;grid-template-rows:auto auto 1fr;gap:12px;min-height:0;height:100%}
.bx-search{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--bx-line2);background:rgba(0,0,0,.28);color:var(--bx-text);font:400 14px var(--bx-body)}
.bx-search::placeholder{color:var(--bx-muted)}
.bx-chips{display:flex;flex-wrap:wrap;gap:6px}
.bx-chip{padding:5px 10px;border-radius:999px;border:1px solid var(--bx-line2);background:transparent;font:500 12px var(--bx-mono);color:var(--bx-muted);font-variant-numeric:tabular-nums}
.bx-chip:hover{color:var(--bx-text)}
.bx-chip[aria-pressed="true"]{border-color:var(--bx-amber);color:#1a1022;background:var(--bx-amber)}
.bx-chip.bx-t[aria-pressed="true"]{border-color:var(--bx-violet);background:var(--bx-violet)}
.bx-list{list-style:none;margin:0;padding:0 4px 0 0;overflow:auto;min-height:0;display:grid;gap:2px;align-content:start}
.bx-item{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:transparent;text-align:left}
.bx-item:hover,.bx-item.bx-cur{background:rgba(255,194,122,.09)}
.bx-item .bx-n{grid-row:span 2;font:600 11px var(--bx-mono);color:var(--bx-amber);padding-top:3px;font-variant-numeric:tabular-nums}
.bx-item .bx-tt{font:500 14.5px/1.3 var(--bx-body);color:var(--bx-text);min-width:0}
.bx-item .bx-dd{font:400 11.5px var(--bx-mono);color:var(--bx-muted)}
.bx-empty{color:var(--bx-muted);font-size:14px;padding:12px 10px}
.bx-count{font:400 11.5px var(--bx-mono);color:var(--bx-muted)}
`;

export function injectStyles(doc = document) {
  if (doc.getElementById('bitacora-styles')) return;
  const s = doc.createElement('style');
  s.id = 'bitacora-styles';
  s.textContent = CSS;
  doc.head.appendChild(s);
}

// ---------------------------------------------------------------- lector

function prepareHtml(html, embeds) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const root = t.content;
  root.querySelectorAll('script,style,object,embed').forEach((n) => n.remove());
  root.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  if (embeds === 'link') {
    root.querySelectorAll('iframe').forEach((f) => {
      const src = f.getAttribute('src') || '';
      const name = /youtube/.test(src) ? 'YouTube' : /vimeo/.test(src) ? 'Vimeo' : 'el sitio original';
      const href = src.replace('youtube.com/embed/', 'youtube.com/watch?v=').replace('player.vimeo.com/video/', 'vimeo.com/');
      const a = document.createElement('a');
      a.className = 'bx-media'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = `<b>▶ Vídeo</b> Ver en ${name}`;
      f.replaceWith(a);
    });
    root.querySelectorAll('audio').forEach((au) => {
      const src = au.getAttribute('src') || au.querySelector('source')?.getAttribute('src') || '';
      const a = document.createElement('a');
      a.className = 'bx-media'; a.href = src; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<b>♪ Audio</b> Escuchar la grabación';
      au.replaceWith(a);
    });
  }
  return root;
}

/**
 * Lector a pantalla completa.
 * opts: { posts, container=document.body, embeds:'link'|'native', onOpen(post), onClose(post), onLink(post)->bool }
 */
export function createReader({ posts, container = document.body, embeds = 'link', onOpen, onClose } = {}) {
  injectStyles(container.ownerDocument);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const byUrl = new Map(posts.map((p) => [p.url.replace(/\/$/, ''), p]));
  const el = document.createElement('div');
  el.className = 'bx bx-reader';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'bx-title');
  el.innerHTML = `<article class="bx-sheet">
    <header class="bx-head"><div><div class="bx-eb" data-r="eb"></div><h2 id="bx-title" data-r="title"></h2><div class="bx-meta" data-r="meta"></div></div>
      <button type="button" class="bx-x" data-r="close" aria-label="Cerrar la entrada">✕</button></header>
    <div class="bx-body" data-r="body" tabindex="0"><div class="bx-prose" data-r="prose"></div></div>
    <footer class="bx-foot">
      <button type="button" class="bx-nav" data-r="prev"><span>‹ Anterior</span><strong></strong></button>
      <a class="bx-ext" data-r="ext" target="_blank" rel="noopener">Ver en malkevnia.com ↗</a>
      <button type="button" class="bx-nav bx-r" data-r="next"><span>Siguiente ›</span><strong></strong></button>
    </footer></article>`;
  container.appendChild(el);
  const $ = (k) => el.querySelector(`[data-r="${k}"]`);
  let current = null, lastFocus = null, hideTimer = 0;

  // la lista va de más reciente a más antigua: "anterior" (más antigua) = índice + 1
  const neighbour = (p, dir) => posts[posts.indexOf(p) + (dir < 0 ? 1 : -1)] || null;

  function render(p) {
    $('eb').textContent = `Entrada ${String(p.n).padStart(3, '0')} · Bitácora del capitán`;
    $('title').textContent = p.title;
    $('meta').innerHTML = `<time datetime="${p.date}">${formatDate(p.date, true)}</time><span>${p.readingMinutes} min de lectura</span>` +
      (p.tags.length ? `<span>${p.tags.map((t) => `<span class="bx-tag">#${esc(t)}</span>`).join(' ')}</span>` : '');
    const prose = $('prose');
    prose.replaceChildren(prepareHtml(p.html, embeds));
    prose.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => {
      const a = document.createElement('a');
      a.className = 'bx-media'; a.href = img.src; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = '<b>▣ Imagen</b> No se puede mostrar aquí, ábrela aparte';
      img.replaceWith(a);
    }, { once: true }));
    $('ext').href = p.url;
    for (const [k, dir] of [['prev', -1], ['next', 1]]) {
      const n = neighbour(p, dir), b = $(k);
      b.disabled = !n;
      b.querySelector('strong').textContent = n ? n.title : '—';
    }
    $('body').scrollTop = 0;
  }

  function open(ref) {
    const p = typeof ref === 'string' ? byId.get(ref) : ref;
    if (!p) return null;
    clearTimeout(hideTimer);
    if (!current) lastFocus = document.activeElement;
    current = p;
    render(p);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('bx-on'));
    $('close').focus({ preventScroll: true });
    onOpen && onOpen(p);
    return p;
  }
  function close() {
    if (!current) return;
    const p = current;
    current = null;
    el.classList.remove('bx-on');
    hideTimer = setTimeout(() => { el.hidden = true; }, 350);
    lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
    onClose && onClose(p);
  }
  const step = (dir) => { const n = current && neighbour(current, dir); if (n) open(n); };

  $('close').addEventListener('click', close);
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  el.addEventListener('click', (e) => {
    if (e.target === el) return close();
    const a = e.target.closest('a[href]');
    if (!a) return;
    const hit = byUrl.get(a.href.replace(/\/$/, ''));
    if (hit) { e.preventDefault(); open(hit); }   // enlaces entre entradas se abren dentro del lector
  });
  const onKey = (e) => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && !e.target.closest('input,textarea')) step(-1);
    else if (e.key === 'ArrowRight' && !e.target.closest('input,textarea')) step(1);
    else if (e.key === 'Tab') { // foco atrapado dentro del lector
      const f = [...el.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    el, open, close,
    next: () => step(1), prev: () => step(-1),
    get isOpen() { return !!current; },
    get current() { return current; },
    destroy() { document.removeEventListener('keydown', onKey); el.remove(); },
  };
}

// ---------------------------------------------------------------- índice

/**
 * Índice navegable: búsqueda, años, etiquetas y lista.
 * opts: { posts, container, onSelect(post), onFilter(list, filter), filter:{year,tag,q}, maxTags=10 }
 */
export function createBrowser({ posts, container, onSelect, onFilter, filter = {}, maxTags = 10 } = {}) {
  injectStyles(container.ownerDocument);
  const state = { year: null, tag: null, q: '', ...filter };
  const el = document.createElement('div');
  el.className = 'bx bx-browser';
  const years = yearsOf(posts), tags = tagsOf(posts).slice(0, maxTags);
  el.innerHTML = `<input class="bx-search" id="bx-search" type="search" placeholder="Buscar en la bitácora…" aria-label="Buscar en la bitácora" autocomplete="off">
    <div style="display:grid;gap:8px">
      <div class="bx-chips" role="group" aria-label="Año">
        <button type="button" class="bx-chip" data-y="">Todas</button>${years.map((y) => `<button type="button" class="bx-chip" data-y="${y}">${y}</button>`).join('')}
      </div>
      <div class="bx-chips" role="group" aria-label="Etiqueta">${tags.map(({ tag }) => `<button type="button" class="bx-chip bx-t" data-t="${esc(tag)}">#${esc(tag)}</button>`).join('')}</div>
      <div class="bx-count" aria-live="polite"></div>
    </div>
    <ul class="bx-list"></ul>`;
  container.appendChild(el);
  const input = el.querySelector('.bx-search'), list = el.querySelector('.bx-list'), count = el.querySelector('.bx-count');
  input.value = state.q;
  let filtered = [], currentId = null;

  function refresh(emit = true) {
    filtered = filterPosts(posts, state);
    el.querySelectorAll('[data-y]').forEach((b) => b.setAttribute('aria-pressed', String(String(state.year || '') === b.dataset.y)));
    el.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-pressed', String(state.tag === b.dataset.t)));
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'entrada' : 'entradas'}`;
    list.innerHTML = filtered.length ? filtered.map((p) => `<li><button type="button" class="bx-item${p.id === currentId ? ' bx-cur' : ''}" data-id="${p.id}">
        <span class="bx-n">${String(p.n).padStart(3, '0')}</span><span class="bx-tt">${esc(p.title)}</span><span class="bx-dd">${formatDate(p.date)}</span></button></li>`).join('')
      : '<li class="bx-empty">Ninguna entrada coincide. Prueba con otra palabra o quita un filtro.</li>';
    if (emit && onFilter) onFilter(filtered, { ...state });
  }
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; refresh(); }, 160); });
  el.addEventListener('click', (e) => {
    const y = e.target.closest('[data-y]'), tg = e.target.closest('[data-t]'), it = e.target.closest('[data-id]');
    if (y) { state.year = y.dataset.y ? +y.dataset.y : null; refresh(); }
    else if (tg) { state.tag = state.tag === tg.dataset.t ? null : tg.dataset.t; refresh(); }
    else if (it) { const p = posts.find((x) => x.id === it.dataset.id); p && onSelect && onSelect(p); }
  });
  refresh(false);

  return {
    el,
    get filtered() { return filtered; },
    get filter() { return { ...state }; },
    setFilter(f) { Object.assign(state, f); input.value = state.q || ''; refresh(); },
    setCurrent(id) { currentId = id; list.querySelectorAll('.bx-item').forEach((b) => b.classList.toggle('bx-cur', b.dataset.id === id)); },
    focusSearch() { input.focus(); },
    destroy() { el.remove(); },
  };
}

/** Índice + lector juntos, sin 3D. Útil como pantalla de la consola o versión ligera en móvil. */
export function mountBitacora(container, { posts, embeds = 'link', onOpen, onClose } = {}) {
  const reader = createReader({ posts, embeds, onOpen, onClose });
  const browser = createBrowser({ posts, container, onSelect: (p) => reader.open(p) });
  return { reader, browser, destroy() { reader.destroy(); browser.destroy(); } };
}

// ---------------------------------------------------------------- holopanel (canvas)

function wrap(ctx, text, maxW, maxLines) {
  const words = text.split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  const used = lines.join(' ').split(/\s+/).length;
  if (used < words.length) {
    let last = lines[maxLines - 1] || '';
    while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/[\s,.;:]+$/, '') + '…';
  }
  return lines;
}

/** Dibuja la cara de un holopanel. Devuelve un <canvas> de w×h (por defecto 640×400). */
export function drawPanelCanvas(post, { w = 640, h = 400, color = PALETTE.amber, accent = PALETTE.violet } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const r = 22, pad = 34;
  g.clearRect(0, 0, w, h);
  // cuerpo translúcido
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, rgba(color, 0.22)); bg.addColorStop(0.55, rgba(accent, 0.10)); bg.addColorStop(1, rgba(accent, 0.05));
  g.beginPath(); g.roundRect(3, 3, w - 6, h - 6, r); g.fillStyle = bg; g.fill();
  g.save(); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  g.restore();
  g.lineWidth = 2; g.strokeStyle = rgba(color, 0.55); g.stroke();
  // esquinas
  g.strokeStyle = hex(color); g.lineWidth = 4;
  const k = 26;
  for (const [x, y, sx, sy] of [[10, 10, 1, 1], [w - 10, 10, -1, 1], [10, h - 10, 1, -1], [w - 10, h - 10, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * k); g.lineTo(x, y); g.lineTo(x + sx * k, y); g.stroke();
  }
  // cabecera
  g.textBaseline = 'alphabetic';
  g.fillStyle = hex(color);
  g.font = '600 19px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(`ENTRADA ${String(post.n).padStart(3, '0')}`, pad, pad + 20);
  g.textAlign = 'right'; g.fillStyle = rgba(PALETTE.text, 0.7);
  g.fillText(formatDate(post.date).toUpperCase(), w - pad, pad + 20);
  g.textAlign = 'left';
  g.fillStyle = rgba(color, 0.35); g.fillRect(pad, pad + 36, w - pad * 2, 1.5);
  // título
  g.fillStyle = hex(PALETTE.text);
  g.font = '600 40px "Exo 2", system-ui, sans-serif';
  const tl = wrap(g, post.title, w - pad * 2, 3);
  tl.forEach((l, i) => g.fillText(l, pad, pad + 92 + i * 46));
  // descripción
  const dy = pad + 92 + tl.length * 46 + 6;
  g.fillStyle = rgba(PALETTE.text, 0.62);
  g.font = '300 23px "Exo 2", system-ui, sans-serif';
  const dl = wrap(g, post.description.replace(/\s*\.\.\.$/, '…'), w - pad * 2, Math.max(1, 5 - tl.length));
  dl.forEach((l, i) => g.fillText(l, pad, dy + i * 31));
  // pie
  g.font = '500 18px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = hex(accent);
  const tags = post.tags.filter((t) => t !== 'archivo').slice(0, 3).map((t) => '#' + t).join('  ');
  g.fillText(tags, pad, h - pad);
  g.textAlign = 'right'; g.fillStyle = rgba(PALETTE.text, 0.55);
  g.fillText(`${post.readingMinutes} MIN`, w - pad, h - pad);
  return c;
}

// ---------------------------------------------------------------- muro holográfico (Three.js)

/**
 * Arco de holopaneles orientados hacia el centro (donde está el lector/cámara).
 * opts: { posts, radius=3.4, rows=2, perRow=12, spacing=0.44 (rad), panelWidth=1.3, baseY=1.05, rowGap=0.95,
 *         color, accent, emitter=true, reducedMotion }
 * Devuelve { group, setPosts(list), page, pages, setPage(i), nextPage(), prevPage(), focus(post), spin(dRad),
 *            pick(raycaster), hover(post|null), update(t, dt), dispose() }
 */
export function createHoloWall(THREE, opts = {}) {
  const o = {
    radius: 3.4, rows: 2, perRow: 12, spacing: 0.44, panelWidth: 1.3, baseY: 1.05, rowGap: 0.95,
    color: PALETTE.amber, accent: PALETTE.violet, emitter: true,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    ...opts,
  };
  const perPage = o.rows * o.perRow;
  const group = new THREE.Group();
  group.name = 'bitacora-holowall';
  const ring = new THREE.Group();   // lo que gira
  group.add(ring);
  const pw = o.panelWidth, ph = pw * 0.625;
  const geo = new THREE.PlaneGeometry(pw, ph);
  let list = o.posts || [], page = 0, panels = [], hovered = null;
  ring.rotation.order = 'YXZ';
  let rot = 0, vel = 0, target = null, limit = 0;

  // emisor: anillo en el suelo + haces finos hasta la fila inferior
  let emitter = null;
  if (o.emitter) {
    emitter = new THREE.Group();
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(o.radius, 0.012, 8, 160),
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.55, toneMapped: false }));
    ringMesh.rotation.x = Math.PI / 2; ringMesh.position.y = 0.02;
    emitter.add(ringMesh);
    group.add(emitter);
  }
  const beamMat = new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.18, toneMapped: false, depthWrite: false });
  let beams = null;

  function slotAngle(i, count) { return (i - (count - 1) / 2) * o.spacing; }

  function build() {
    panels.forEach((p) => { p.mesh.material.map.dispose(); p.mesh.material.dispose(); ring.remove(p.mesh); });
    if (beams) { ring.remove(beams); beams.geometry.dispose(); beams = null; }
    panels = [];
    const slice = list.slice(page * perPage, page * perPage + perPage);
    const perRowNow = Math.min(o.perRow, Math.ceil(slice.length / o.rows) || 1);
    const pts = [];
    slice.forEach((post, idx) => {
      // de izquierda a derecha y de arriba abajo: col = idx % perRow
      const row = Math.floor(idx / perRowNow), col = idx % perRowNow;
      const inRow = Math.min(perRowNow, slice.length - row * perRowNow);
      const a = slotAngle(col, inRow);
      const y = o.baseY + (o.rows - 1 - row) * o.rowGap;
      const tex = new THREE.CanvasTexture(drawPanelCanvas(post, { color: o.color, accent: o.accent }));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Math.sin(a) * o.radius, y, -Math.cos(a) * o.radius);
      mesh.rotation.y = -a;
      mesh.userData.post = post;
      mesh.renderOrder = 2;
      ring.add(mesh);
      panels.push({ mesh, post, a, y, born: idx * 0.035, life: 0, seed: Math.random() * 100, s: 1 });
      if (row === o.rows - 1 || slice.length <= perRowNow) pts.push(mesh.position.x, 0.02, mesh.position.z, mesh.position.x, y - ph / 2, mesh.position.z);
    });
    if (pts.length) {
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      beams = new THREE.LineSegments(bg, beamMat);
      ring.add(beams);
    }
    const half = ((perRowNow - 1) / 2) * o.spacing;
    limit = Math.max(0, half);
    target = 0;
  }

  const api = {
    group,
    get panels() { return panels; },
    get page() { return page; },
    get pages() { return Math.max(1, Math.ceil(list.length / perPage)); },
    get posts() { return list; },
    get rotation() { return rot; },
    get limit() { return limit; },
    setPosts(next) { list = next; page = 0; build(); },
    setPage(i) { const n = Math.max(0, Math.min(api.pages - 1, i)); if (n !== page) { page = n; build(); } return page; },
    nextPage() { return api.setPage(page + 1); },
    prevPage() { return api.setPage(page - 1); },
    /** Lleva el muro a la página del post y lo gira hasta tenerlo de frente. */
    focus(post) {
      const i = list.indexOf(post);
      if (i < 0) return false;
      api.setPage(Math.floor(i / perPage));
      const p = panels.find((x) => x.post === post);
      if (p) target = p.a;
      return true;
    },
    spin(d) { vel += d; target = null; },
    pick(raycaster) {
      const hit = raycaster.intersectObjects(panels.map((p) => p.mesh), false)[0];
      return hit ? hit.object.userData.post : null;
    },
    hover(post) { hovered = post || null; },
    update(t, dt = 1 / 60) {
      // giro con inercia y límites suaves
      if (target !== null) { rot += (target - rot) * Math.min(1, dt * 4); if (Math.abs(target - rot) < 1e-4) target = null; }
      else { rot += vel; vel *= Math.pow(0.002, dt); }
      if (rot > limit) { rot += (limit - rot) * Math.min(1, dt * 6); vel *= 0.5; }
      if (rot < -limit) { rot += (-limit - rot) * Math.min(1, dt * 6); vel *= 0.5; }
      ring.rotation.y = rot;
      for (const p of panels) {
        p.life += dt;
        const born = Math.max(0, Math.min(1, (p.life - p.born) * 1.8));
        const e = 1 - Math.pow(1 - born, 3);
        const hov = hovered === p.post;
        p.s += ((hov ? 1.07 : 1) - p.s) * Math.min(1, dt * 10);
        p.mesh.scale.set(p.s, p.s * (0.05 + 0.95 * e), 1);
        const flick = o.reducedMotion ? 0 : (Math.sin(t * 2.1 + p.seed) * 0.03 + (Math.sin(t * 13 + p.seed * 3) > 0.995 ? -0.25 : 0));
        p.mesh.material.opacity = e * ((hov ? 1 : 0.86) + flick);
        p.mesh.position.y = p.y + (o.reducedMotion ? 0 : Math.sin(t * 0.7 + p.seed) * 0.012);
      }
      if (emitter && !o.reducedMotion) emitter.children[0].material.opacity = 0.45 + Math.sin(t * 1.3) * 0.12;
    },
    dispose() {
      panels.forEach((p) => { p.mesh.material.map.dispose(); p.mesh.material.dispose(); });
      geo.dispose(); beamMat.dispose();
      if (beams) beams.geometry.dispose();
      if (emitter) emitter.traverse((n) => { n.geometry && n.geometry.dispose(); n.material && n.material.dispose(); });
      group.removeFromParent();
    },
  };
  build();
  return api;
}
