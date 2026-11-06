// visor.js · Cartografía estelar: visor a pantalla completa de un sistema procedural
// Monta su propia interfaz (ficha del sistema, ficha del cuerpo, tiempo, capas, mapa,
// nombres flotantes) y su propio renderer dentro de un contenedor. Al cerrarlo libera
// el contexto WebGL. Lo usan demo.html (página suelta) y montaje.js (nave unificada).
//
//   const visor = crearVisor({ contenedor, semilla, usarHash, calidad, alSalir });
//   visor.cargar('otra-semilla'); visor.dispose();

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildSystem, generateSystem, createBackdrop, LensingShader, lensUniformsFrom } from './sistemas-estelares.js';

/* ------------------------------------------------------------------ */
/*  Estilos (con prefijo .mkv-carto para no pisar a nadie)             */
/* ------------------------------------------------------------------ */
// Layout: lienzo a pantalla completa. Arriba: marca + semilla. Izquierda: ficha del sistema.
// Derecha: ficha del cuerpo seleccionado. Abajo: tiempo + capas. Esquina inferior derecha: mapa.
const CSS = `
.mkv-carto{--void:#07051a;--hull:rgba(20,14,44,.74);--hull-strong:rgba(26,18,58,.92);--line:rgba(176,156,255,.22);--line-strong:rgba(182,156,255,.55);
  --ink:#ece8ff;--muted:#a59cd3;--violet:#b69cff;--glow:#e4d6ff;--teal:#6ff0c0;--gold:#ffd27a;--rose:#ff8aa8;
  --font-ui:"Chakra Petch",ui-monospace,"Segoe UI",system-ui,sans-serif;--font-lore:"Spectral",Georgia,"Times New Roman",serif;
  position:absolute;inset:0;overflow:hidden;background:var(--void);color:var(--ink);font-family:var(--font-ui);-webkit-font-smoothing:antialiased;color-scheme:dark;z-index:30}
.mkv-carto *,.mkv-carto *::before,.mkv-carto *::after{box-sizing:border-box}
.mkv-carto canvas.mkv-c{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
.mkv-carto canvas.mkv-c.jump{animation:mkvjump .7s ease}
@keyframes mkvjump{0%{filter:none}35%{filter:brightness(2.4) blur(3px)}100%{filter:none}}
.mkv-carto button,.mkv-carto input{font:500 13px/1 var(--font-ui);color:var(--ink)}
.mkv-carto button{cursor:pointer;background:var(--hull);border:1px solid var(--line);border-radius:4px;padding:8px 11px;letter-spacing:.05em;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mkv-carto button:hover{border-color:var(--violet)}
.mkv-carto button:focus-visible,.mkv-carto input:focus-visible{outline:2px solid var(--violet);outline-offset:2px}
.mkv-carto button.primary{background:rgba(150,118,255,.3);border-color:var(--line-strong);color:#fff}
.mkv-carto button[aria-pressed="true"]{background:rgba(150,118,255,.34);border-color:var(--line-strong);color:#fff}
.mkv-carto .top{position:absolute;top:0;left:0;right:0;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;
  padding:calc(12px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px));pointer-events:none;z-index:5}
.mkv-carto .top>*{pointer-events:auto}
.mkv-carto .brand{font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.mkv-carto .brand b{color:var(--violet);font-weight:600}
.mkv-carto .controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.mkv-carto .seed{display:flex}
.mkv-carto .seed input{width:9.5em;background:var(--hull);border:1px solid var(--line);border-right:0;border-radius:4px 0 0 4px;padding:8px 10px;letter-spacing:.08em}
.mkv-carto .seed button{border-radius:0 4px 4px 0}
.mkv-carto .panel{position:absolute;z-index:4;background:var(--hull);border:1px solid var(--line);border-radius:8px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.mkv-carto .sys{left:max(16px,env(safe-area-inset-left,0px));top:64px;width:320px;max-height:calc(100% - 64px - 92px);overflow:auto;padding:14px 14px 10px}
.mkv-carto .sys h1{font-size:22px;font-weight:600;margin:0 0 2px;letter-spacing:.02em;color:#fff}
.mkv-carto .desig{font-size:11px;letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
.mkv-carto .tags{display:flex;flex-wrap:wrap;gap:5px;margin:10px 0}
.mkv-carto .tag{font-size:11px;padding:3px 7px;border-radius:99px;border:1px solid var(--line);color:var(--glow);background:rgba(150,118,255,.12)}
.mkv-carto .tag.civ{border-color:rgba(255,210,122,.45);color:var(--gold);background:rgba(255,210,122,.08)}
.mkv-carto .tag.anom{border-color:rgba(255,138,168,.45);color:var(--rose);background:rgba(255,138,168,.08)}
.mkv-carto .nota{font-family:var(--font-lore);font-style:italic;color:var(--muted);font-size:14px;line-height:1.45;margin:6px 0 10px}
.mkv-carto .sec{font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin:12px 0 6px;list-style:none}
.mkv-carto .list{list-style:none;margin:0;padding:0}
.mkv-carto .list li button{width:100%;display:flex;align-items:center;gap:8px;text-align:left;background:transparent;border:1px solid transparent;padding:6px 6px;border-radius:5px;backdrop-filter:none;-webkit-backdrop-filter:none}
.mkv-carto .list li button:hover,.mkv-carto .list li button[aria-current="true"]{background:rgba(150,118,255,.14);border-color:var(--line)}
.mkv-carto .dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;box-shadow:0 0 8px currentColor}
.mkv-carto .li-main{flex:1;min-width:0}
.mkv-carto .li-name{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mkv-carto .li-sub{display:block;font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mkv-carto .li-badge{font-size:10px;color:var(--gold)}
.mkv-carto .info{right:max(16px,env(safe-area-inset-right,0px));top:64px;width:330px;max-height:calc(100% - 64px - 92px - 250px);overflow:auto;padding:14px;display:none}
.mkv-carto .info.open{display:block}
.mkv-carto .info h2{margin:0;font-size:19px;color:#fff;font-weight:600}
.mkv-carto .info .close{float:right;padding:4px 8px;margin:-4px -4px 0 8px}
.mkv-carto .kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;margin:10px 0}
.mkv-carto .kv dt{color:var(--muted)}
.mkv-carto .kv dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.mkv-carto .lore{font-family:var(--font-lore);font-size:14.5px;line-height:1.5;color:#ddd6ff;margin:8px 0}
.mkv-carto .callout{border-left:2px solid var(--gold);padding:6px 10px;margin:10px 0;background:rgba(255,210,122,.06);font-size:13px;line-height:1.45}
.mkv-carto .callout.g{border-color:var(--teal);background:rgba(111,240,192,.06)}
.mkv-carto .callout.r{border-color:var(--rose);background:rgba(255,138,168,.06)}
.mkv-carto .bottom{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;gap:10px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;
  padding:8px max(16px,env(safe-area-inset-right,0px)) calc(12px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));pointer-events:none}
.mkv-carto .bottom>*{pointer-events:auto}
.mkv-carto .time{display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:var(--hull);border:1px solid var(--line);border-radius:8px;padding:6px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mkv-carto .time button{padding:7px 9px;backdrop-filter:none;-webkit-backdrop-filter:none}
.mkv-carto .clock{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--glow);padding:0 8px;min-width:11em}
.mkv-carto .layers{display:flex;gap:6px;flex-wrap:wrap}
.mkv-carto .layers button{font-size:12px;padding:7px 9px}
.mkv-carto .mapWrap{right:max(16px,env(safe-area-inset-right,0px));bottom:calc(70px + env(safe-area-inset-bottom,0px));width:230px;height:230px;padding:0;overflow:hidden}
.mkv-carto .map{width:100%;height:100%;display:block;cursor:crosshair}
.mkv-carto .maplabel{position:absolute;left:10px;top:8px;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);pointer-events:none}
.mkv-carto .labels{position:absolute;inset:0;pointer-events:none;z-index:3;overflow:hidden}
.mkv-carto .lbl{position:absolute;transform:translate(-50%,0);font-size:11.5px;letter-spacing:.06em;color:var(--glow);white-space:nowrap;text-shadow:0 0 6px #000,0 0 2px #000;pointer-events:auto;cursor:pointer;padding:2px 4px;opacity:.88}
.mkv-carto .lbl:hover{opacity:1;color:#fff}
.mkv-carto .lbl.estrella{color:#ffe7c0;font-weight:600}
.mkv-carto .lbl.lagrange{color:var(--gold);font-size:10.5px}
.mkv-carto .lbl.cometa{color:#a8d4ff}
.mkv-carto .lbl.anomalia{color:var(--rose)}
.mkv-carto .lbl.cinturon{color:#cbbfe8;font-size:10.5px;opacity:.7}
.mkv-carto .toast{position:absolute;left:50%;top:70px;transform:translateX(-50%);z-index:9;background:var(--hull-strong);border:1px solid var(--line-strong);padding:8px 14px;border-radius:6px;font-size:13px;opacity:0;transition:opacity .25s;pointer-events:none}
.mkv-carto .toast.on{opacity:1}
.mkv-carto .help{position:absolute;left:50%;bottom:calc(74px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font-size:11px;color:var(--muted);z-index:3;pointer-events:none;letter-spacing:.08em;text-align:center;white-space:nowrap}
.mkv-carto .loading{position:absolute;inset:0;display:grid;place-items:center;z-index:10;background:var(--void);font-size:13px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);transition:opacity .6s}
.mkv-carto .loading.hide{opacity:0;pointer-events:none}
.mkv-carto .toggleSys{display:none}
@media (max-width: 760px){
  .mkv-carto .sys{top:auto;bottom:calc(132px + env(safe-area-inset-bottom,0px));left:12px;right:12px;width:auto;max-height:38vh;display:none}
  .mkv-carto .sys.open{display:block}
  .mkv-carto .toggleSys{display:inline-block}
  .mkv-carto .info{left:12px;right:12px;width:auto;top:auto;bottom:calc(132px + env(safe-area-inset-bottom,0px));max-height:42vh}
  .mkv-carto .mapWrap{width:120px;height:120px;top:calc(104px + env(safe-area-inset-top,0px));bottom:auto;right:12px}
  .mkv-carto .brand,.mkv-carto .help,.mkv-carto .copy{display:none}
  .mkv-carto .seed input{width:7em}
  .mkv-carto .clock{min-width:0}
  .mkv-carto .bottom{gap:6px}
  .mkv-carto .time button,.mkv-carto .layers button{padding:7px 7px;font-size:11.5px}
}
@media (prefers-reduced-motion: reduce){ .mkv-carto canvas.mkv-c.jump{animation:none} }
`;

