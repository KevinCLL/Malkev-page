// bitacora.js · Bitácora del capitán para La Malkevnia
// Módulo ES autocontenido, sin dependencias. Three.js NO se importa: quien lo use pasa su propio THREE
// a createHoloWall(), así comparte instancia con la nave (probado con three@0.160.0).
//
// Piezas:
//   loadPosts(src)            -> Promise<Post[]>   (posts.json exportado de malkevnia.com, más recientes primero)
//   filterPosts(posts, f)     -> Post[]            (f = { year, tag, q }; con q, ordenadas por relevancia)
//   createReader(opts)        -> lector DOM a pantalla completa (open/close/next/prev)
//   createBrowser(opts)       -> índice DOM con búsqueda, años y etiquetas
//   createHoloWall(THREE, o)  -> THREE.Group con holopaneles en arco + pick()/update()/focus()
//   mountBitacora(el, opts)   -> índice + lector juntos, sin 3D
// Ver README.md para la API completa.

export const VERSION = '1.1.0';

export const PALETTE = {
  amber: 0xffc27a,   // color de la sala Bitácora en la nave
  violet: 0xb59bff,
  cyan: 0x7fd6ff,
  text: 0xf3ecff,
};

/** Pesos de fuente que usa el módulo (los mismos que carga la nave). */
export const FONTS = ['300 23px "Exo 2"', '400 17px "Exo 2"', '600 40px "Exo 2"', '400 13px "JetBrains Mono"', '600 19px "JetBrains Mono"'];

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function formatDate(iso, long = false) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return long ? `${d} de ${MESES_LARGOS[m - 1]} de ${y}` : `${String(d).padStart(2, '0')} ${MESES[m - 1]} ${y}`;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const rgba = (c, a) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad3 = (n) => String(n).padStart(3, '0');
const stripTags = (h) => String(h).replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();
let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

// ---------------------------------------------------------------- datos

/**
 * Carga posts.json (URL) o acepta el objeto/array ya cargado. Devuelve una lista nueva, de más reciente a más antigua,
 * y añade a cada post: n (nº de entrada, 1 = la más antigua) y text (texto plano del cuerpo, para buscar).
 */
export async function loadPosts(src = './posts.json') {
  let data = src;
  if (typeof src === 'string') {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`No se pudo cargar la bitácora (${res.status})`);
    data = await res.json();
  }
  const posts = (Array.isArray(data) ? data : data.posts).slice();
  posts.sort((a, b) => (a.datetime === b.datetime ? (a.id < b.id ? 1 : -1) : a.datetime < b.datetime ? 1 : -1));
  posts.forEach((p, i) => {
    p.n = posts.length - i;
    if (p.text == null) Object.defineProperty(p, 'text', { value: stripTags(p.html), enumerable: false, writable: true, configurable: true });
    Object.defineProperty(p, '_q', {
      value: { title: norm(p.title), tags: norm(p.tags.join(' ')), desc: norm(p.description), body: norm(p.text) },
      enumerable: false, writable: true, configurable: true,
    });
  });
  return posts;
}

export const yearsOf = (posts) => [...new Set(posts.map((p) => p.year))].sort((a, b) => b - a);
export function tagsOf(posts) {
  const c = new Map();
  posts.forEach((p) => p.tags.forEach((t) => c.set(t, (c.get(t) || 0) + 1)));
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(([tag, count]) => ({ tag, count }));
}

function index(p) {
  return p._q || { title: norm(p.title), tags: norm((p.tags || []).join(' ')), desc: norm(p.description), body: norm(p.text || stripTags(p.html || '')) };
}

/** Puntuación de una entrada para una búsqueda (0 = no coincide). Todas las palabras deben aparecer. */
export function scorePost(p, q) {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const ix = index(p);
  let score = 0;
  for (const t of terms) {
    const s = (ix.title.includes(t) ? 12 : 0) + (ix.tags.includes(t) ? 6 : 0) + (ix.desc.includes(t) ? 3 : 0) + (ix.body.includes(t) ? 1 : 0);
    if (!s) return 0;
    score += s;
  }
  return score;
}

