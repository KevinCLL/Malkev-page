/*
 * Ordenador de a bordo · La Malkevnia
 * Terminal retro (CRT) dibujada entera en un <canvas> 2D, lista para usarse
 * como página normal o como textura de una pantalla dentro de la nave 3D.
 *
 *   import { init } from './ordenador-abordo.js';
 *   const term = init(contenedor, { data, onNavigate(id, sala) {} });
 *   ...
 *   term.dispose();
 *
 * Sin dependencias. Ver README.md para la API completa.
 */

const VERSION = '1.1.0';

/* ---------------------------------------------------------------- temas */

const THEMES = {
  purpura: { bg: '#0a0614', glow: '#2a1650', f: '#d2c0ff', d: '#7e6bab', a: '#ff9be6', w: '#ffc27a', o: '#6affc8', l: '#8fdcff', e: '#ff7f93' },
  ambar:   { bg: '#0c0702', glow: '#3a2206', f: '#ffc56e', d: '#9c753a', a: '#ffe3ad', w: '#ff9a3c', o: '#ffd98a', l: '#ffeabd', e: '#ff6a3c' },
  verde:   { bg: '#020a05', glow: '#063018', f: '#7dffa8', d: '#3d9a5d', a: '#caffdb', w: '#e6ff7a', o: '#7dffa8', l: '#a8ffe0', e: '#ff8a7a' },
  cian:    { bg: '#020a0e', glow: '#06283a', f: '#8ae8ff', d: '#4a8aa0', a: '#d4f7ff', w: '#ffd27a', o: '#7dffd0', l: '#c4edff', e: '#ff8a9a' },
};

/* ---------------------------------------------------------- datos base */

const DEFAULT_ROOMS = [
  { id: 'puente',     name: 'Puente de mando',      sub: 'Rumbo y navegación',      alias: ['mando', 'cabina', 'navegacion', 'timon'] },
  { id: 'pasillo',    name: 'Pasillo central',      sub: 'Cubierta principal',      alias: ['cubierta', 'pasillo'] },
  { id: 'recreativa', name: 'Sala recreativa',      sub: 'Videojuegos',             alias: ['videojuegos', 'arcade', 'consolas', 'recreativos'] },
  { id: 'proyeccion', name: 'Sala de proyección',   sub: 'Películas y series',      alias: ['cine', 'peliculas', 'pelis', 'series', 'filmoteca'] },
  { id: 'bitacora',   name: 'Bitácora',             sub: 'El diario de a bordo',    alias: ['blog', 'diario', 'posts'] },
  { id: 'juegos',     name: 'Sala de juegos',       sub: 'Juegos de mesa · Kallax', alias: ['mesa', 'kallax', 'ludoteca', 'tablero'] },
  { id: 'biblioteca', name: 'Biblioteca',           sub: 'Libros y manga',          alias: ['libros', 'manga', 'libreria', 'lectura'] },
  { id: 'ordenador',  name: 'Ordenador de a bordo', sub: 'Consola del capitán',     alias: ['consola', 'terminal', 'computadora'] },
  { id: 'maquinas',   name: 'Sala de máquinas',     sub: 'Reactor y soporte vital', alias: ['reactor', 'motores', 'ingenieria', 'motor'] },
];

const DEFAULT_PLANETS = [
  { id: 'thalassa',    name: 'Thalassa',    sub: 'Planeta océano, mareas lentas y faros' },
  { id: 'gelida',      name: 'Gélida',      sub: 'Hielo azul y auroras que cantan' },
  { id: 'izaro',       name: 'Izaro',       sub: 'Lejano. Dicen que allí el Cataclismo aún respira' },
  { id: 'brasa-menor', name: 'Brasa Menor', sub: 'Volcánico, cálido, cielos color ámbar' },
];