const HTML = `
<canvas class="mkv-c" aria-label="Vista 3D del sistema estelar"></canvas>
<div class="labels" aria-hidden="true"></div>
<div class="loading">Calculando órbitas…</div>
<header class="top">
  <div class="brand">La <b>Malkevnia</b> · Cartografía estelar</div>
  <div class="controls">
    <button class="toggleSys" aria-expanded="false">Sistema</button>
    <div class="seed"><input aria-label="Semilla del sistema" spellcheck="false" autocomplete="off"><button data-act="go">Ir</button></div>
    <button class="copy" data-act="copy" title="Copiar enlace a este sistema">Copiar</button>
    <button class="primary" data-act="next">Siguiente sistema ›</button>
    <button data-act="exit" hidden>⟵ Volver a la nave</button>
  </div>
</header>
<aside class="panel sys" aria-label="Sistema"></aside>
<aside class="panel info" aria-live="polite"></aside>
<div class="panel mapWrap"><span class="maplabel">Mapa</span><canvas class="map" aria-label="Mapa del sistema visto desde arriba"></canvas></div>
<div class="help">Arrastra para girar · rueda o pellizco para acercarte · clic en un nombre para seguirlo · espacio pausa</div>
<footer class="bottom">
  <div class="time" role="group" aria-label="Tiempo">
    <button data-act="pause" aria-pressed="false" title="Pausa (espacio)">❚❚</button>
    <span class="speeds"></span>
    <span class="clock">Día 0</span>
  </div>
  <div class="layers" role="group" aria-label="Capas">
    <button data-layer="orbitas" aria-pressed="true">Órbitas</button>
    <button data-layer="zonas" aria-pressed="false">Gravedad y zonas</button>
    <button data-layer="civilizacion" aria-pressed="true">Civilización</button>
    <button data-layer="cinturones" aria-pressed="true">Cinturones</button>
    <button data-layer="etiquetas" aria-pressed="true">Nombres</button>
  </div>
</footer>
<div class="toast"></div>`;