/** Filtra por año, etiqueta y texto. Sin texto mantiene el orden cronológico; con texto ordena por relevancia. */
export function filterPosts(posts, { year = null, tag = null, q = '' } = {}) {
  const out = posts.filter((p) => (!year || p.year === +year) && (!tag || p.tags.includes(tag)));
  if (!norm(q).trim()) return out;
  return out.map((p) => [p, scorePost(p, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/** Fragmento del cuerpo alrededor de la primera coincidencia (para mostrar por qué salió en la búsqueda). */
export function matchSnippet(p, q, radius = 70) {
  const term = norm(q).split(/\s+/).filter(Boolean)[0];
  const text = p.text || stripTags(p.html || '');
  if (!term) return '';
  const at = norm(text).indexOf(term); // norm conserva la longitud de las letras latinas
  if (at < 0) return '';
  const a = Math.max(0, at - radius), b = Math.min(text.length, at + term.length + radius);
  return (a > 0 ? '…' : '') + text.slice(a, b).trim() + (b < text.length ? '…' : '');
}

// ---------------------------------------------------------------- estilos DOM

const STYLES = `
.bx{--bx-line:rgba(255,194,122,.28);--bx-line2:rgba(181,155,255,.24);
--bx-text:#f3ecff;--bx-muted:#b4a6d8;--bx-amber:#ffc27a;--bx-violet:#b59bff;--bx-cyan:#7fd6ff;
--bx-body:"Exo 2",system-ui,sans-serif;--bx-mono:"JetBrains Mono",ui-monospace,monospace;
color:var(--bx-text);font-family:var(--bx-body);color-scheme:dark;-webkit-text-size-adjust:100%}
.bx *{box-sizing:border-box}
.bx button{font:inherit;color:inherit;cursor:pointer}
.bx :focus-visible{outline:2px solid var(--bx-cyan);outline-offset:2px}
.bx-eb{font:600 10.5px var(--bx-mono);letter-spacing:.2em;text-transform:uppercase;color:var(--bx-amber)}

/* Lector */
.bx-reader{position:fixed;inset:0;z-index:60;display:grid;place-items:center;
  padding:max(16px,env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) max(16px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));
  background:radial-gradient(ellipse at 50% 35%,rgba(56,32,100,.62),rgba(5,3,12,.94) 72%);
  opacity:0;transition:opacity .35s ease}
.bx-reader[hidden]{display:none}
.bx-reader.bx-on{opacity:1}
.bx-sheet{position:relative;width:min(780px,100%);max-height:100%;display:grid;grid-template-rows:auto 1fr auto;
  background:linear-gradient(180deg,rgba(40,24,66,.97),rgba(16,10,32,.98));border:1px solid var(--bx-line);border-radius:14px;
  box-shadow:0 0 0 1px rgba(255,194,122,.06),0 0 60px rgba(255,194,122,.12),0 30px 80px rgba(0,0,0,.6);
  transform:translateY(14px) scale(.985);transition:transform .45s cubic-bezier(.2,.8,.2,1);overflow:hidden}
.bx-reader.bx-on .bx-sheet{transform:none}
.bx-sheet::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;z-index:1;
  background:repeating-linear-gradient(180deg,rgba(255,255,255,.016) 0 1px,transparent 1px 4px)}
.bx-progress{position:absolute;left:0;top:0;height:2px;width:100%;transform-origin:0 50%;transform:scaleX(0);z-index:2;
  background:linear-gradient(90deg,var(--bx-violet),var(--bx-amber));box-shadow:0 0 10px rgba(255,194,122,.6)}
.bx-head{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start;padding:20px 22px 14px;border-bottom:1px solid var(--bx-line2)}
.bx-head h2{margin:6px 0 0;font:600 clamp(22px,4.4vw,32px)/1.15 var(--bx-body);letter-spacing:.01em;text-wrap:balance;overflow-wrap:anywhere}
.bx-meta{display:flex;flex-wrap:wrap;gap:4px 0;margin-top:10px;font:400 12.5px var(--bx-mono);color:var(--bx-muted)}
.bx-meta>*+*::before{content:"·";margin:0 9px;color:var(--bx-line)}
.bx-tag{color:var(--bx-violet)}
.bx-x{width:40px;height:40px;border-radius:50%;border:1px solid var(--bx-line);background:transparent;font-size:18px;line-height:1}
.bx-x:hover{background:rgba(255,194,122,.12)}
.bx-body{overflow:auto;overscroll-behavior:contain;padding:20px 22px 28px;min-height:0;-webkit-overflow-scrolling:touch}
.bx-body:focus{outline:none}
.bx-prose{max-width:66ch;margin:0 auto;font:400 17px/1.7 var(--bx-body);color:#e8e0fa;overflow-wrap:break-word}
.bx-prose>*:first-child{margin-top:0}
.bx-prose p{margin:0 0 1em}
.bx-prose h1,.bx-prose h2,.bx-prose h3,.bx-prose h4,.bx-prose h5,.bx-prose h6{font-family:var(--bx-body);font-weight:600;line-height:1.25;margin:1.6em 0 .5em;color:var(--bx-text);text-wrap:balance;scroll-margin-top:12px}
.bx-prose h2{font-size:1.35em}.bx-prose h3{font-size:1.15em}.bx-prose h4,.bx-prose h5,.bx-prose h6{font-size:1em;color:var(--bx-amber)}
.bx-prose a{color:var(--bx-cyan);text-underline-offset:3px}
.bx-prose em{color:#f6e3c6}
.bx-prose strong{color:#fff;font-weight:600}
.bx-prose blockquote{margin:1.2em 0;padding:.2em 0 .2em 1em;border-left:2px solid var(--bx-amber);color:var(--bx-muted)}
.bx-prose img{display:block;max-width:100%;height:auto;margin:1em auto;border-radius:8px;border:1px solid var(--bx-line2);background:rgba(0,0,0,.25)}
.bx-prose hr{border:0;border-top:1px solid var(--bx-line2);margin:2em 0}
.bx-prose ul,.bx-prose ol{padding-left:1.4em}
.bx-prose li+li{margin-top:.25em}
.bx-prose table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;font-size:.92em;margin:1em 0}
.bx-prose td,.bx-prose th{border:1px solid var(--bx-line2);padding:5px 9px;text-align:left;vertical-align:top}
.bx-prose th{color:var(--bx-amber);font-weight:600}
.bx-prose code{font:400 .86em var(--bx-mono);background:rgba(181,155,255,.12);padding:.1em .35em;border-radius:4px}
.bx-prose pre{overflow-x:auto;background:rgba(0,0,0,.32);padding:12px 14px;border-radius:8px;border:1px solid var(--bx-line2);line-height:1.5}
.bx-prose pre code{background:none;padding:0;font-size:.82em}
.bx-prose .highlight .k,.bx-prose .highlight .kd,.bx-prose .highlight .kr{color:var(--bx-amber)}
.bx-prose .highlight .s,.bx-prose .highlight .s1,.bx-prose .highlight .s2{color:var(--bx-cyan)}
.bx-prose .highlight .c,.bx-prose .highlight .c1,.bx-prose .highlight .cm{color:var(--bx-muted);font-style:italic}
.bx-prose .highlight .nf,.bx-prose .highlight .nx{color:#e8e0fa}.bx-prose .highlight .mi{color:var(--bx-violet)}
.bx-prose audio{display:block;width:100%;margin:1em 0}
.bx-toc{margin:0 0 1.4em;border:1px solid var(--bx-line2);border-radius:10px;padding:2px 14px;font-size:15px}
.bx-toc summary{cursor:pointer;padding:9px 0;font:600 11px var(--bx-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--bx-amber)}
.bx-toc ol{margin:0 0 12px;padding-left:1.3em;columns:2 15em;column-gap:2em}
.bx-toc li{break-inside:avoid}
.bx-toc a{color:var(--bx-text);text-decoration:none}.bx-toc a:hover{color:var(--bx-cyan)}
.bx-media{display:flex;align-items:center;gap:12px;margin:1em 0;padding:10px 14px;border:1px dashed var(--bx-line);border-radius:10px;
  font:400 13px var(--bx-mono);color:var(--bx-muted);text-decoration:none;overflow-wrap:anywhere}
a.bx-media:hover{background:rgba(255,194,122,.08);color:var(--bx-text)}
.bx-media b{color:var(--bx-amber);font-weight:600;white-space:nowrap}
.bx-media img{width:96px;height:54px;object-fit:cover;margin:0;border-radius:6px;flex:none}
.bx-foot{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid var(--bx-line2);background:rgba(0,0,0,.18)}
.bx-nav{display:grid;gap:2px;padding:8px 12px;border:1px solid transparent;border-radius:10px;background:transparent;text-align:left;min-width:0}
.bx-nav:hover:not(:disabled){border-color:var(--bx-line)}
.bx-nav:disabled{opacity:.3;cursor:default}
.bx-nav.bx-r{text-align:right}
.bx-nav span{font:600 10px var(--bx-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--bx-muted)}
.bx-nav strong{font:400 14px var(--bx-body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bx-ext{font:600 11px var(--bx-mono);letter-spacing:.08em;color:var(--bx-cyan);text-decoration:none;white-space:nowrap}
@media (max-width:560px){.bx-head{padding:16px 16px 12px}.bx-body{padding:16px 16px 24px}.bx-foot{grid-template-columns:1fr 1fr;padding:10px}.bx-ext{grid-column:1/-1;grid-row:1;text-align:center}.bx-prose{font-size:16px}}
@media (prefers-reduced-motion:reduce){.bx-reader,.bx-sheet{transition:none}}

/* Índice */
.bx-browser{display:grid;grid-template-rows:auto auto 1fr;gap:12px;min-height:0;height:100%}
.bx-search{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--bx-line2);background:rgba(0,0,0,.28);color:var(--bx-text);font:400 16px var(--bx-body)}
.bx-search::placeholder{color:var(--bx-muted)}
.bx-chips{display:flex;flex-wrap:wrap;gap:6px}
.bx-chip{padding:5px 10px;border-radius:999px;border:1px solid var(--bx-line2);background:transparent;font:400 12px var(--bx-mono);color:var(--bx-muted);font-variant-numeric:tabular-nums}
.bx-chip:hover{color:var(--bx-text);border-color:var(--bx-line)}
.bx-chip[aria-pressed="true"]{border-color:var(--bx-amber);color:#1a1022;background:var(--bx-amber);font-weight:600}
.bx-chip.bx-t[aria-pressed="true"]{border-color:var(--bx-violet);background:var(--bx-violet)}
.bx-list{list-style:none;margin:0;padding:0 4px 0 0;overflow:auto;min-height:0;display:grid;gap:2px;align-content:start;overscroll-behavior:contain}
.bx-item{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;width:100%;padding:9px 10px;border:0;border-radius:8px;background:transparent;text-align:left}
.bx-item:hover,.bx-item.bx-cur{background:rgba(255,194,122,.09)}
.bx-item.bx-cur .bx-tt{color:var(--bx-amber)}
.bx-item .bx-n{grid-row:span 3;font:600 11px var(--bx-mono);color:var(--bx-amber);padding-top:3px;font-variant-numeric:tabular-nums}
.bx-item .bx-tt{font:400 15px/1.3 var(--bx-body);color:var(--bx-text);min-width:0}
.bx-item .bx-dd{font:400 11.5px var(--bx-mono);color:var(--bx-muted)}
.bx-item .bx-sn{font:300 13px/1.4 var(--bx-body);color:var(--bx-muted);min-width:0}
.bx-item mark{background:rgba(255,194,122,.22);color:var(--bx-text);border-radius:3px;padding:0 2px}
.bx-empty{color:var(--bx-muted);font-size:14px;padding:12px 10px}
.bx-count{font:400 11.5px var(--bx-mono);color:var(--bx-muted)}
`;

export function injectStyles(doc = document) {
  if (doc.getElementById('bitacora-styles')) return;
  const s = doc.createElement('style');
  s.id = 'bitacora-styles';
  s.textContent = STYLES;
  doc.head.appendChild(s);
}

// ---------------------------------------------------------------- lector

const SITE_POST = /\/blog\/\d{4}\/\d{2}\/\d{2}\/([^/?#]+)/;
const ytId = (src) => (src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/) || [])[1];

function mediaLink(href, label, text, thumb) {
  const a = document.createElement('a');
  a.className = 'bx-media'; a.href = href; a.target = '_blank'; a.rel = 'noopener';
  if (thumb) {
    const im = document.createElement('img');
    im.src = thumb; im.alt = ''; im.loading = 'lazy'; im.decoding = 'async';
    im.addEventListener('error', () => im.remove(), { once: true });
    a.appendChild(im);
  }
  const b = document.createElement('b'); b.textContent = label;
  a.append(b, document.createTextNode(' ' + text));
  return a;
}

function prepareHtml(html, { embeds, audio, mapAsset, idPrefix }) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const root = t.content;
  root.querySelectorAll('script,style,object,embed,link,meta,base').forEach((n) => n.remove());
  root.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((at) => { if (/^on/i.test(at.name)) n.removeAttribute(at.name); }));
  // ids con prefijo para no chocar con la página que monta el lector (los enlaces internos se reescriben a juego)
  root.querySelectorAll('[id]').forEach((n) => { n.id = idPrefix + n.id; });
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) { a.setAttribute('href', '#' + idPrefix + href.slice(1)); a.dataset.bxAnchor = '1'; }
    else { a.target = '_blank'; a.rel = 'noopener'; }
  });
  root.querySelectorAll('img').forEach((img) => {
    img.src = mapAsset(img.getAttribute('src') || '');
    img.loading = 'lazy'; img.decoding = 'async';
  });
  root.querySelectorAll('iframe').forEach((f) => {
    const src = f.getAttribute('src') || '';
    if (embeds === 'native') { f.loading = 'lazy'; f.style.maxWidth = '100%'; f.setAttribute('allowfullscreen', ''); return; }
    const yt = ytId(src);
    let host = 'el sitio original';
    try { host = new URL(src, location.href).hostname; } catch { /* src raro: se queda el texto genérico */ }
    const name = yt ? 'YouTube' : /vimeo/.test(src) ? 'Vimeo' : host;
    const href = yt ? `https://www.youtube.com/watch?v=${yt}` : src.replace('player.vimeo.com/video/', 'vimeo.com/');
    f.replaceWith(mediaLink(href, '▶ Vídeo', `Ver en ${name}`, yt ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` : null));
  });
  root.querySelectorAll('audio').forEach((au) => {
    const raw = au.getAttribute('src') || au.querySelector('source')?.getAttribute('src') || '';
    const src = mapAsset(raw);
    if (audio === 'native') {
      au.src = src; au.preload = 'none'; au.controls = true;
      au.querySelectorAll('source').forEach((s) => s.remove());
      // si no se puede reproducir aquí, se cambia por un enlace
      au.addEventListener('error', () => au.replaceWith(mediaLink(raw, '♪ Audio', 'Escuchar la grabación')), { once: true });
    } else au.replaceWith(mediaLink(raw, '♪ Audio', 'Escuchar la grabación'));
  });
  // índice para las entradas largas
  const hs = [...root.querySelectorAll('h2')];
  if (hs.length >= 4) {
    const toc = document.createElement('details');
    toc.className = 'bx-toc';
    toc.innerHTML = `<summary>Contenido · ${hs.length} secciones</summary><ol>${hs.map((h) => `<li><a href="#${esc(h.id)}" data-bx-anchor="1">${esc(h.textContent)}</a></li>`).join('')}</ol>`;
    root.prepend(toc);
  }
  return root;
}

const FOCUSABLE = 'button:not(:disabled),a[href],audio[controls],summary,[tabindex="0"]';

/**
 * Lector a pantalla completa.
 * opts: { posts, container=document.body, embeds:'link'|'native', audio:'native'|'link', mapAsset(url)->url,
 *         captureKeys=true, onOpen(post, {first}), onClose(post) }
 */
export function createReader({
  posts, container = document.body, embeds = 'link', audio = 'native', mapAsset = (u) => u,
  captureKeys = true, onOpen, onClose,
} = {}) {
  injectStyles(container.ownerDocument);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const titleId = nextId('bx-title'), idPrefix = nextId('bx') + '-';
  const el = document.createElement('div');
  el.className = 'bx bx-reader';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', titleId);
  el.innerHTML = `<article class="bx-sheet">
    <div class="bx-progress" data-r="progress"></div>
    <header class="bx-head"><div><div class="bx-eb" data-r="eb"></div><h2 id="${titleId}" data-r="title"></h2><div class="bx-meta" data-r="meta"></div></div>
      <button type="button" class="bx-x" data-r="close" aria-label="Cerrar la entrada">✕</button></header>
    <div class="bx-body" data-r="body" tabindex="0"><div class="bx-prose" data-r="prose"></div></div>
    <footer class="bx-foot">
      <button type="button" class="bx-nav" data-r="prev"><span>‹ Anterior</span><strong></strong></button>
      <a class="bx-ext" data-r="ext" target="_blank" rel="noopener">Ver en malkevnia.com ↗</a>
      <button type="button" class="bx-nav bx-r" data-r="next"><span>Siguiente ›</span><strong></strong></button>
    </footer></article>`;
  container.appendChild(el);
  const $ = (k) => el.querySelector(`[data-r="${k}"]`);
  const body = $('body'), progress = $('progress');
  let current = null, lastFocus = null, hideTimer = 0;

  // la lista va de más reciente a más antigua: "anterior" (más antigua) = índice + 1
  const neighbour = (p, dir) => posts[posts.indexOf(p) + (dir < 0 ? 1 : -1)] || null;

  const updateProgress = () => {
    const max = body.scrollHeight - body.clientHeight;
    progress.style.transform = `scaleX(${max > 4 ? Math.min(1, body.scrollTop / max) : 1})`;
  };
  body.addEventListener('scroll', updateProgress, { passive: true });

  function render(p) {
    $('eb').textContent = `Entrada ${pad3(p.n)} · Bitácora del capitán`;
    $('title').textContent = p.title;
    $('meta').innerHTML = `<time datetime="${esc(p.datetime || p.date)}">${formatDate(p.date, true)}</time><span>${p.readingMinutes} min de lectura</span>` +
      (p.tags.length ? `<span>${p.tags.map((t) => `<span class="bx-tag">#${esc(t)}</span>`).join(' ')}</span>` : '');
    const prose = $('prose');
    prose.replaceChildren(prepareHtml(p.html, { embeds, audio, mapAsset, idPrefix }));
    prose.querySelectorAll('img').forEach((img) => img.addEventListener('error', () => {
      if (!img.isConnected) return;
      const parentLink = img.closest('a');
      const chip = mediaLink(img.src, '▣ Imagen', img.alt ? `${img.alt} · ábrela aparte` : 'No se puede mostrar aquí, ábrela aparte');
      (parentLink && parentLink.childElementCount === 1 ? parentLink : img).replaceWith(chip);
    }, { once: true }));
    $('ext').href = p.url;
    for (const [k, dir] of [['prev', -1], ['next', 1]]) {
      const n = neighbour(p, dir), b = $(k);
      b.disabled = !n;
      b.querySelector('strong').textContent = n ? n.title : '—';
      b.title = n ? n.title : '';
    }
    body.scrollTop = 0;
    requestAnimationFrame(updateProgress);
  }

  function open(ref) {
    const p = typeof ref === 'string' ? byId.get(ref) : ref;
    if (!p) return null;
    const first = !current;
    clearTimeout(hideTimer);
    if (first) lastFocus = document.activeElement;
    current = p;
    render(p);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('bx-on'));
    if (first) $('close').focus({ preventScroll: true });
    onOpen && onOpen(p, { first });
    return p;
  }
  function close() {
    if (!current) return;
    const p = current;
    current = null;
    el.classList.remove('bx-on');
    el.querySelectorAll('audio').forEach((a) => a.pause());
    hideTimer = setTimeout(() => { el.hidden = true; }, 350);
    if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
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
    if (a.dataset.bxAnchor) { // ancla dentro de la propia entrada (índice, notas al pie)
      e.preventDefault();
      let id = a.getAttribute('href').slice(1);
      try { id = decodeURIComponent(id); } catch { /* id con % suelto: se usa tal cual */ }
      const target = el.querySelector('#' + CSS.escape(id));
      target && target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    // enlaces entre entradas del blog: se abren dentro del lector (también los que llevan la fecha local antigua)
    let url;
    try { url = new URL(a.href); } catch { return; }
    if (!/(^|\.)malkevnia\.com$/.test(url.hostname) && url.origin !== location.origin) return;
    const m = url.pathname.match(SITE_POST);
    const hit = m && byId.get(decodeURIComponent(m[1]));
    if (hit) { e.preventDefault(); open(hit); }
  });
  const typing = (t) => t && t.closest && t.closest('input,textarea,select,audio,video,[contenteditable="true"]');
  const onKey = (e) => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && !typing(e.target) && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight' && !typing(e.target) && !e.altKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); step(1); }
    else if (e.key === 'Tab') { // foco atrapado dentro del lector
      const f = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === body);
      if (!f.length) return;
      if (!el.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
    // mientras se lee, las teclas no llegan a la nave (no se mueve el jugador); keyup sí pasa para no dejar teclas "pegadas"
    if (captureKeys) e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);

  return {
    el, open, close,
    next: () => step(1), prev: () => step(-1),
    get isOpen() { return !!current; },
    get current() { return current; },
    destroy() { window.removeEventListener('keydown', onKey, true); clearTimeout(hideTimer); el.remove(); },
  };
}

// ---------------------------------------------------------------- índice

/**
 * Índice navegable: búsqueda (título, etiquetas, resumen y cuerpo), años, etiquetas y lista.
 * opts: { posts, container, onSelect(post), onFilter(list, filter), filter:{year,tag,q}, maxTags=10 }
 */
export function createBrowser({ posts, container, onSelect, onFilter, filter = {}, maxTags = 10 } = {}) {
  injectStyles(container.ownerDocument);
  const state = { year: null, tag: null, q: '', ...filter };
  const el = document.createElement('div');
  el.className = 'bx bx-browser';
  const inputId = nextId('bx-search');
  const years = yearsOf(posts), allTags = tagsOf(posts);
  el.innerHTML = `<input class="bx-search" id="${inputId}" type="search" placeholder="Buscar en la bitácora…" aria-label="Buscar en la bitácora" autocomplete="off" enterkeyhint="search">
    <div style="display:grid;gap:8px">
      <div class="bx-chips" role="group" aria-label="Año">
        <button type="button" class="bx-chip" data-y="">Todas</button>${years.map((y) => `<button type="button" class="bx-chip" data-y="${y}" title="${posts.filter((p) => p.year === y).length} entradas">${y}</button>`).join('')}
      </div>
      <div class="bx-chips" role="group" aria-label="Etiqueta" data-r="tags"></div>
      <div class="bx-count" aria-live="polite"></div>
    </div>
    <ul class="bx-list" aria-label="Entradas"></ul>`;
  container.appendChild(el);
  const input = el.querySelector('.bx-search'), list = el.querySelector('.bx-list'), count = el.querySelector('.bx-count'), tagBox = el.querySelector('[data-r="tags"]');
  input.value = state.q;
  let filtered = [], currentId = null;

  // resalta las palabras buscadas: rangos sobre el texto plano y luego se escapa cada trozo
  const mark = (text, q) => {
    const n = norm(text), ranges = [];
    for (const t of norm(q).split(/\s+/).filter((x) => x.length > 1)) {
      for (let i = n.indexOf(t); i >= 0 && ranges.length < 40; i = n.indexOf(t, i + t.length)) ranges.push([i, i + t.length]);
    }
    if (!ranges.length) return esc(text);
    ranges.sort((a, b) => a[0] - b[0]);
    let out = '', at = 0;
    for (const [a, b] of ranges) {
      if (a < at) continue;
      out += esc(text.slice(at, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>';
      at = b;
    }
    return out + esc(text.slice(at));
  };

  function renderTags() {
    const shown = allTags.slice(0, maxTags).map((x) => x.tag);
    if (state.tag && !shown.includes(state.tag)) shown.push(state.tag);
    tagBox.innerHTML = shown.map((tag) => `<button type="button" class="bx-chip bx-t" data-t="${esc(tag)}" aria-pressed="${state.tag === tag}">#${esc(tag)}</button>`).join('');
  }

  function refresh(emit = true) {
    filtered = filterPosts(posts, state);
    el.querySelectorAll('[data-y]').forEach((b) => b.setAttribute('aria-pressed', String(String(state.year || '') === b.dataset.y)));
    renderTags();
    count.textContent = `${filtered.length} ${filtered.length === 1 ? 'entrada' : 'entradas'}${state.q.trim() ? ' · por relevancia' : ''}`;
    const q = state.q.trim();
    list.innerHTML = filtered.length ? filtered.map((p) => {
      const ix = index(p), nq = norm(q);
      const inHead = !q || nq.split(/\s+/).every((t) => ix.title.includes(t) || ix.tags.includes(t) || ix.desc.includes(t));
      const sn = q && !inHead ? matchSnippet(p, q, 50) : '';
      return `<li><button type="button" class="bx-item${p.id === currentId ? ' bx-cur' : ''}" data-id="${esc(p.id)}">
        <span class="bx-n">${pad3(p.n)}</span><span class="bx-tt">${q ? mark(p.title, q) : esc(p.title)}</span><span class="bx-dd">${formatDate(p.date)} · ${p.readingMinutes} min</span>${sn ? `<span class="bx-sn">${mark(sn, q)}</span>` : ''}</button></li>`;
    }).join('')
      : '<li class="bx-empty">Ninguna entrada coincide. Prueba con otra palabra o quita un filtro.</li>';
    if (emit && onFilter) onFilter(filtered, { ...state });
  }
  let t = 0;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = input.value; refresh(); }, 160); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('.bx-item')?.focus(); }
    else if (e.key === 'Enter') { clearTimeout(t); state.q = input.value; refresh(); const p = filtered[0]; if (p && onSelect) onSelect(p); }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...list.querySelectorAll('.bx-item')], i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) input.focus(); else items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
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
    setCurrent(id) {
      currentId = id;
      list.querySelectorAll('.bx-item').forEach((b) => {
        const on = b.dataset.id === id;
        b.classList.toggle('bx-cur', on);
        if (on) b.scrollIntoView({ block: 'nearest' });
      });
    },
    focusSearch() { input.focus(); input.select(); },
    destroy() { clearTimeout(t); el.remove(); },
  };
}