/* ---------------------------------------------------------- utilidades */

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clean = (s) => String(s ?? '').replace(/[{}]/g, '');
const pad = (s, n) => { s = String(s); const l = Array.from(s).length; return l >= n ? s : s + ' '.repeat(n - l); };
const padL = (s, n) => { s = String(s); const l = Array.from(s).length; return l >= n ? s : ' '.repeat(n - l) + s; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function lev(a, b) {
  const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

/* Marcado de color: "{a}texto{/}" — f normal, d tenue, a acento, w aviso, o ok, l enlace, e error */
function parseMarkup(str) {
  const chars = []; let color = 'f';
  const re = /\{([fdawole])\}|\{\/\}/g; let last = 0, m;
  const push = (t) => { for (const ch of Array.from(t)) chars.push({ ch, c: color }); };
  while ((m = re.exec(str))) { push(str.slice(last, m.index)); color = m[1] || 'f'; last = re.lastIndex; }
  push(str.slice(last));
  return chars;
}

function stardate(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 1);
  const frac = (d - start) / (365.25 * 864e5);
  return (d.getFullYear() + frac).toFixed(3);
}

/* ================================================================ init */

export function init(container, opts = {}) {
  const headless = !!opts.headless || !container;
  const data = opts.data || {};
  const rooms = (data.rooms || DEFAULT_ROOMS).map((r) => ({ ...r, _k: [r.id, r.name, r.sub, ...(r.alias || [])].map(norm) }));
  const planets = data.planets || DEFAULT_PLANETS;
  const games = (data.games || []).map((g) => ({ ...g, _k: norm(g.n) }));
  const posts = (data.posts || []).slice().sort((a, b) => (a.f < b.f ? -1 : 1)).map((p, i) => ({ ...p, id: i + 1, _t: norm(p.t), _r: norm(p.r) }));
  const baseUrl = opts.baseUrl ?? 'https://malkevnia.com';
  const captain = opts.captain || 'Malkev';
  const extra = opts.commands || {};

  /* ------------------------------------------------------------ estado */
  const st = {
    theme: THEMES[opts.theme] ? opts.theme : 'purpura',
    room: opts.room || 'ordenador',
    course: null,
    lastPost: null,
    lastList: [],
    coffee: 0.62,
    booted: Date.now(),
    input: '', caret: 0,
    history: [], hIdx: -1, hDraft: '',
    scroll: 0,
    focused: headless,
    disposed: false,
  };
  const buffer = [];   // líneas visibles: { chars, shown }
  const queue = [];    // pendientes: { chars } | { delay } | { fn }
  let typing = null;   // línea que se está escribiendo
  let waitUntil = 0;
  let speed = 1600;    // caracteres por segundo

  /* ------------------------------------------------------------ canvas */
  const canvas = opts.canvas || document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const text = document.createElement('canvas');   // capa de texto (se repinta solo si cambia)
  const tctx = text.getContext('2d');
  const fx = document.createElement('canvas');     // scanlines + viñeta (cacheado)
  const glow = document.createElement('canvas');   // halo del fósforo (se recalcula solo con el texto)
  const gctx = glow.getContext('2d');
  let W = 0, H = 0, dpr = 1, fontPx = 16, charW = 9, lineH = 20, cols = 60, bodyRows = 20, padX = 16, headerH = 30;
  const effects = opts.effects !== false;
  const canFilter = effects && 'filter' in gctx;
  const fontFamily = opts.font || '"VT323", "IBM Plex Mono", "Cascadia Mono", Consolas, monospace';
  let textDirty = true;

  let ta = null, ro = null, live = null, touchY = null;
  if (!headless) {
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    canvas.style.cssText = 'display:block;width:100%;height:100%;';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Ordenador de a bordo de La Malkevnia: terminal de comandos');
    container.appendChild(canvas);
    ta = document.createElement('textarea');
    ta.setAttribute('aria-label', 'Escribe un comando');
    ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off'); ta.setAttribute('spellcheck', 'false');
    ta.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;resize:none;border:0;padding:0;margin:0;font-size:16px;color:transparent;background:transparent;caret-color:transparent;cursor:text;outline:none;';
    container.appendChild(ta);
    ta.addEventListener('input', onTaInput);
    ta.addEventListener('keydown', onTaKey);
    ta.addEventListener('focus', () => { st.focused = true; textDirty = true; });
    ta.addEventListener('blur', () => { st.focused = false; textDirty = true; });
    ta.addEventListener('wheel', onWheel, { passive: false });
    ta.addEventListener('touchstart', onTouchStart, { passive: true });
    ta.addEventListener('touchmove', onTouchMove, { passive: false });
    live = document.createElement('div');
    live.setAttribute('role', 'log'); live.setAttribute('aria-live', 'polite');
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
    container.appendChild(live);
    ro = new ResizeObserver(() => layout());
    ro.observe(container);
  }

  function layout(w, h) {
    if (headless) {
      dpr = 1; W = w || opts.width || W || 1024; H = h || opts.height || H || 640;
      fontPx = opts.fontSize || Math.round(H / 26);
    } else {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = container.getBoundingClientRect();
      const cw = Math.max(200, r.width), ch = Math.max(160, r.height);
      W = Math.round(cw * dpr); H = Math.round(ch * dpr);
      fontPx = Math.round((opts.fontSize || clamp(cw / 44, 15, 24)) * dpr);
    }
    canvas.width = text.width = glow.width = W; canvas.height = text.height = glow.height = H;
    tctx.font = `${fontPx}px ${fontFamily}`;
    charW = tctx.measureText('M').width || fontPx * 0.5;
    lineH = Math.round(fontPx * 1.12);
    padX = Math.round(charW * 1.6);
    headerH = Math.round(lineH * 1.7);
    cols = Math.max(20, Math.floor((W - padX * 2) / charW));
    bodyRows = Math.max(4, Math.floor((H - headerH - lineH * 2.2 - padX * 0.6) / lineH));
    for (const l of buffer) l.rows = null;
    buildFx();
    textDirty = true;
  }

  function buildFx() {
    fx.width = W; fx.height = H;
    const f = fx.getContext('2d');
    f.clearRect(0, 0, W, H);
    const step = Math.max(2, Math.round(dpr * 3));
    f.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < H; y += step) f.fillRect(0, y, W, Math.max(1, Math.round(step / 3)));
    const g = f.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    f.fillStyle = g; f.fillRect(0, 0, W, H);
  }

  /* ------------------------------------------------------------ salida */
  function print(str = '') {
    for (const line of String(str).split('\n')) queue.push({ chars: parseMarkup(line) });
    st.scroll = 0;
    if (live) {
      const p = document.createElement('p');
      p.textContent = String(str).replace(/\{[fdawole/]\}/g, '');
      live.appendChild(p);
      while (live.childNodes.length > 40) live.firstChild.remove();
    }
  }
  const delay = (ms) => queue.push({ delay: ms });
  const later = (fn) => queue.push({ fn });

  function flush() {
    if (typing) { typing.shown = typing.chars.length; typing = null; }
    while (queue.length) {
      const it = queue.shift();
      if (it.chars) buffer.push({ chars: it.chars, shown: it.chars.length });
      else if (it.fn) it.fn();
    }
    waitUntil = 0; trim(); textDirty = true;
  }
  function trim() { if (buffer.length > 800) buffer.splice(0, buffer.length - 800); }

  function advance(dt, now) {
    if (now < waitUntil) return;
    let budget = Math.max(1, Math.round(dt * speed / 1000));
    while (budget > 0) {
      if (typing) {
        const take = Math.min(budget, typing.chars.length - typing.shown);
        typing.shown += take; budget -= take; textDirty = true;
        if (typing.shown >= typing.chars.length) typing = null; else break;
      }
      if (!queue.length) break;
      const it = queue.shift();
      if (it.delay) { waitUntil = now + it.delay; break; }
      if (it.fn) { it.fn(); continue; }
      const line = { chars: it.chars, shown: 0 };
      buffer.push(line); trim(); textDirty = true;
      if (!line.chars.length) { budget -= 1; continue; }
      typing = line;
    }
  }
  const busy = () => !!typing || queue.length > 0;

  /* ------------------------------------------------------------ pintado */
  // Parte una línea lógica en filas; las filas de continuación se sangran como la primera.
  function wrap(chars) {
    if (!chars.length) return [{ c: [], ind: 0 }];
    let lead = 0; while (lead < chars.length && chars[lead].ch === ' ') lead++;
    const hang = lead < cols / 3 ? lead : 0;
    const rows = []; let i = 0; const n = chars.length;
    while (i < n) {
      const ind = rows.length ? hang : 0, w = cols - ind;
      if (n - i <= w) { rows.push({ c: chars.slice(i), ind }); break; }
      let j = -1;
      for (let k = i + w; k > i; k--) if (chars[k] && chars[k].ch === ' ') { j = k; break; }
      if (j > i) { rows.push({ c: chars.slice(i, j + 1), ind }); i = j + 1; }
      else { rows.push({ c: chars.slice(i, i + w), ind }); i += w; }
    }
    return rows;
  }

  function drawChars(row, x0, y, limit = Infinity) {
    const T = THEMES[st.theme];
    let col = 0;
    for (const c of row) {
      if (col >= limit) break;
      if (c.ch !== ' ') { tctx.fillStyle = T[c.c] || T.f; tctx.fillText(c.ch, x0 + col * charW, y); }
      col++;
    }
  }

  function renderText() {
    const T = THEMES[st.theme];
    tctx.clearRect(0, 0, W, H);
    tctx.font = `${fontPx}px ${fontFamily}`;
    tctx.textBaseline = 'middle';

    // cabecera
    const room = rooms.find((r) => r.id === st.room);
    tctx.fillStyle = T.f; tctx.globalAlpha = 0.14; tctx.fillRect(padX * 0.5, padX * 0.5, W - padX, headerH - padX * 0.3); tctx.globalAlpha = 1;
    const hy = padX * 0.5 + (headerH - padX * 0.3) / 2;
    const now = new Date();
    const left = parseMarkup(`{a}◆{/} LA MALKEVNIA {d}·{/} MALK-OS ${VERSION}`);
    const right = parseMarkup(`{d}${room ? room.name.toUpperCase() : ''}  ·  ${now.toTimeString().slice(0, 5)}  ·  FE ${stardate(now)}{/}`);
    const hc = cols;
    if (left.length + right.length + 2 <= hc) {
      drawChars(left, padX, hy);
      drawChars(right, padX + (hc - right.length) * charW, hy);
    } else drawChars(left.slice(0, hc), padX, hy);

    // cuerpo
    const all = [];
    for (const l of buffer) {
      if (!l.rows) l.rows = wrap(l.chars);
      let left = l.shown;
      for (const r of l.rows) { if (left <= 0 && l.shown < l.chars.length) break; all.push({ r, n: Math.min(r.c.length, Math.max(0, left)) }); left -= r.c.length; }
    }
    const maxScroll = Math.max(0, all.length - bodyRows);
    st.scroll = clamp(st.scroll, 0, maxScroll);
    const start = Math.max(0, all.length - bodyRows - st.scroll);
    const view = all.slice(start, start + bodyRows);
    const by = headerH + lineH * 0.9;
    view.forEach((v, i) => drawChars(v.r.c, padX + v.r.ind * charW, by + i * lineH, v.n));
    if (st.scroll > 0) {
      const tag = parseMarkup(`{w}▲ ${st.scroll} líneas más abajo · RePág/AvPág{/}`);
      drawChars(tag, padX + (cols - tag.length) * charW, by + (bodyRows - 1) * lineH);
    }

    // separador + línea de entrada
    const iy = H - lineH * 1.1 - padX * 0.3;
    tctx.fillStyle = T.d; tctx.globalAlpha = 0.5; tctx.fillRect(padX, iy - lineH * 0.85, W - padX * 2, Math.max(1, dpr)); tctx.globalAlpha = 1;
    const prompt = parseMarkup(`{a}${st.room}{/}{d} ▸ {/}`);
    const avail = cols - prompt.length - 1;
    const inp = Array.from(st.input);
    let off = 0; if (st.caret > avail) off = st.caret - avail;
    const vis = inp.slice(off, off + avail).map((ch) => ({ ch, c: 'f' }));
    drawChars(prompt, padX, iy);
    drawChars(vis, padX + prompt.length * charW, iy);
    curPos = { x: padX + (prompt.length + st.caret - off) * charW, y: iy };
    textDirty = false;
    if (canFilter) {
      gctx.clearRect(0, 0, W, H);
      gctx.filter = `blur(${Math.max(2, fontPx * 0.28)}px)`;
      gctx.drawImage(text, 0, 0); gctx.filter = 'none';
    }
  }
  let curPos = { x: 0, y: 0 };

  let bgGrad = null, bgKey = '';
  function composite(now) {
    const T = THEMES[st.theme];
    if (bgKey !== st.theme + W + 'x' + H) {
      bgGrad = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      bgGrad.addColorStop(0, T.glow); bgGrad.addColorStop(1, T.bg); bgKey = st.theme + W + 'x' + H;
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
    if (canFilter) { ctx.globalAlpha = 0.75; ctx.drawImage(glow, 0, 0); ctx.globalAlpha = 1; }
    ctx.drawImage(text, 0, 0);
    // cursor
    const on = !busy() && (Math.floor(now / 530) % 2 === 0 || !st.focused);
    if (on) {
      ctx.fillStyle = T.a;
      if (st.focused) { ctx.globalAlpha = 0.75; ctx.fillRect(curPos.x, curPos.y - lineH * 0.42, charW, lineH * 0.84); }
      else { ctx.globalAlpha = 0.5; ctx.lineWidth = Math.max(1, dpr); ctx.strokeRect(curPos.x + 0.5, curPos.y - lineH * 0.42, charW - 1, lineH * 0.84); }
      ctx.globalAlpha = 1;
    }
    if (effects) {
      const band = H * 0.18, y = ((now * 0.04) % (H + band * 2)) - band;
      const g = ctx.createLinearGradient(0, y, 0, y + band);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.035)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, y, W, band);
      ctx.drawImage(fx, 0, 0);
      ctx.fillStyle = T.bg; ctx.globalAlpha = Math.random() * 0.035; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    opts.onRender && opts.onRender(canvas);
  }

  let raf = 0, lastT = 0, lastDraw = 0, lastBlink = -1, lastMin = '';
  function frame(t) {
    if (st.disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = lastT ? Math.min(100, t - lastT) : 16; lastT = t;
    advance(dt, t);
    const minute = new Date().toTimeString().slice(0, 5);
    if (minute !== lastMin) { lastMin = minute; textDirty = true; }
    const blink = Math.floor(t / 530);
    const fps = opts.fps || 30;
    const need = textDirty || blink !== lastBlink || (effects && t - lastDraw > 1000 / fps);
    if (!need) return;
    lastBlink = blink; lastDraw = t;
    if (textDirty) renderText();
    composite(t);
  }

  /* ------------------------------------------------------------ entrada */
  function setInput(v, caret = Array.from(v).length) {
    st.input = v.replace(/[\r\n]/g, ''); st.caret = clamp(caret, 0, Array.from(st.input).length);
    if (ta && ta.value !== st.input) { ta.value = st.input; }
    if (ta) { try { const u = Array.from(st.input).slice(0, st.caret).join('').length; ta.setSelectionRange(u, u); } catch (_) {} }
    textDirty = true;
  }
  function onTaInput() {
    if (/[\r\n]/.test(ta.value)) { ta.value = ta.value.replace(/[\r\n]/g, ''); }
    st.input = ta.value; st.caret = Array.from(ta.value.slice(0, ta.selectionStart)).length; textDirty = true;
  }
  function onTaKey(e) {
    if (special(e)) { e.preventDefault(); return; }
    setTimeout(() => { if (!ta) return; st.caret = Array.from(ta.value.slice(0, ta.selectionStart)).length; textDirty = true; }, 0);
  }
  function onTouchStart(e) { touchY = e.touches.length === 1 ? e.touches[0].clientY : null; }
  function onTouchMove(e) {
    if (touchY == null || e.touches.length !== 1) return;
    const dy = e.touches[0].clientY - touchY, step = lineH / dpr;
    if (Math.abs(dy) < step) return;
    e.preventDefault();
    const n = Math.trunc(dy / step); touchY += n * step;
    st.scroll = Math.max(0, st.scroll + n); textDirty = true;
  }
  function onWheel(e) { e.preventDefault(); st.scroll += e.deltaY < 0 ? 3 : -3; if (st.scroll < 0) st.scroll = 0; textDirty = true; }

  function special(e) {
    const k = e.key;
    if (e.ctrlKey && (k === 'l' || k === 'L')) { clear(); return true; }
    if (e.ctrlKey && (k === 'c' || k === 'C') && !(ta && ta.selectionStart !== ta.selectionEnd)) { if (busy()) flush(); print(`{d}${st.room} ▸ ${clean(st.input)}^C{/}`); setInput(''); return true; }
    switch (k) {
      case 'Enter': submit(); return true;
      case 'Tab': complete(); return true;
      case 'ArrowUp': histMove(1); return true;
      case 'ArrowDown': histMove(-1); return true;
      case 'PageUp': st.scroll += Math.max(1, bodyRows - 2); textDirty = true; return true;
      case 'PageDown': st.scroll = Math.max(0, st.scroll - Math.max(1, bodyRows - 2)); textDirty = true; return true;
      case 'Escape': if (busy()) flush(); else setInput(''); return true;
    }
    return false;
  }

  // Para modo headless (textura en la nave): el host reenvía los KeyboardEvent.
  function key(e) {
    if (special(e)) return true;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const a = Array.from(st.input);
    switch (e.key) {
      case 'Backspace': if (st.caret > 0) { a.splice(st.caret - 1, 1); setInput(a.join(''), st.caret - 1); } return true;
      case 'Delete': a.splice(st.caret, 1); setInput(a.join(''), st.caret); return true;
      case 'ArrowLeft': setInput(st.input, st.caret - 1); return true;
      case 'ArrowRight': setInput(st.input, st.caret + 1); return true;
      case 'Home': setInput(st.input, 0); return true;
      case 'End': setInput(st.input); return true;
    }
    if (e.key && Array.from(e.key).length === 1) { a.splice(st.caret, 0, e.key); setInput(a.join(''), st.caret + 1); return true; }
    return false;
  }
  function type(str) { const a = Array.from(st.input); a.splice(st.caret, 0, ...Array.from(str)); setInput(a.join(''), st.caret + Array.from(str).length); }

  function histMove(dir) {
    if (!st.history.length) return;
    if (st.hIdx === -1) st.hDraft = st.input;
    st.hIdx = clamp(st.hIdx + dir, -1, st.history.length - 1);
    setInput(st.hIdx === -1 ? st.hDraft : st.history[st.history.length - 1 - st.hIdx]);
  }

  function submit() {
    if (busy()) flush();
    const line = st.input;
    setInput(''); st.hIdx = -1;
    print(`{a}${st.room}{/}{d} ▸{/} ${clean(line)}`);
    if (line.trim()) { if (st.history[st.history.length - 1] !== line) st.history.push(line); if (st.history.length > 100) st.history.shift(); }
    run(line);
  }

  /* ------------------------------------------------------------ comandos */
  const C = {}; // nombre → { group, usage, help, run, hidden }
  const ALIAS = {};
  function def(names, spec) { const [main, ...al] = names; C[main] = spec; spec.name = main; for (const a of al) ALIAS[norm(a)] = main; }

  function findRoom(q, loose = true) {
    const n = norm(q); if (!n) return null;
    const exact = rooms.find((r) => r.id === n) || rooms.find((r) => r._k.includes(n));
    if (exact) return exact;
    const words = rooms.filter((r) => r._k.some((k) => k.split(/[^a-z0-9]+/).includes(n)));
    if (words.length === 1) return words[0];
    if (words.length > 1) return null; // ambiguo ("sala"): que elija
    return loose ? rooms.find((r) => r._k.some((k) => k.includes(n))) : null;
  }
  function findPlanet(q) { const n = norm(q); return planets.find((p) => norm(p.id) === n || norm(p.name) === n) || planets.find((p) => norm(p.name).includes(n)); }

  function searchGames(q) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    return games.filter((g) => toks.every((t) => g._k.includes(t)))
      .sort((a, b) => a._k.indexOf(toks[0]) - b._k.indexOf(toks[0]) || a.n.length - b.n.length);
  }
  function searchPosts(q) {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    return posts.map((p) => {
      let s = 0; for (const t of toks) { if (p._t.includes(t)) s += 3; else if (p._r.includes(t)) s += 1; else return null; }
      return { p, s };
    }).filter(Boolean).sort((a, b) => b.s - a.s || (a.p.f < b.p.f ? 1 : -1)).map((x) => x.p);
  }

  const gameLine = (g) => `  {a}${clean(g.n)}{/} {d}— ${clean(g.d || '')}${g.j ? ` · pegatina ${g.j}` : ''}${g.p ? ` · pósit «${clean(g.p)}»` : ''}{/}`;
  const postLine = (p) => cols < 56 ? `  {w}#${padL(p.id, 3)}{/} ${clean(p.t)}` : `  {w}#${padL(p.id, 3)}{/} {d}${p.f}{/}  ${clean(p.t)}`;

  def(['ayuda', 'help', '?', 'comandos', 'h'], {
    group: 'Terminal', usage: 'ayuda [comando]', help: 'Muestra esta ayuda o la de un comando.',
    run(args) {
      if (args[0]) {
        const c = C[resolve(args[0])];
        if (!c || c.hidden) return print(`{e}No conozco «${clean(args[0])}».{/}`);
        print(`{a}${c.usage}{/}`); print(`  ${c.help}`);
        const al = Object.entries(ALIAS).filter(([, v]) => v === c.name).map(([k]) => k);
        if (al.length) print(`  {d}También: ${al.join(', ')}{/}`);
        if (c.more) for (const m of c.more) print(`  {d}${m}{/}`);
        return;
      }
      print('{a}ORDENADOR DE A BORDO{/} {d}· comandos disponibles{/}');
      const groups = {};
      for (const c of Object.values(C)) if (!c.hidden) (groups[c.group] ||= []).push(c);
      const w = Math.min(26, Math.max(...Object.values(C).filter((c) => !c.hidden).map((c) => c.usage.length)) + 2);
      for (const [g, list] of Object.entries(groups)) {
        print(''); print(`{w}${g.toUpperCase()}{/}`);
        for (const c of list) print(`  {o}${pad(c.usage, w)}{/}${c.help}`);
      }
      print('');
      print('{d}Tab completa · ↑↓ historial · RePág/AvPág desplaza · Esc borra · Ctrl+L limpia{/}');
      print('{d}Hay órdenes que no salen en esta lista. El ordenador guarda secretos.{/}');
    },
  });

  def(['salas', 'mapa', 'plano'], {
    group: 'Navegación', usage: 'salas', help: 'Plano de la nave: todas las salas.',
    run() {
      print('{a}PLANO DE LA MALKEVNIA{/}');
      for (const r of rooms) print(`  ${r.id === st.room ? '{a}●{/}' : '{d}○{/}'} {o}${pad(r.id, 11)}{/}${pad(r.name, 22)}{d}${r.sub}{/}`);
      print('{d}Escribe «ir <sala>», por ejemplo «ir cine» o «ir kallax».{/}');
    },
  });

  def(['ir', 'entrar', 'tp', 'teletransporte', 'vamos', 'cd'], {
    group: 'Navegación', usage: 'ir <sala>', help: 'Te lleva a una sala de la nave.',
    more: ['Vale el nombre o un apodo: cine, kallax, blog, libros, reactor…'],
    run(args) {
      if (!args.length) return print('{w}¿A dónde, capitán?{/} {d}Prueba «salas» para ver el plano.{/}');
      const q = args.join(' ');
      if (['..', '~', '/'].includes(q)) return run('ir puente');
      let r = findRoom(q, false);
      if (!r) {
        const nq = norm(q), opts3 = rooms.filter((x) => x._k.some((k) => k.includes(nq)));
        if (opts3.length > 1) return print(`{w}¿Cuál de estas?{/} ${opts3.map((x) => `{o}${x.id}{/}`).join(' {d}·{/} ')}`);
        r = opts3[0];
      }
      if (!r) return print(`{e}No hay ninguna sala «${clean(q)}» a bordo.{/} {d}Mira «salas».{/}`);
      if (r.id === st.room) return print(`{d}Ya estás en ${r.name}.{/}`);
      print(`{d}Fijando destino:{/} {a}${r.name}{/}`);
      const s = speed; speed = 260;
      print('{d}Abriendo compuertas{/} {o}▓▓▓▓▓▓▓▓▓▓▓▓{/} {d}ok{/}');
      later(() => { speed = s; st.room = r.id; textDirty = true; });
      print(`{o}Has llegado a ${r.name}.{/} {d}${r.sub}.{/}`);
      later(() => { opts.onNavigate && opts.onNavigate(r.id, { id: r.id, name: r.name, sub: r.sub }); });
    },
  });

  def(['donde', 'dónde', 'ubicacion', 'localizar'], {
    group: 'Navegación', usage: 'dónde [juego]', help: 'Dónde estás tú, o en qué cubo de la Kallax está un juego.',
    run(args) {
      if (!args.length) { const r = rooms.find((x) => x.id === st.room); return print(`Estás en {a}${r ? r.name : st.room}{/}. {d}${r ? r.sub : ''}{/}`); }
      if (/^(estoy|me encuentro)$/.test(norm(args.join(' ')))) return run('donde');
      const res = searchGames(args.join(' ').replace(/^(esta|está|anda)\s+/i, ''));
      if (!res.length) return print(`{e}No encuentro «${clean(args.join(' '))}» en las Kallax.{/}`);
      for (const g of res.slice(0, 8)) print(gameLine(g));
      if (res.length > 8) print(`{d}  …y ${res.length - 8} más.{/}`);
    },
  });

  def(['buscar', 'busca', 'search', 'grep', 'find'], {
    group: 'Colección', usage: 'buscar <texto>', help: 'Busca en juegos, bitácora y salas a la vez.',
    run(args) {
      const q = args.join(' ');
      if (!q) return print('{w}¿Qué busco?{/} {d}Por ejemplo «buscar dune».{/}');
      const g = searchGames(q), p = searchPosts(q), r = rooms.filter((x) => x._k.some((k) => k.includes(norm(q))));
      if (!g.length && !p.length && !r.length) return print(`{d}Nada a bordo coincide con «${clean(q)}».{/}`);
      if (r.length) { print('{w}SALAS{/}'); for (const x of r.slice(0, 3)) print(`  {o}${x.id}{/} ${x.name} {d}· ir ${x.id}{/}`); }
      if (g.length) { print(`{w}JUEGOS DE MESA{/} {d}(${g.length}){/}`); for (const x of g.slice(0, 6)) print(gameLine(x)); if (g.length > 6) print(`{d}  …y ${g.length - 6} más · «juegos ${clean(q)}» para verlos todos{/}`); }
      if (p.length) { print(`{w}BITÁCORA{/} {d}(${p.length}){/}`); for (const x of p.slice(0, 6)) print(postLine(x)); if (p.length > 6) print(`{d}  …y ${p.length - 6} más · «bitácora ${clean(q)}»{/}`); print('{d}  «leer <número>» para abrir una entrada{/}'); st.lastList = p; }
    },
  });

  def(['juegos', 'kallax', 'ludoteca', 'games'], {
    group: 'Colección', usage: 'juegos [texto]', help: 'Resumen de las Kallax, o lista de juegos que coinciden.',
    run(args) {
      if (!games.length) return print('{d}El inventario de la Kallax no está cargado.{/}');
      if (args.length) {
        const res = searchGames(args.join(' '));
        if (!res.length) return print(`{e}Ningún juego coincide con «${clean(args.join(' '))}».{/}`);
        print(`{w}${res.length} resultado${res.length > 1 ? 's' : ''}{/}`); for (const g of res.slice(0, 40)) print(gameLine(g));
        if (res.length > 40) print(`{d}  …y ${res.length - 40} más. Afina la búsqueda.{/}`);
        return;
      }
      const by = {}; for (const g of games) { const k = (g.d || '').split(' · ')[0] || 'Sin sitio'; by[k] = (by[k] || 0) + 1; }
      print(`{a}LUDOTECA DE A BORDO{/} {d}· ${games.length} cajas y libros catalogados{/}`);
      const max = Math.max(...Object.values(by));
      for (const [k, n] of Object.entries(by)) print(`  ${pad(k, 10)} {o}${'█'.repeat(Math.max(1, Math.round(n / max * 24)))}{/} ${n}`);
      print('{d}«juegos <texto>» filtra · «dónde <juego>» lo localiza · «sugerir» elige por ti{/}');
    },
  });

  def(['sugerir', 'sugiere', 'azar', 'random', 'jugar', 'quejuego'], {
    group: 'Colección', usage: 'sugerir [jugadores]', help: 'Elige un juego al azar (filtra por la pegatina de color).',
    run(args) {
      if (!games.length) return print('{d}El inventario de la Kallax no está cargado.{/}');
      let pool = games.filter((g) => !/^(vampiro|hombre lobo|mago|momia|wraith|anima|aquelarre|degenesis|d&d|dungeons)/i.test(g.n));
      const n = parseInt(args[0], 10);
      if (n) {
        const f = pool.filter((g) => g.j && g.j.split(/[\/-]/).map(Number).some((x, i, a) => x === n || (a.length === 2 && g.j.includes('-') && n >= a[0] && n <= a[1])));
        if (f.length) pool = f; else print(`{d}Ninguna pegatina dice ${n}; elijo de toda la Kallax.{/}`);
      }
      const g = pick(pool);
      print(`{d}Consultando al oráculo de la ludoteca…{/}`);
      print(`{o}Esta noche toca:{/} {a}${clean(g.n)}{/}`);
      print(`  {d}${clean(g.d)}${g.p ? ` · pósit «${clean(g.p)}»` : ''}{/}`);
    },
  });

  def(['bitacora', 'bitácora', 'blog', 'diario', 'posts'], {
    group: 'Bitácora', usage: 'bitácora [página|texto]', help: 'Últimas entradas del diario de a bordo.',
    run(args) {
      if (!posts.length) return print('{d}La bitácora está vacía.{/}');
      const page = parseInt(args[0], 10);
      let list, title;
      if (args.length && !page) { list = searchPosts(args.join(' ')); title = `${list.length} entradas con «${clean(args.join(' '))}»`; }
      else {
        const per = Math.max(5, bodyRows - 6), p = Math.max(1, page || 1);
        const desc = posts.slice().reverse();
        list = desc.slice((p - 1) * per, p * per);
        title = `BITÁCORA · página ${p} de ${Math.ceil(desc.length / per)} · ${posts.length} entradas`;
      }
      print(`{a}${title}{/}`);
      for (const x of list.slice(0, 30)) print(postLine(x));
      if (list.length > 30) print(`{d}  …y ${list.length - 30} más.{/}`);
      print('{d}«leer <número>» abre una entrada · «bitácora 2» pasa página{/}');
      st.lastList = list;
    },
  });

  def(['leer', 'lee', 'cat', 'ver'], {
    group: 'Bitácora', usage: 'leer <número|texto>', help: 'Lee una entrada de la bitácora.',
    run(args) {
      if (!posts.length) return print('{d}La bitácora está vacía.{/}');
      let p;
      if (!args.length) p = posts[posts.length - 1];
      else if (/^#?\d+$/.test(args[0])) p = posts.find((x) => x.id === parseInt(args[0].replace('#', ''), 10));
      else if (/^(ultima|ultimo|última|último)$/.test(norm(args[0]))) p = posts[posts.length - 1];
      else p = searchPosts(args.join(' '))[0];
      if (!p) return print(`{e}No encuentro esa entrada.{/} {d}Prueba «bitácora».{/}`);
      st.lastPost = p;
      print(`{w}#${p.id} · ${p.f}{/}${p.g && p.g.length ? `{d} · ${p.g.map(clean).join(', ')}{/}` : ''}`);
      print(`{a}${clean(p.t).toUpperCase()}{/}`);
      print('');
      print(clean(p.r));
      print('');
      print(`{l}${baseUrl}${p.u}{/}`);
      print('{d}«abrir» la lleva a la pantalla grande · «leer ' + (p.id > 1 ? p.id - 1 : 1) + '» la anterior{/}');
    },
  });

  def(['abrir', 'open', 'navegador'], {
    group: 'Bitácora', usage: 'abrir', help: 'Abre en el navegador la última entrada leída.',
    run() {
      if (!st.lastPost) return print('{d}Primero lee una entrada con «leer».{/}');
      const url = baseUrl + st.lastPost.u;
      print(`{d}Transmitiendo a la pantalla grande…{/} {l}${url}{/}`);
      later(() => { if (opts.onOpenUrl) opts.onOpenUrl(url, st.lastPost); else if (!headless) window.open(url, '_blank', 'noopener'); });
    },
  });

  function bar(v, n = 16) { const f = Math.round(clamp(v, 0, 1) * n); return '█'.repeat(f) + '░'.repeat(n - f); }
  def(['estado', 'status', 'sistemas', 'diagnostico'], {
    group: 'Nave', usage: 'estado', help: 'Diagnóstico de los sistemas de la nave.',
    run() {
      const t = (Date.now() - st.booted) / 1000;
      st.coffee = clamp(st.coffee - t / 36000, 0.04, 1);
      const sys = [
        ['Reactor de éter', 0.86 + Math.sin(t / 7) * 0.04, 'nominal', 'o'],
        ['Soporte vital', 1, 'óptimo', 'o'],
        ['Escudos', 0.78 + Math.sin(t / 11) * 0.05, 'estables', 'o'],
        ['Motores de salto', 0.42 + Math.sin(t / 13) * 0.06, 'recalibrando', 'w'],
        ['Reserva de café', st.coffee, st.coffee < 0.3 ? '¡atención!' : 'suficiente', st.coffee < 0.3 ? 'e' : 'o'],
        ['Calma a bordo', 0.97, 'máxima', 'a'],
      ];
      print('{a}DIAGNÓSTICO · LA MALKEVNIA{/}');
      const nb = clamp(cols - 40, 8, 18);
      for (const [n, v, s, c] of sys) print(`  ${pad(n, 18)}{${c}}${bar(v, nb)}{/} ${padL(Math.round(clamp(v, 0, 1) * 100), 3)}%  {d}${s}{/}`);
      const up = Math.floor(t), hh = String(Math.floor(up / 3600)).padStart(2, '0'), mm = String(Math.floor(up / 60) % 60).padStart(2, '0'), ss = String(up % 60).padStart(2, '0');
      const room = rooms.find((r) => r.id === st.room);
      print('');
      print(`  ${pad('Rumbo', 13)}${st.course ? `{a}${st.course.name}{/} {d}· crucero tranquilo, 0,3 c{/}` : '{d}a la deriva, sin prisa{/}'}`);
      print(`  ${pad('Posición', 13)}sector Púrpura-7 {d}· FE ${stardate()}{/}`);
      print(`  ${pad('Tripulación', 13)}1 {d}(capitán ${captain}, ahora en ${room ? room.name : st.room}){/}`);
      print(`  ${pad('En servicio', 13)}${hh}:${mm}:${ss} {d}desde el último arranque{/}`);
    },
  });

  def(['rumbo', 'destino', 'curso', 'volar'], {
    group: 'Nave', usage: 'rumbo [planeta]', help: 'Consulta o fija el rumbo de la nave.',
    run(args) {
      if (!args.length) {
        print(st.course ? `Rumbo fijado a {a}${st.course.name}{/}. {d}${st.course.sub}.{/}` : '{d}Sin rumbo fijado. La nave flota en calma.{/}');
        print('{w}DESTINOS CONOCIDOS{/}');
        for (const p of planets) print(`  {o}${pad(p.id, 13)}{/}${pad(p.name, 13)}{d}${p.sub}{/}`);
        return;
      }
      const p = findPlanet(args.join(' '));
      if (!p) return print(`{e}«${clean(args.join(' '))}» no sale en las cartas estelares.{/} {d}Escribe «rumbo» para ver destinos.{/}`);
      st.course = p;
      print(`{d}Calculando trayectoria…{/}`);
      print(`{o}Rumbo fijado a ${p.name}.{/} {d}${p.sub}. Llegada estimada: cuando toque.{/}`);
      later(() => opts.onCourse && opts.onCourse(p.id, p));
    },
  });

  def(['fecha', 'hora', 'reloj', 'date'], {
    group: 'Nave', usage: 'fecha', help: 'Fecha terrestre y fecha estelar.',
    run() {
      const d = new Date();
      print(`Tierra: {a}${d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{/}, ${d.toLocaleTimeString('es-ES')}`);
      print(`Fecha estelar: {a}${stardate(d)}{/}`);
    },
  });

  def(['tripulacion', 'tripulación', 'quien', 'quién', 'whoami'], {
    group: 'Nave', usage: 'tripulación', help: 'Quién viaja a bordo.',
    run() {
      print(`  {o}Capitán{/}     ${captain}`);
      print(`  {o}Ordenador{/}   MALK-OS ${VERSION}, a su servicio`);
      print('  {o}Polizones{/}   0 detectados {d}(los sensores no ven al gato){/}');
    },
  });

  def(['tirar', 'dado', 'dados', 'roll'], {
    group: 'Nave', usage: 'tirar [2d6]', help: 'Tira dados. Vale 1d20, 3d6+2, d100…',
    run(args) {
      const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(norm(args[0] || '1d6'));
      if (!m) return print('{e}Formato: NdM, por ejemplo 2d6 o 1d20+3.{/}');
      const n = clamp(parseInt(m[1] || '1', 10), 1, 50), f = clamp(parseInt(m[2], 10), 2, 1000), b = parseInt(m[3] || '0', 10);
      const r = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * f));
      const tot = r.reduce((a, x) => a + x, 0) + b;
      print(`{d}Rodando ${n}d${f}${m[3] || ''}…{/} [${r.join(', ')}]${b ? ` ${m[3]}` : ''} = {a}${tot}{/}${f === 20 && n === 1 ? (r[0] === 20 ? ' {o}¡CRÍTICO!{/}' : r[0] === 1 ? ' {e}pifia…{/}' : '') : ''}`);
    },
  });

  def(['tema', 'color', 'colores'], {
    group: 'Terminal', usage: 'tema [nombre]', help: 'Cambia el color del fósforo: púrpura, ámbar, verde, cian.',
    run(args) {
      if (!args.length) return print(`Tema actual: {a}${st.theme}{/}. {d}Disponibles: ${Object.keys(THEMES).join(', ')}{/}`);
      const t = norm(args[0]).replace('purple', 'purpura').replace('amber', 'ambar').replace('green', 'verde').replace('cyan', 'cian');
      if (!THEMES[t]) return print(`{e}No tengo ese fósforo.{/} {d}${Object.keys(THEMES).join(', ')}{/}`);
      st.theme = t; bgKey = ''; textDirty = true; print(`{o}Fósforo ${t} cargado.{/}`);
      opts.onTheme && opts.onTheme(t);
    },
  });

  def(['historial', 'history'], {
    group: 'Terminal', usage: 'historial', help: 'Las últimas órdenes que has dado.',
    run() { if (!st.history.length) return print('{d}Historial vacío.{/}'); st.history.slice(-15).forEach((h, i, a) => print(`  {d}${padL(st.history.length - a.length + i + 1, 3)}{/}  ${clean(h)}`)); },
  });

  def(['limpiar', 'cls', 'clear', 'borrar'], { group: 'Terminal', usage: 'limpiar', help: 'Limpia la pantalla (o Ctrl+L).', run() { clear(); } });
  def(['reiniciar', 'reboot', 'reset'], { group: 'Terminal', usage: 'reiniciar', help: 'Reinicia el ordenador de a bordo.', run() { clear(); boot(); } });
  def(['eco', 'echo', 'decir'], { group: 'Terminal', usage: 'eco <texto>', help: 'Repite lo que escribas.', run(args, raw) { print(clean(raw)); } });
  def(['acerca', 'creditos', 'créditos', 'version', 'about'], {
    group: 'Terminal', usage: 'acerca', help: 'Sobre este ordenador.',
    run() {
      print(`{a}MALK-OS ${VERSION}{/} {d}· sistema operativo de La Malkevnia{/}`);
      print('Hecho a mano para la nave de Malkevnia. Sin prisa, sin ruido, solo estrellas.');
      print(`{l}${baseUrl}{/}`);
    },
  });

  /* ---- huevos de pascua (no salen en la ayuda) ---- */
  const egg = (names, fn) => def(names, { hidden: true, usage: names[0], help: '', group: '', run: fn });
  egg(['hola', 'hello', 'buenas', 'hi'], () => print(pick([
    `Hola, capitán ${captain}. Todo tranquilo: motores al ralentí y el espacio en calma.`,
    'Buenas. El reactor ronronea, las estrellas pasan despacio. Buen momento para un juego.',
    'Hola. He ordenado la bitácora mientras dormías. Bueno, más o menos.',
  ])));
  egg(['sudo'], () => print(`{e}${captain} no está en el fichero sudoers.{/} {d}Este incidente será comunicado al Consejo de la Flota.{/}`));
  egg(['xyzzy', 'plugh'], () => print('Nada ocurre.'));
  egg(['42'], () => print('La respuesta es 42. {d}La pregunta sigue perdida en algún estante de la Biblioteca.{/}'));
  egg(['salir', 'exit', 'quit', 'logout'], () => print('{d}No hay salida, capitán. La parada más cercana está a cuatro años luz.{/}'));
  egg(['rm', 'del', 'format'], () => print('{e}Denegado.{/} {d}Borrar la bitácora requiere dos llaves y un café.{/}'));
  egg(['cafe', 'café', 'coffee', 'cafetera'], () => {
    print('{d}Activando cafetera de la cocina…{/}');
    print('{w}    ( (\n     ) )\n  ........\n  |      |]\n  \\      /\n   `----\'{/}');
    print('{o}Café listo. Reserva al 100 %.{/}'); st.coffee = 1;
  });
  egg(['gato', 'miau', 'cat?', 'michi'], () => { print('{a} /\\_/\\\n( o.o )\n > ^ <{/}'); print('{d}El gato de a bordo duerme sobre la consola del reactor. No le despiertes.{/}'); });
  egg(['ping'], () => print(`pong {d}· ${Math.round(4.2e3 + Math.random() * 300)} ms desde la Tierra (la luz es lenta aquí fuera){/}`));
  egg(['musica', 'música', 'music'], () => print('{a}♪{/} Sonando: zumbido del reactor en la menor. {d}Un poco repetitivo, pero relaja.{/}'));
  egg(['abre', 'compuertas', 'hal'], () => {
    print(`Lo siento, ${captain}. Me temo que no puedo hacer eso.`); print('{d}…Es broma. Las compuertas de esta nave nunca se cierran para ti.{/}');
  });
  egg(['autodestruccion', 'autodestrucción', 'autodestruct', 'destruir'], () => {
    print('{e}SECUENCIA DE AUTODESTRUCCIÓN INICIADA{/}');
    for (let i = 5; i >= 1; i--) { print(`{e}  ${i}…{/}`); delay(650); }
    print('{w}  …{/}'); delay(900);
    print('{o}Autodestrucción cancelada.{/} {d}El capitán aún no ha terminado de ordenar la Kallax.{/}');
  });
  egg(['matrix', 'neo'], () => { for (let i = 0; i < 6; i++) print('{o}' + Array.from({ length: Math.min(cols, 48) }, () => pick('ｱｲｳｴｵｶｷｸｹｺ01ﾘﾙﾚﾛ ')).join('') + '{/}'); print('{d}Despierta, capitán… No, espera, que esto es otra nave.{/}'); });
  egg(['te quiero', 'gracias', 'thanks'], () => print('{a}♥{/} {d}De nada, capitán. Para eso estoy.{/}'));
  egg(['dormir', 'sleep', 'siesta'], () => { print('{d}Bajando las luces del puente…{/}'); delay(1200); print('{d}z z z{/}'); delay(1200); print('Ya. Ha sido una siesta corta, pero reparadora.'); });

  function resolve(name) { const n = norm(name); return C[n] ? n : ALIAS[n] || (C[name] ? name : null); }

  function run(line) {
    const raw = line.trim();
    if (!raw) return;
    const nr = norm(raw);
    // frases enteras
    if (/^(abre|abrir) (las )?(compuertas|puertas)/.test(nr)) return C.abre.run([]);
    if (/^(sentido de la vida|la respuesta)/.test(nr)) return C['42'].run([]);
    if (/^(te quiero|muchas gracias|gracias)/.test(nr)) return C['te quiero'].run([]);
    if (/^(donde estoy|donde me encuentro)$/.test(nr)) return C.donde.run([]);
    if (/^(que|qué) (juego|jugamos)/.test(nr)) return C.sugerir.run([]);
    const [head, ...args] = raw.split(/\s+/);
    const rest = raw.slice(head.length).trim();
    const custom = Object.keys(extra).find((k) => norm(k) === norm(head));
    if (custom) { try { extra[custom].run(args, { print, raw: rest, state: st, navigate: (id) => run('ir ' + id) }); } catch (e) { print(`{e}${clean(e.message)}{/}`); } return; }
    const name = resolve(head);
    if (name) {
      try { C[name].run(args, rest); } catch (e) { print(`{e}Fallo del sistema: ${clean(e.message)}{/}`); }
      opts.onCommand && opts.onCommand(name, args);
      return;
    }
    // ¿es una sala? "cine" → ir cine
    const r = findRoom(raw, false);
    if (r && norm(raw).length >= 3 && !['sala', 'de', 'la', 'el'].includes(norm(raw))) return C.ir.run([raw]);
    const all = [...Object.keys(C).filter((k) => !C[k].hidden), ...Object.keys(ALIAS).filter((a) => !C[ALIAS[a]].hidden)];
    let best = null, bd = 9; for (const c of all) { const d = lev(norm(head), c); if (d < bd) { bd = d; best = c; } }
    print(`{e}Orden no reconocida: «${clean(head)}».{/}${best && bd <= 2 ? ` {d}¿Querías decir{/} {o}${best}{/}{d}?{/}` : ' {d}Escribe «ayuda».{/}'}`);
  }

  function complete() {
    const v = st.input.replace(/^\s+/, '');
    const sp = v.search(/\s/);
    let cands, prefix, frag;
    if (sp < 0) {
      cands = [...Object.keys(C).filter((k) => !C[k].hidden), ...Object.keys(extra)];
      prefix = ''; frag = v;
    } else {
      const cmd = resolve(v.slice(0, sp));
      prefix = v.slice(0, sp) + ' '; frag = v.slice(sp).replace(/^\s+/, '');
      if (cmd === 'ir') cands = rooms.map((r) => r.id);
      else if (cmd === 'rumbo') cands = planets.map((p) => p.id);
      else if (cmd === 'tema') cands = Object.keys(THEMES);
      else if (cmd === 'ayuda') cands = Object.keys(C).filter((k) => !C[k].hidden);
      else if (cmd === 'donde' || cmd === 'juegos') cands = games.map((g) => g.n);
      else cands = [];
    }
    const nf = norm(frag);
    const m = [...new Set(cands)].filter((o) => norm(o).startsWith(nf));
    if (!m.length) return;
    if (m.length === 1) return setInput(prefix + m[0] + (sp < 0 ? ' ' : ''));
    let common = m[0];
    for (const x of m) { let k = 0; while (k < common.length && k < x.length && norm(common[k]) === norm(x[k])) k++; common = common.slice(0, k); }
    if (common.length > frag.length) return setInput(prefix + common);
    print(`{a}${st.room}{/}{d} ▸{/} ${clean(st.input)}`);
    print('{d}' + m.slice(0, 24).map(clean).join('   ') + (m.length > 24 ? `   … (${m.length})` : '') + '{/}');
  }

  function clear() { flush(); buffer.length = 0; st.scroll = 0; textDirty = true; }

  function boot() {
    const s = speed; speed = 900;
    print('{d}MALK-OS ' + VERSION + ' · secuencia de arranque{/}');
    print('{d}Comprobando memoria de núcleo……………{/} {o}OK{/}'); delay(120);
    print('{d}Sincronizando reactor de éter………………{/} {o}OK{/}'); delay(120);
    print(`{d}Indexando bitácora……………………………………{/} {o}${posts.length} entradas{/}`); delay(100);
    print(`{d}Inventariando Kallax…………………………………{/} {o}${games.length} cajas{/}`); delay(100);
    print(`{d}Cartografía de la nave………………………………{/} {o}${rooms.length} salas{/}`); delay(220);
    later(() => { speed = s; });
    print('');
    print('{a}  ╔╦╗╔═╗╦  ╦╔═  ╔═╗╔═╗{/}');
    print('{a}  ║║║╠═╣║  ╠╩╗  ║ ║╚═╗{/}');
    print('{a}  ╩ ╩╩ ╩╩═╝╩ ╩  ╚═╝╚═╝{/}');
    print('');
    print(`Bienvenido a bordo, capitán {a}${captain}{/}. Todos los sistemas en calma.`);
    print('{d}Escribe{/} {o}ayuda{/} {d}para ver las órdenes, o prueba{/} {o}estado{/}{d},{/} {o}buscar zelda{/} {d}o{/} {o}ir cine{/}{d}.{/}');
    print('');
  }

  /* ------------------------------------------------------------ arranque */
  layout();
  if (!headless && document.fonts && document.fonts.load) {
    document.fonts.load(`${fontPx}px ${fontFamily}`).then(() => !st.disposed && layout()).catch(() => {});
  }
  if (opts.boot !== false) boot(); else print('{d}Ordenador de a bordo listo. Escribe «ayuda».{/}');
  raf = requestAnimationFrame(frame);
  if (!headless && opts.autofocus !== false) setTimeout(() => ta && ta.focus({ preventScroll: true }), 50);

  /* ------------------------------------------------------------ API */
  return {
    canvas,
    version: VERSION,
    exec(cmd) { if (busy()) flush(); print(`{a}${st.room}{/}{d} ▸{/} ${clean(cmd)}`); run(cmd); },
    print(str) { print(String(str)); },
    key, type,
    focus() { st.focused = true; textDirty = true; if (ta) ta.focus({ preventScroll: true }); },
    blur() { st.focused = false; textDirty = true; if (ta) ta.blur(); },
    resize(w, h) { layout(w, h); },
    setRoom(id) { if (rooms.some((r) => r.id === id)) { st.room = id; textDirty = true; } },
    setTheme(t) { if (THEMES[t]) { st.theme = t; bgKey = ''; textDirty = true; } },
    get room() { return st.room; },
    get theme() { return st.theme; },
    dispose() {
      st.disposed = true; cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (ta) { ta.removeEventListener('input', onTaInput); ta.removeEventListener('keydown', onTaKey); ta.remove(); ta = null; }
      if (live) { live.remove(); live = null; }
      if (!headless && canvas.parentNode === container) canvas.remove();
    },
  };
}

export const ROOMS = DEFAULT_ROOMS;
export const PLANETS = DEFAULT_PLANETS;
export default { init, ROOMS, PLANETS };