function ensureStyles() {
  if (document.getElementById('mkv-carto-css')) return;
  const st = document.createElement('style'); st.id = 'mkv-carto-css'; st.textContent = CSS; document.head.appendChild(st);
  if (!document.querySelector('link[data-mkv-fonts]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.mkvFonts = '1';
    l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600&family=Spectral:ital,wght@0,400;1,400&display=swap';
    document.head.appendChild(l);
  }
}

/* ------------------------------------------------------------------ */
/*  Formato                                                             */
/* ------------------------------------------------------------------ */
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmt = (x, d = 2) => (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-2 && x !== 0)) ? x.toExponential(1).replace('e+', '·10^').replace('e-', '·10^-') : (+(+x).toFixed(d)).toLocaleString('es-ES');
const fmtDias = (d) => d < 2 ? `${fmt(d * 24, 1)} h` : d < 800 ? `${fmt(d, 1)} días` : `${fmt(d / 365.25, 1)} años`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PLANET_DOT = { rocoso: '#b9a894', desertico: '#e0b070', oceanico: '#4ea0ff', vergel: '#6fd08a', volcanico: '#ff6a3a', helado: '#bfe4ff', gaseoso: '#e0b0ff', jupiter_caliente: '#ff9a6a', gigante_helado: '#7ac8ff', mini_neptuno: '#8ab8ff', archipielago: '#4ec8d8', pantanoso: '#8aa060', tundra: '#cfd8e8' };
const SPEEDS = [[0.25, '¼ d/s'], [2, '2 d/s'], [10, '10 d/s'], [60, '2 m/s'], [365, '1 a/s'], [3650, '10 a/s']];
function randomSeed() { const c = 'abcdefghijkmnpqrstuvwxyz23456789'; let s = ''; const b = crypto.getRandomValues(new Uint32Array(7)); for (const v of b) s += c[v % c.length]; return s; }

/**
 * @param {{contenedor?:HTMLElement, semilla?:string, usarHash?:boolean, calidad?:'alta'|'media'|'baja', alSalir?:Function, alCargar?:Function}} opts
 */