/** Índice + lector juntos, sin 3D. Útil como pantalla de la consola o versión ligera en móvil. */
export function mountBitacora(container, { posts, ...readerOpts } = {}) {
  const reader = createReader({ posts, ...readerOpts, onOpen: (p, info) => { browser.setCurrent(p.id); readerOpts.onOpen && readerOpts.onOpen(p, info); } });
  const browser = createBrowser({ posts, container, onSelect: (p) => reader.open(p) });
  return { reader, browser, destroy() { reader.destroy(); browser.destroy(); } };
}

// ---------------------------------------------------------------- holopanel (canvas)

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let line = '', i = 0;
  for (; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = words[i];
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) { lines.push(line); i = words.length; }
  if (i < words.length) {
    let last = lines[maxLines - 1] || '';
    while (ctx.measureText(last + '…').width > maxW && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = last.replace(/[\s,.;:—-]+$/, '') + '…';
  }
  // una sola palabra más ancha que la línea: se recorta
  return lines.map((l) => { let s = l; while (ctx.measureText(s).width > maxW && s.length > 1) s = s.slice(0, -2) + '…'; return s; });
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * Dibuja la cara de un holopanel en un <canvas> (nuevo, o el que se pase en opts.canvas).
 * opts: { w=640, h=w*0.625, color, accent, image (HTMLImageElement ya cargada, opcional), canvas }
 */
export function drawPanelCanvas(post, { w = 640, h = Math.round(w * 0.625), color = PALETTE.amber, accent = PALETTE.violet, image = null, canvas = null } = {}) {
  const c = canvas || document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const k = w / 640; // todo se diseña a 640 de ancho y se escala
  g.setTransform(k, 0, 0, k, 0, 0);
  const W = 640, H = h / k, r = 22, pad = 34;
  g.clearRect(0, 0, W, H);
  // cuerpo translúcido
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, rgba(color, 0.22)); bg.addColorStop(0.55, rgba(accent, 0.10)); bg.addColorStop(1, rgba(accent, 0.05));
  roundRectPath(g, 3, 3, W - 6, H - 6, r); g.fillStyle = bg; g.fill();
  // imagen de la entrada: ventana a la derecha, virada a los tonos de la sala
  let textW = W - pad * 2;
  if (image && image.naturalWidth) {
    const iw = 196, ix = W - pad - iw, iy = pad + 52, ih = H - iy - pad - 36;
    g.save();
    roundRectPath(g, ix, iy, iw, ih, 12); g.clip();
    const s = Math.max(iw / image.naturalWidth, ih / image.naturalHeight);
    const dw = image.naturalWidth * s, dh = image.naturalHeight * s;
    g.globalAlpha = 0.9;
    g.filter = 'grayscale(0.55) contrast(1.05)';
    g.drawImage(image, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'color';
    g.fillStyle = rgba(accent, 0.35); g.fillRect(ix, iy, iw, ih);
    g.globalCompositeOperation = 'source-over';
    const fade = g.createLinearGradient(ix, 0, ix + 60, 0);
    fade.addColorStop(0, 'rgba(20,12,40,0.55)'); fade.addColorStop(1, 'rgba(20,12,40,0)');
    g.fillStyle = fade; g.fillRect(ix, iy, 60, ih);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = iy; y < iy + ih; y += 3) g.fillRect(ix, y, iw, 1);
    g.restore();
    roundRectPath(g, ix, iy, iw, ih, 12); g.lineWidth = 1.5; g.strokeStyle = rgba(color, 0.45); g.stroke();
    textW = ix - pad - 22;
  }
  // líneas de barrido
  g.save(); roundRectPath(g, 3, 3, W - 6, H - 6, r); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  g.restore();
  roundRectPath(g, 3, 3, W - 6, H - 6, r); g.lineWidth = 2; g.strokeStyle = rgba(color, 0.55); g.stroke();
  // esquinas
  g.strokeStyle = hex(color); g.lineWidth = 4;
  const kk = 26;
  for (const [x, y, sx, sy] of [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * kk); g.lineTo(x, y); g.lineTo(x + sx * kk, y); g.stroke();
  }
  g.textBaseline = 'alphabetic';
  if (!post) { // panel vacío
    g.fillStyle = rgba(PALETTE.text, 0.8); g.textAlign = 'center';
    g.font = '600 34px "Exo 2", system-ui, sans-serif';
    g.fillText('Sin señal', W / 2, H / 2 - 6);
    g.font = '300 22px "Exo 2", system-ui, sans-serif'; g.fillStyle = rgba(PALETTE.text, 0.6);
    g.fillText('Ninguna entrada coincide con la búsqueda', W / 2, H / 2 + 30);
    g.textAlign = 'left';
    return c;
  }
  // cabecera
  g.fillStyle = hex(color);
  g.font = '600 19px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(`ENTRADA ${pad3(post.n)}`, pad, pad + 20);
  g.textAlign = 'right'; g.fillStyle = rgba(PALETTE.text, 0.7);
  g.fillText(formatDate(post.date).toUpperCase(), W - pad, pad + 20);
  g.textAlign = 'left';
  g.fillStyle = rgba(color, 0.35); g.fillRect(pad, pad + 36, W - pad * 2, 1.5);
  // título
  g.fillStyle = hex(PALETTE.text);
  const tSize = textW < 400 ? 34 : 40, tLead = tSize + 6;
  g.font = `600 ${tSize}px "Exo 2", system-ui, sans-serif`;
  const tl = wrap(g, post.title, textW, 3);
  tl.forEach((l, i) => g.fillText(l, pad, pad + 92 + i * tLead));
  // descripción
  const dy = pad + 92 + tl.length * tLead + 6;
  g.fillStyle = rgba(PALETTE.text, 0.62);
  g.font = '300 23px "Exo 2", system-ui, sans-serif';
  const room = Math.max(1, Math.floor((H - pad - 34 - dy) / 31) + 1);
  const dl = wrap(g, post.description.replace(/\s*\.\.\.$/, '…'), textW, Math.min(room, 5 - tl.length || 1));
  dl.forEach((l, i) => g.fillText(l, pad, dy + i * 31));
  // pie
  g.font = '400 18px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = hex(accent);
  const tags = post.tags.filter((t) => t !== 'archivo').slice(0, 3).map((t) => '#' + t);
  let line = '';
  for (const t of tags) { const nx = line ? line + '  ' + t : t; if (g.measureText(nx).width > W - pad * 2 - 90) break; line = nx; }
  g.fillText(line, pad, H - pad);
  g.textAlign = 'right'; g.fillStyle = rgba(PALETTE.text, 0.55);
  g.fillText(`${post.readingMinutes} MIN`, W - pad, H - pad);
  g.textAlign = 'left';
  return c;
}