export function crearVisor(opts = {}) {
  ensureStyles();
  const host = opts.contenedor || document.body;
  const root = document.createElement('div');
  root.className = 'mkv-carto';
  root.innerHTML = HTML;
  if (host === document.body) root.style.position = 'fixed';
  host.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const calidad = opts.calidad || (innerWidth < 760 ? 'media' : 'alta');

  /* ---------- Render ---------- */
  const canvas = $('canvas.mkv-c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: calidad !== 'baja', powerPreference: 'high-performance' });
  renderer.setPixelRatio(calidad === 'baja' ? 1 : Math.min(devicePixelRatio, calidad === 'media' ? 1.25 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.zoomSpeed = 1.1; controls.rotateSpeed = 0.6;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const lensPass = new ShaderPass(LensingShader);
  composer.addPass(lensPass);
  const bloom = calidad === 'baja' ? null : new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82);
  if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let sys = null, backdrop = null, focus = null, labels = [], showLabels = true, flight = null, speedIdx = 1, disposed = false;
  const prevFocusPos = new THREE.Vector3();
  const detail = calidad === 'alta' ? 'media' : 'baja';

  /* ---------- Tiempo ---------- */
  const speedsEl = $('.speeds');
  SPEEDS.forEach(([v, l], i) => {
    const b = document.createElement('button'); b.textContent = l; b.title = `${v} días por segundo`;
    b.setAttribute('aria-pressed', String(i === speedIdx));
    b.onclick = () => { speedIdx = i; sys?.setTimeScale(v); if (sys?.state.paused) togglePause(); [...speedsEl.children].forEach((c, k) => c.setAttribute('aria-pressed', String(k === i))); };
    speedsEl.appendChild(b);
  });
  const pauseBtn = $('[data-act="pause"]');
  function togglePause() { if (!sys) return; sys.setPaused(!sys.state.paused); pauseBtn.setAttribute('aria-pressed', String(sys.state.paused)); pauseBtn.textContent = sys.state.paused ? '▶' : '❚❚'; }
  pauseBtn.onclick = togglePause;

  /* ---------- Capas ---------- */
  root.querySelectorAll('[data-layer]').forEach((b) => b.onclick = () => {
    const k = b.dataset.layer; const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    if (k === 'etiquetas') { showLabels = on; return; }
    sys?.setVisible({ [k]: on });
  });

  /* ---------- Semilla ---------- */
  const seedInput = $('.seed input');
  const go = (s) => { if (!s) return; if (opts.usarHash) location.hash = encodeURIComponent(s); else cargar(s); };
  $('[data-act="go"]').onclick = () => go(seedInput.value.trim());
  seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(seedInput.value.trim()); e.stopPropagation(); });
  $('[data-act="next"]').onclick = () => go(randomSeed());
  $('[data-act="copy"]').onclick = async () => {
    const text = opts.usarHash ? location.href : sys.spec.seed;
    try { await navigator.clipboard.writeText(text); toast(opts.usarHash ? 'Enlace copiado' : `Semilla copiada: ${sys.spec.seed}`); } catch { toast(`Semilla: ${sys.spec.seed}`); }
  };
  const exitBtn = $('[data-act="exit"]');
  if (opts.alSalir) { exitBtn.hidden = false; exitBtn.onclick = () => opts.alSalir(); }
  const onHash = () => { const s = decodeURIComponent(location.hash.slice(1)); if (s && s !== sys?.spec.seed) cargar(s); };
  if (opts.usarHash) addEventListener('hashchange', onHash);
  const sysPanel = $('.sys'), toggleSys = $('.toggleSys');
  toggleSys.onclick = () => { const o = sysPanel.classList.toggle('open'); toggleSys.setAttribute('aria-expanded', String(o)); if (o) closeInfo(); };
  let toastT; function toast(m) { const t = $('.toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600); }
  const onKey = (e) => {
    if (!root.isConnected || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'n' || e.key === 'N') $('[data-act="next"]').click();
    else if (e.key === 'Escape') {
      if ($('.info').classList.contains('open')) { closeInfo(); setFocus(null); }
      else if (opts.alSalir) opts.alSalir();
    }
  };
  addEventListener('keydown', onKey);

  /* ---------- Carga ---------- */
  function cargar(seed) {
    canvas.classList.remove('jump'); void canvas.offsetWidth; canvas.classList.add('jump');
    if (sys) { sys.dispose(); sys = null; }
    if (backdrop) { backdrop.dispose(); backdrop = null; }
    const spec = generateSystem(seed || 'malkevnia');
    sys = buildSystem(spec, { detail, timeScale: SPEEDS[speedIdx][0], viewportHeight: innerHeight * renderer.getPixelRatio() });
    scene.add(sys.group);
    backdrop = createBackdrop(spec, { stars: calidad === 'baja' ? 3500 : 7000 });
    scene.add(backdrop.group);
    root.querySelectorAll('[data-layer]').forEach((b) => { const k = b.dataset.layer; if (k !== 'etiquetas') sys.setVisible({ [k]: b.getAttribute('aria-pressed') === 'true' }); });
    pauseBtn.setAttribute('aria-pressed', 'false'); pauseBtn.textContent = '❚❚';
    seedInput.value = spec.seed;
    if (opts.usarHash) document.title = `${spec.nombre} · Cartografía estelar`;
    renderSystemPanel(spec);
    buildLabels();
    closeInfo();
    focus = null; flight = null;
    const ext = sys.extension;
    if (ext > 700) {
      const a = sys.getBody('A');
      focus = a; prevFocusPos.copy(a.position);
      controls.target.copy(a.position); camera.position.copy(a.position).add(new THREE.Vector3(0, 90, 220));
    } else { controls.target.set(0, 0, 0); camera.position.set(0, ext * 0.55, ext * 1.05); }
    controls.maxDistance = Math.max(ext * 4, 400);
    controls.minDistance = 0.6;
    $('.loading').classList.add('hide');
    opts.alCargar?.(spec);
    return spec;
  }

  function renderSystemPanel(spec) {
    const el = sysPanel;
    const stars = spec.estrellas.map((s) => `<li><button data-focus="${s.id}"><span class="dot" style="color:${hex(s.clase === 'agujero-negro' ? 0x553366 : s.color)};background:${hex(s.clase === 'agujero-negro' ? 0x110818 : s.color)}"></span><span class="li-main"><span class="li-name">${esc(s.nombre)}</span><span class="li-sub">${esc(s.claseNombre)}${s.fantasia ? ' ✧' : ''}</span></span></button></li>`).join('');
    const groups = {};
    for (const p of spec.planetas) (groups[p.orbita.alrededorDe] ||= []).push(p);
    const multi = spec.estrellas.length > 1;
    const planets = Object.entries(groups).map(([hostId, ps]) => `${multi ? `<li class="sec">${hostId.length > 1 ? `Circumbinarios de ${hostId.split('').join(' y ')}` : `En torno a ${hostId}`}</li>` : ''}` + ps.map((p) => `<li><button data-focus="${p.id}"><span class="dot" style="color:${PLANET_DOT[p.tipo] || '#c8b8ff'};background:${PLANET_DOT[p.tipo] || '#c8b8ff'}"></span><span class="li-main"><span class="li-name">${esc(p.nombre)} <span class="li-sub" style="display:inline">· ${esc(p.letra)}</span></span><span class="li-sub">${esc(p.tipoNombre)} · ${fmt(p.orbita.aUA)} UA · ${p.lunas} ${p.lunas === 1 ? 'luna' : 'lunas'}</span></span>${p.civilizacion ? `<span class="li-badge" title="${esc(p.civilizacion.nivelNombre)}">${p.civilizacion.extinta ? '☖' : '✦'.repeat(Math.max(1, p.civilizacion.nivel))}</span>` : ''}</button></li>`).join('')).join('');
    const extra = [...spec.cometas.map((c) => ({ id: c.id, n: c.nombre, s: `Cometa · e = ${c.orbita.e}` })), ...spec.anomalias.filter((a) => a.distanciaEscena).map((a) => ({ id: a.id, n: a.nombre, s: 'Anomalía' }))];
    el.innerHTML = `
      <div class="desig">${esc(spec.designacion)} · ${esc(spec.arquitecturaNombre)}</div>
      <h1>${esc(spec.nombre)}</h1>
      <div class="tags">${spec.etiquetas.map((t) => `<span class="tag ${/[Cc]ivilizaci/.test(t) ? 'civ' : spec.anomalias.some((a) => a.nombre === t) ? 'anom' : ''}">${esc(t)}</span>`).join('')}
        <span class="tag">${spec.planetas.length} ${spec.planetas.length === 1 ? 'planeta' : 'planetas'}</span><span class="tag">${spec.totalLunas} ${spec.totalLunas === 1 ? 'luna' : 'lunas'}</span></div>
      <p class="nota">«${esc(spec.notaCapitan)}»</p>
      <div class="sec">Estrellas</div><ul class="list">${stars}</ul>
      <div class="sec">Planetas</div><ul class="list">${planets || '<li class="li-sub" style="padding:6px">Ningún planeta. Solo polvo y silencio.</li>'}</ul>
      ${spec.cinturones.length ? `<div class="sec">Cinturones</div><ul class="list">${spec.cinturones.map((c) => `<li><button data-focus="${c.id}"><span class="dot" style="color:#a898c8;background:#a898c8;border-radius:2px"></span><span class="li-main"><span class="li-name">${esc(c.tipoNombre)}</span><span class="li-sub">${fmt(c.interiorUA)}–${fmt(c.exteriorUA)} UA</span></span></button></li>`).join('')}</ul>` : ''}
      ${extra.length ? `<div class="sec">Otros</div><ul class="list">${extra.map((x) => `<li><button data-focus="${x.id}"><span class="dot" style="color:#9ad0ff;background:#9ad0ff"></span><span class="li-main"><span class="li-name">${esc(x.n)}</span><span class="li-sub">${esc(x.s)}</span></span></button></li>`).join('')}</ul>` : ''}`;
    el.querySelectorAll('[data-focus]').forEach((b) => b.onclick = () => { const body = sys.getBody(b.dataset.focus); setFocus(body); openInfo(body); if (innerWidth < 760) { el.classList.remove('open'); toggleSys.setAttribute('aria-expanded', 'false'); } });
  }

  /* ---------- Ficha ---------- */
  const info = $('.info');
  function closeInfo() { info.classList.remove('open'); root.querySelectorAll('.sys [aria-current]').forEach((x) => x.removeAttribute('aria-current')); }
  function findPair(n, id) {
    if (!n || n.tipo !== 'par') return null;
    if ((n.a.tipo === 'estrella' && n.a.id === id) || (n.b.tipo === 'estrella' && n.b.id === id)) return n;
    return findPair(n.a, id) || findPair(n.b, id);
  }
  function openInfo(b) {
    if (!b) return;
    const d = b.datos || {};
    root.querySelectorAll('.sys [data-focus]').forEach((x) => x.toggleAttribute('aria-current', x.dataset.focus === b.id));
    let html = `<button class="close" aria-label="Cerrar ficha">✕</button><div class="desig">${esc(b.subtitulo || '')}</div><h2>${esc(b.nombre)}</h2>`;
    if (b.tipo === 'estrella') {
      html += `<p class="lore">${esc(d.descripcion)}</p><dl class="kv">
        <dt>Clase</dt><dd>${esc(d.claseNombre)}</dd>
        ${d.clase !== 'agujero-negro' ? `<dt>Temperatura</dt><dd>${fmt(d.temperaturaK, 0)} K</dd>` : ''}
        <dt>Masa</dt><dd>${fmt(d.masaSol)} soles</dd>
        <dt>Radio</dt><dd>${d.radioSol < 0.001 ? `${fmt(d.radioSol * 696000, 0)} km` : `${fmt(d.radioSol)} soles`}</dd>
        <dt>Luminosidad</dt><dd>${fmt(d.luminosidadSol)} soles</dd>
        <dt>Edad</dt><dd>${d.edadGa < 0.01 ? `${fmt(d.edadGa * 1000, 1)} millones de años` : `${fmt(d.edadGa)} mil millones de años`}</dd>
        ${d.clase === 'pulsar' ? `<dt>Periodo de giro</dt><dd>${fmt(d.rotacionPeriodo * 1000, 0)} ms (a cámara lenta)</dd>` : ''}
      </dl>`;
      if (d.flags?.discoAcrecion) html += `<div class="callout">Tiene un disco de acreción: materia que cae en espiral y se calienta hasta brillar en rayos X.</div>`;
      if (d.flags?.nebulosa === 'planetaria') html += `<div class="callout g">La envuelve la nebulosa planetaria que soltó al morir: gas iluminado desde dentro.</div>`;
      if (d.clase === 'agujero-negro' || d.clase === 'neutrones' || d.clase === 'pulsar' || d.clase === 'magnetar') html += `<div class="callout g">Fíjate en las estrellas del fondo al pasar cerca: su gravedad dobla la luz (lente gravitatoria).</div>`;
      const par = findPair(sys.spec.jerarquia, d.id);
      if (par?.transferencia) html += `<div class="callout r">Binaria interactiva: ${esc(par.transferencia.donante === d.id ? 'esta estrella llena su lóbulo de Roche y cede materia por el punto L1' : 'recibe materia de su compañera a través del punto L1')}. Activa «Gravedad y zonas» para ver los lóbulos.</div>`;
      else if (par) html += `<div class="callout g">Orbita con su compañera alrededor del baricentro común cada ${fmtDias(par.orbita.periodoDias)} (a = ${fmt(par.orbita.aUA)} UA, e = ${par.orbita.e}).</div>`;
    } else if (b.tipo === 'planeta') {
      const m = d.meta || {};
      html += `<dl class="kv">
        <dt>Tipo</dt><dd>${esc(d.tipoNombre)}</dd><dt>Zona</dt><dd>${esc(d.zonaNombre)}</dd>
        <dt>Órbita</dt><dd>${fmt(d.orbita.aUA, 3)} UA · e ${d.orbita.e}</dd><dt>Año</dt><dd>${fmtDias(d.orbita.periodoDias)}</dd>
        <dt>Temperatura</dt><dd>${fmt(d.temperaturaC, 0)} °C</dd><dt>Radio</dt><dd>${fmt(d.radioKm, 0)} km</dd>
        <dt>Gravedad</dt><dd>${fmt(d.gravedad)} g</dd><dt>Masa</dt><dd>${fmt(d.masaTierra)} Tierras</dd>
        <dt>Lunas</dt><dd>${d.lunas}${d.lunasMenores ? ` (${d.lunasPrincipales} grandes)` : ''}</dd>
        <dt>Esfera de Hill</dt><dd>${fmt(d.hillUA * 149.6, 2)} M km</dd><dt>Límite de Roche</dt><dd>${fmt(d.limiteRocheKm, 0)} km</dd>
        ${m.atmosfera ? `<dt>Atmósfera</dt><dd>${esc(m.atmosfera)}</dd>` : ''}
      </dl>`;
      if (d.circumbinario) html += `<div class="callout g">Circumbinario: orbita a las dos estrellas a la vez. Tiene dos soles y dos sombras.</div>`;
      if (d.mareas) html += `<div class="callout">${esc(d.mareas)}</div>`;
      if (d.civilizacion) html += `<div class="callout ${d.civilizacion.extinta ? 'r' : ''}"><b>${esc(d.civilizacion.nivelNombre)}</b> · ${esc(d.civilizacion.pueblo)}<br>${esc(d.civilizacion.descripcion)}</div>`;
      if (d.anomalia === 'desintegrandose') html += `<div class="callout r">Se está desintegrando: la estrella lo evapora y deja una cola de roca.</div>`;
      if (d.troyanos) html += `<div class="callout g">Tiene asteroides troyanos atrapados en sus puntos L4 y L5, 60° por delante y por detrás.</div>`;
      if (m.lore) html += `<p class="lore">${esc(m.lore)}</p>`;
    } else if (b.tipo === 'lagrange') {
      html += `<p class="lore">${/L4|L5/.test(b.id) ? 'Un punto estable: lo que cae aquí se queda, mecido entre las dos gravedades. Ideal para fondear.' : 'Un equilibrio inestable: un empujoncito y todo se va. Las naves aparcan aquí con el motor encendido.'}</p>`;
    } else if (b.tipo === 'cometa') {
      html += `<dl class="kv"><dt>Órbita</dt><dd>${fmt(d.orbita.aUA)} UA · e ${d.orbita.e}</dd><dt>Periodo</dt><dd>${fmtDias(d.orbita.periodoDias)}</dd></dl><p class="lore">La cola siempre apunta lejos de la luz: azul la de iones, recta; blanca la de polvo, curvada hacia atrás. Detrás deja una corriente de meteoroides: si un planeta la cruza, lluvia de estrellas.</p>`;
    } else {
      html += `<p class="lore">${esc(d.descripcion || '')}</p>`;
      if (d.huecosKirkwood?.length) html += `<div class="callout g">${d.huecosKirkwood.length} ${d.huecosKirkwood.length === 1 ? 'hueco' : 'huecos'} de Kirkwood por resonancia con ${esc(sys.spec.planetas.find((p) => p.id === d.resonanteCon)?.nombre || 'el gigante')}.</div>`;
    }
    info.innerHTML = html;
    info.querySelector('.close').onclick = () => { closeInfo(); };
    info.classList.add('open');
    if (innerWidth < 760) sysPanel.classList.remove('open');
  }

  /* ---------- Cámara que sigue ---------- */
  function setFocus(b) {
    focus = b;
    if (!b) return;
    prevFocusPos.copy(b.position);
    const r = Math.max(b.alcance || b.radio || 1, 0.6);
    const dist = b.tipo === 'estrella' ? r * 9 + 12 : b.tipo === 'cinturon' ? 80 : r * 4.5 + 3;
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0, 0.4, 1).normalize();
    dir.y = Math.max(dir.y, 0.22); dir.normalize();
    flight = { t: 0, fromPos: camera.position.clone(), fromTgt: controls.target.clone(), dir, dist };
  }
  function updateCamera(dt) {
    if (focus) {
      const delta = focus.position.clone().sub(prevFocusPos);
      camera.position.add(delta); controls.target.add(delta);
      if (flight) { flight.fromPos.add(delta); flight.fromTgt.add(delta); }
      prevFocusPos.copy(focus.position);
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 1.4);
      const k = flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - Math.pow(-2 * flight.t + 2, 3) / 2;
      const tgt = focus ? focus.position : flight.fromTgt;
      const endPos = tgt.clone().addScaledVector(flight.dir, flight.dist);
      controls.target.lerpVectors(flight.fromTgt, tgt, k);
      camera.position.lerpVectors(flight.fromPos, endPos, k);
      if (flight.t >= 1) flight = null;
    }
  }
  canvas.addEventListener('pointerdown', () => { flight = null; });

  /* ---------- Etiquetas ---------- */
  const labelsEl = $('.labels');
  function buildLabels() {
    labelsEl.innerHTML = ''; labels = [];
    for (const b of sys.bodies) {
      const d = document.createElement('div');
      d.className = `lbl ${b.tipo}`; d.textContent = b.tipo === 'lagrange' ? b.id.split('-').pop() : b.nombre;
      d.onclick = () => { setFocus(b); openInfo(b); };
      labelsEl.appendChild(d);
      labels.push({ b, d, shown: true });
    }
  }
  const _p = new THREE.Vector3();
  function updateLabels() {
    const w = root.clientWidth, h = root.clientHeight;
    const zonas = sys.visible.zonas;
    for (const L of labels) {
      const { b, d } = L;
      let show = showLabels && (b.tipo !== 'lagrange' || zonas);
      if (b.tipo === 'cinturon' && !sys.visible.cinturones) show = false;
      if (show) {
        _p.copy(b.position).applyMatrix4(sys.group.matrixWorld);
        const dist = _p.distanceTo(camera.position);
        _p.project(camera);
        if (_p.z > 1 || _p.z < -1 || Math.abs(_p.x) > 1.1 || Math.abs(_p.y) > 1.1) show = false;
        const pr = (b.radio || 0.3) / dist * h;
        if (b.tipo === 'planeta' && pr < 0.25 && dist > 600) show = false;
        if ((b.tipo === 'lagrange' || b.tipo === 'cinturon') && dist > 900) show = false;
        if (show) {
          const off = Math.min(Math.max(pr * 1.2, 8), 60);
          d.style.left = `${(_p.x * 0.5 + 0.5) * w}px`; d.style.top = `${(-_p.y * 0.5 + 0.5) * h + off}px`;
        }
      }
      if (show !== L.shown) { d.style.display = show ? '' : 'none'; L.shown = show; }
    }
  }

  /* ---------- Mapa ---------- */
  const map = $('.map'); const mctx = map.getContext('2d');
  function mapTransform() {
    const ext = sys.extension, R = map.width / 2 - 8, k = Math.max(ext * 0.04, 6);
    return (x, z) => { const r = Math.hypot(x, z); if (r < 1e-6) return [map.width / 2, map.height / 2]; const rr = R * Math.log(1 + r / k) / Math.log(1 + ext / k); return [map.width / 2 + x / r * rr, map.height / 2 + z / r * rr]; };
  }
  function barycenter(id) {
    const p = new THREE.Vector3(); let m = 0;
    for (const s of id.split('')) { const b = sys.getBody(s); if (b) { p.addScaledVector(b.position, b.datos.masaSol); m += b.datos.masaSol; } }
    return m ? p.multiplyScalar(1 / m) : p;
  }
  function drawMap() {
    const dpr = Math.min(devicePixelRatio, 2);
    const W = Math.round(map.clientWidth * dpr), H = Math.round(map.clientHeight * dpr);
    if (!W || !H) return;
    if (map.width !== W || map.height !== H) { map.width = W; map.height = H; }
    const T = mapTransform(); const c = mctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,6,28,.55)'; c.fillRect(0, 0, W, H);
    c.lineWidth = dpr * 0.8;
    for (const b of sys.bodies) {
      if (b.tipo !== 'planeta') continue;
      const p = b.datos; const hostB = sys.getBody(p.orbita.alrededorDe);
      const hp = hostB ? hostB.position : barycenter(p.orbita.alrededorDe);
      c.strokeStyle = p.zona === 'habitable' ? 'rgba(111,240,192,.45)' : p.civilizacion && !p.civilizacion.extinta ? 'rgba(255,210,122,.4)' : 'rgba(164,140,255,.28)';
      c.beginPath();
      const a = p.orbita.aEscena, e = p.orbita.eEscena ?? 0, ang = p.orbita.argPeri + p.orbita.nodo, cw = Math.cos(ang), sw = Math.sin(ang);
      for (let i = 0; i <= 48; i++) { const E = i / 48 * Math.PI * 2; const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E); const [mx, my] = T(hp.x + x * cw - y * sw, hp.z + x * sw + y * cw); i ? c.lineTo(mx, my) : c.moveTo(mx, my); }
      c.stroke();
    }
    for (const b of sys.bodies) {
      if (!['estrella', 'planeta', 'cometa', 'anomalia'].includes(b.tipo)) continue;
      const [x, y] = T(b.position.x, b.position.z);
      const r = (b.tipo === 'estrella' ? 3.6 : b.tipo === 'planeta' ? 2.2 : 1.6) * dpr;
      c.fillStyle = b.tipo === 'estrella' ? hex(b.datos.clase === 'agujero-negro' ? 0x9966cc : b.datos.color) : b.tipo === 'planeta' ? (PLANET_DOT[b.datos.tipo] || '#c8b8ff') : b.tipo === 'cometa' ? '#9ad0ff' : '#ff8aa8';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      if (focus === b) { c.strokeStyle = '#fff'; c.lineWidth = dpr; c.beginPath(); c.arc(x, y, r + 3 * dpr, 0, Math.PI * 2); c.stroke(); c.lineWidth = dpr * 0.8; }
    }
    const [cx, cy] = T(controls.target.x, controls.target.z);
    c.strokeStyle = 'rgba(228,214,255,.7)'; c.beginPath(); c.moveTo(cx - 5 * dpr, cy); c.lineTo(cx + 5 * dpr, cy); c.moveTo(cx, cy - 5 * dpr); c.lineTo(cx, cy + 5 * dpr); c.stroke();
  }
  map.addEventListener('click', (e) => {
    const rect = map.getBoundingClientRect(); const k = map.width / rect.width;
    const mx = (e.clientX - rect.left) * k, my = (e.clientY - rect.top) * k;
    const T = mapTransform(); let best = null, bd = 1e9;
    for (const b of sys.bodies) { if (!['estrella', 'planeta', 'cometa', 'anomalia'].includes(b.tipo)) continue; const [x, y] = T(b.position.x, b.position.z); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = b; } }
    if (best && bd < 18 * k) { setFocus(best); openInfo(best); }
  });

  /* ---------- Bucle ---------- */
  const clockEl = $('.clock');
  const clockText = (t) => { const y = Math.floor(t / 365.25), d = Math.floor(t - y * 365.25); return `Año ${y.toLocaleString('es-ES')} · día ${d}`; };
  function resize() {
    const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
    renderer.setSize(w, h, false); composer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    sys?.setViewportHeight(h * renderer.getPixelRatio());
    lensPass.uniforms.uAspect.value = w / h;
  }
  const ro = new ResizeObserver(resize); ro.observe(root);
  const clock = new THREE.Clock();
  let mapT = 0;
  renderer.setAnimationLoop(() => {
    if (disposed || !sys) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    sys.update(dt, camera);
    updateCamera(dt);
    controls.update();
    backdrop.update(camera, renderer.getPixelRatio() * (root.clientHeight || innerHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
    lensUniformsFrom(sys.lenses, camera, lensPass.uniforms);
    composer.render();
    updateLabels();
    if ((mapT += dt) > 0.1) { mapT = 0; drawMap(); clockEl.textContent = clockText(sys.time); }
  });

  resize();
  cargar(opts.semilla || (opts.usarHash && decodeURIComponent(location.hash.slice(1))) || 'malkevnia');

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    removeEventListener('keydown', onKey);
    if (opts.usarHash) removeEventListener('hashchange', onHash);
    ro.disconnect();
    sys?.dispose(); backdrop?.dispose();
    controls.dispose();
    composer.passes.forEach((p) => p.dispose?.());
    composer.renderTarget1?.dispose(); composer.renderTarget2?.dispose();
    renderer.dispose(); renderer.forceContextLoss();
    root.remove();
  }

  return {
    cargar, dispose, root, renderer, scene, camera,
    get sistema() { return sys; },
    enfocar(id) { const b = sys?.getBody(id); if (b) { setFocus(b); openInfo(b); } return !!b; },
  };
}