// ---------------------------------------------------------------- muro holográfico (Three.js)

const imageCache = new Map();
function loadImage(url) {
  if (!imageCache.has(url)) {
    imageCache.set(url, new Promise((resolve) => {
      const im = new Image();
      im.crossOrigin = 'anonymous'; // sin CORS no carga, en vez de "manchar" el canvas (WebGL no admite canvas manchados)
      im.decoding = 'async';
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = url;
    }));
  }
  return imageCache.get(url);
}

/**
 * Arco de holopaneles orientados hacia el centro del grupo (donde se coloca quien mira).
 * opts: { posts, radius=3.4, rows=2, perRow=12, spacing=0.44 (rad), panelWidth=1.3, baseY=1.05, rowGap=0.95,
 *         color, accent, emitter=true, covers=true, mapAsset(url)->url, textureWidth=640, reducedMotion }
 * Devuelve { group, setPosts(list), page, pages, setPage(i), nextPage(), prevPage(), focus(post), spin(dRad), step(±1), hold(bool),
 *            pick(raycaster), hover(post|null), update(t, dt), redraw(), dispose() }
 */
export function createHoloWall(THREE, opts = {}) {
  const o = {
    radius: 3.4, rows: 2, perRow: 12, spacing: 0.44, panelWidth: 1.3, baseY: 1.05, rowGap: 0.95,
    color: PALETTE.amber, accent: PALETTE.violet, emitter: true, covers: true, mapAsset: (u) => u, textureWidth: 640,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    ...opts,
  };
  const perPage = o.rows * o.perRow;
  const group = new THREE.Group();
  group.name = 'bitacora-holowall';
  const ring = new THREE.Group();   // lo que gira
  ring.name = 'bitacora-holowall-ring';
  group.add(ring);
  const pw = o.panelWidth, ph = pw * 0.625;
  const geo = new THREE.PlaneGeometry(pw, ph);
  let list = o.posts || [], page = 0, panels = [], hovered = null, focused = null, alive = true, buildId = 0;
  let rot = 0, vel = 0, impulse = 0, held = false, target = null, limit = 0, cols = 1;

  // emisor: anillo en el suelo + haces finos hasta la fila inferior
  let emitter = null;
  if (o.emitter) {
    emitter = new THREE.Mesh(new THREE.TorusGeometry(o.radius, 0.012, 8, 160),
      new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.55, toneMapped: false }));
    emitter.rotation.x = Math.PI / 2; emitter.position.y = 0.02;
    group.add(emitter);
  }
  const beamMat = new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.18, toneMapped: false, depthWrite: false });
  let beams = null;

  const slotAngle = (i, count) => (i - (count - 1) / 2) * o.spacing;

  function paint(p) {
    drawPanelCanvas(p.post, { w: o.textureWidth, color: o.color, accent: o.accent, image: p.image, canvas: p.canvas });
    p.mesh.material.map.needsUpdate = true;
  }

  function makePanel(post, a, y, delay) {
    const canvas = document.createElement('canvas');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.sin(a) * o.radius, y, -Math.cos(a) * o.radius);
    mesh.rotation.y = -a;
    mesh.userData.post = post;
    mesh.renderOrder = 2;
    ring.add(mesh);
    const p = { mesh, post, a, y, canvas, image: null, born: delay, life: 0, seed: Math.random() * 100, s: 1, glitchAt: 4 + Math.random() * 16 };
    paint(p);
    return p;
  }

  function build() {
    const id = ++buildId;
    panels.forEach((p) => { p.mesh.material.map.dispose(); p.mesh.material.dispose(); ring.remove(p.mesh); });
    if (beams) { ring.remove(beams); beams.geometry.dispose(); beams = null; }
    panels = [];
    const slice = list.slice(page * perPage, page * perPage + perPage);
    cols = Math.max(1, Math.ceil(slice.length / o.rows));
    const pts = [];
    slice.forEach((post, idx) => {
      // por columnas, de izquierda a derecha: arriba la más reciente, abajo la siguiente
      const col = Math.floor(idx / o.rows), row = idx % o.rows;
      const y = o.baseY + (o.rows - 1 - row) * o.rowGap;
      const p = makePanel(post, slotAngle(col, cols), y, idx * 0.035);
      panels.push(p);
      if (row === o.rows - 1 || idx === slice.length - 1) pts.push(p.mesh.position.x, 0.02, p.mesh.position.z, p.mesh.position.x, y - ph / 2, p.mesh.position.z);
      if (o.covers && post.cover && !/^http:/i.test(post.cover)) { // las de http (blogs antiguos) no se pueden usar en https
        loadImage(o.mapAsset(post.cover)).then((im) => { if (im && alive && id === buildId) { p.image = im; paint(p); } });
      }
    });
    if (!slice.length) panels.push(makePanel(null, 0, o.baseY + (o.rows - 1) * o.rowGap / 2, 0)); // "sin señal"
    if (pts.length) {
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      beams = new THREE.LineSegments(bg, beamMat);
      ring.add(beams);
    }
    const half = ((cols - 1) / 2) * o.spacing;
    limit = Math.max(0, half);
    vel = 0; impulse = 0;
    // arranca con las primeras columnas a la vista (la más reciente a la izquierda del centro)
    target = cols > 2 ? -half + o.spacing : 0;
  }

  // si las fuentes aún no estaban listas al pintar, se repinta cuando llegan
  if (typeof document !== 'undefined' && document.fonts && !FONTS.every((f) => document.fonts.check(f))) {
    Promise.all(FONTS.map((f) => document.fonts.load(f))).then(() => alive && api.redraw()).catch(() => {});
  }

  const api = {
    group,
    get panels() { return panels; },
    get page() { return page; },
    get pages() { return Math.max(1, Math.ceil(list.length / perPage)); },
    get posts() { return list; },
    get rotation() { return rot; },
    get limit() { return limit; },
    setPosts(next) { list = next || []; page = 0; build(); },
    setPage(i) { const n = Math.max(0, Math.min(api.pages - 1, i)); if (n !== page) { page = n; build(); } return page; },
    nextPage() { return api.setPage(page + 1); },
    prevPage() { return api.setPage(page - 1); },
    /** Lleva el muro a la página del post, lo gira hasta tenerlo de frente y lo deja resaltado. */
    focus(post) {
      const i = list.indexOf(post);
      if (i < 0) return false;
      api.setPage(Math.floor(i / perPage));
      const p = panels.find((x) => x.post === post);
      if (p) { target = p.a; vel = 0; }
      focused = post;
      return true;
    },
    /** Gira el muro dRad radianes al momento; al soltar conserva la inercia. Pasado el borde, cuesta más (rebote). */
    spin(d) {
      if ((rot > limit && d > 0) || (rot < -limit && d < 0)) d *= 0.3;
      rot += d; impulse += d; target = null;
    },
    /** Gira una columna a la izquierda (-1) o a la derecha (+1), centrándola. */
    step(dir) {
      const base = target ?? rot;
      const c = Math.max(0, Math.min(cols - 1, Math.round(base / o.spacing + (cols - 1) / 2) + Math.sign(dir)));
      target = (c - (cols - 1) / 2) * o.spacing; vel = 0;
      return c;
    },
    /** true mientras se arrastra (el muro no sigue girando solo); false al soltar. */
    hold(on) { held = !!on; if (held) vel = 0; },
    pick(raycaster) {
      const hit = raycaster.intersectObjects(panels.map((p) => p.mesh), false)[0];
      return hit ? hit.object.userData.post : null;
    },
    hover(post) { hovered = post || null; },
    /** Repinta todos los paneles (p. ej. tras cargar fuentes). */
    redraw() { panels.forEach(paint); },
    update(t, dt = 1 / 60) {
      dt = Math.min(Math.max(dt, 0), 0.1);
      // giro: arrastre directo + inercia al soltar, independiente de los fps
      if (target !== null) {
        rot += (target - rot) * Math.min(1, dt * 4);
        if (Math.abs(target - rot) < 1e-4) target = null;
      } else if (impulse !== 0) {
        vel = vel * 0.5 + (impulse / Math.max(dt, 1 / 240)) * 0.5; impulse = 0;
      } else if (held) {
        vel = 0;
      } else {
        rot += vel * dt; vel *= Math.pow(0.04, dt);
        // al perder impulso, se asienta en la columna más cercana
        if (Math.abs(vel) < 0.06) {
          vel = 0;
          const c = Math.max(0, Math.min(cols - 1, Math.round(rot / o.spacing + (cols - 1) / 2)));
          target = (c - (cols - 1) / 2) * o.spacing;
        }
      }
      // límites con rebote suave
      const over = rot > limit ? rot - limit : rot < -limit ? rot + limit : 0;
      if (over && !held) { rot -= over * Math.min(1, dt * 8); vel *= Math.pow(0.001, dt); }
      ring.rotation.y = rot;
      for (const p of panels) {
        p.life += dt;
        const born = Math.max(0, Math.min(1, (p.life - p.born) * 1.8));
        const e = 1 - Math.pow(1 - born, 3);
        const on = p.post && (hovered === p.post || focused === p.post);
        p.s += ((hovered && hovered === p.post ? 1.07 : 1) - p.s) * Math.min(1, dt * 10);
        p.mesh.scale.set(p.s, p.s * (0.05 + 0.95 * e), 1);
        let flick = 0;
        if (!o.reducedMotion) {
          flick = Math.sin(t * 2.1 + p.seed) * 0.025;
          // de vez en cuando un panel parpadea un instante, como una señal que se reajusta
          if (p.life > p.glitchAt) {
            const g = p.life - p.glitchAt;
            if (g < 0.18) flick -= (Math.sin(g * 90) > 0 ? 0.35 : 0.05);
            else p.glitchAt = p.life + 10 + Math.random() * 20;
          }
        }
        p.mesh.material.opacity = e * ((on ? 1 : 0.86) + flick);
        p.mesh.position.y = p.y + (o.reducedMotion ? 0 : Math.sin(t * 0.7 + p.seed) * 0.012);
      }
      if (emitter && !o.reducedMotion) emitter.material.opacity = 0.45 + Math.sin(t * 1.3) * 0.12;
    },
    dispose() {
      alive = false;
      panels.forEach((p) => { p.mesh.material.map.dispose(); p.mesh.material.dispose(); });
      panels = [];
      geo.dispose(); beamMat.dispose();
      if (beams) beams.geometry.dispose();
      if (emitter) { emitter.geometry.dispose(); emitter.material.dispose(); }
      group.removeFromParent();
    },
  };
  build();
  return api;
}
