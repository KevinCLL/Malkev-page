/**
 * rendimiento.js · Modo rendimiento adaptable para La Malkevnia
 *
 * Módulo ES autocontenido. No importa Three.js: trabaja sobre el renderer,
 * la escena y (opcional) el composer que le pases, así que vale para
 * cualquier versión de three >= 0.150.
 *
 *   import * as R from './rendimiento.js';
 *   const info = R.detect(renderer);
 *   R.applyPreset(renderer, scene, info.recomendado, { composer, bloom });
 *   R.autoTune(renderer, 60);
 *   R.panel(document.body);
 *
 * Ver README.md para el detalle de la API.
 */

export const NIVELES = ['bajo', 'medio', 'alto', 'ultra'];

export const PRESETS = {
  bajo:  { nombre: 'bajo',  pixelRatioMax: 0.75, escalaMin: 0.5,  sombras: false, tamSombra: 512,  tipoSombra: 'basic', postproceso: false, particulas: 0.25, detalle: 0, anisotropia: 1,  antialias: false },
  medio: { nombre: 'medio', pixelRatioMax: 1.0,  escalaMin: 0.6,  sombras: true,  tamSombra: 1024, tipoSombra: 'pcf',   postproceso: false, particulas: 0.5,  detalle: 1, anisotropia: 2,  antialias: true },
  alto:  { nombre: 'alto',  pixelRatioMax: 1.5,  escalaMin: 0.65, sombras: true,  tamSombra: 2048, tipoSombra: 'soft',  postproceso: true,  particulas: 0.8,  detalle: 2, anisotropia: 4,  antialias: true },
  ultra: { nombre: 'ultra', pixelRatioMax: 2.0,  escalaMin: 0.75, sombras: true,  tamSombra: 4096, tipoSombra: 'soft',  postproceso: true,  particulas: 1.0,  detalle: 3, anisotropia: 16, antialias: true },
};

// Constantes de three (estables desde r1xx); evitan importar three aquí.
const SHADOW = { basic: 0, pcf: 1, soft: 2 };

const CLAVE_LS = 'malkevnia.rendimiento.v1';

/* ------------------------------------------------------------------ */
/* Estado compartido (un renderer por página es lo normal)             */
/* ------------------------------------------------------------------ */
const st = {
  renderer: null, scene: null, opts: {},
  ajustes: null,          // preset efectivo (con overrides del usuario)
  escala: 1,              // escala dinámica de resolución (0..1)
  info: null,             // resultado de detect()
  tuner: null,
  oyentes: new Set(),
  usuario: cargar(),      // { preset: 'auto'|nivel, overrides:{}, fpsObjetivo, dinamica }
};

function cargar() {
  try { return JSON.parse(localStorage.getItem(CLAVE_LS)) || {}; } catch { return {}; }
}
function guardar() {
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(st.usuario)); } catch { /* sin almacenamiento */ }
}
function emitir(tipo, extra = {}) {
  const ev = { tipo, ajustes: st.ajustes, escala: st.escala, ...extra };
  for (const fn of st.oyentes) { try { fn(ev); } catch (e) { console.error(e); } }
}

/** Suscribirse a cambios. Devuelve una función para darse de baja. */
export function onChange(fn) { st.oyentes.add(fn); return () => st.oyentes.delete(fn); }
export function ajustes() { return st.ajustes; }
export function escala() { return st.escala; }
export function preferencias() { return { ...st.usuario }; }

/* ------------------------------------------------------------------ */
/* detect()                                                            */
/* ------------------------------------------------------------------ */
/**
 * Detecta GPU y dispositivo y recomienda un preset.
 * @param {WebGLRenderer} [renderer] si no se pasa, crea un contexto temporal.
 */
export function detect(renderer) {
  let gl = renderer?.getContext?.();
  let temporal = null;
  if (!gl) {
    temporal = document.createElement('canvas');
    gl = temporal.getContext('webgl2') || temporal.getContext('webgl');
  }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const movil = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') ||
    (nav.maxTouchPoints > 1 && /Macintosh/.test(nav.userAgent || ''));
  const out = {
    gpu: 'desconocida', fabricante: 'desconocido', webgl2: false, maxTextura: 0,
    movil, nucleos: nav.hardwareConcurrency || 4, memoriaGB: nav.deviceMemory || null,
    dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    software: false, tier: 1, recomendado: 'medio', motivo: '',
  };
  if (!gl) { out.tier = 0; out.recomendado = 'bajo'; out.motivo = 'Sin WebGL'; return out; }

  out.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  out.maxTextura = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) {
    out.gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || out.gpu;
    out.fabricante = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || out.fabricante;
  } else {
    out.gpu = gl.getParameter(gl.RENDERER) || out.gpu;
  }
  // limpia el formato de ANGLE: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 ...)"
  out.gpu = limpiarGPU(String(out.gpu));

  const [tier, motivo] = clasificar(out.gpu.toLowerCase(), out);
  out.tier = tier; out.motivo = motivo;
  out.software = tier === 0 && /swiftshader|llvmpipe|software|basic render/i.test(out.gpu);
  out.recomendado = NIVELES[tier];

  if (temporal) gl.getExtension('WEBGL_lose_context')?.loseContext();
  st.info = out;
  return out;
}

// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060"
function limpiarGPU(g) {
  const m = g.match(/^ANGLE \((.*)\)$/);
  if (m) {
    const partes = []; let prof = 0, cur = '';
    for (const ch of m[1]) { if (ch === '(') prof++; if (ch === ')') prof--; if (ch === ',' && !prof) { partes.push(cur.trim()); cur = ''; } else cur += ch; }
    partes.push(cur.trim());
    g = partes[1] || partes[0];
  }
  g = g.replace(/\s*\(0x[0-9a-f]+\)/gi, '').replace(/\s*(Direct3D|vs_\d|ps_\d).*$/, '').trim();
  return g || 'desconocida';
}

function clasificar(g, d) {
  if (/swiftshader|llvmpipe|software|basic render|microsoft basic/.test(g)) return [0, 'Render por software'];
  let tier = 2, motivo = 'GPU de sobremesa';
  if (/rtx\s*(40|50)\d\d|rx\s*(7|9)\d\d\d|apple m\d (max|ultra|pro)|apple m[3-9]/.test(g)) { tier = 3; motivo = 'GPU de gama alta'; }
  else if (/rtx|gtx\s*(16|10)\d\d|rx\s*[56]\d\d\d|radeon pro|apple m\d|arc a\d/.test(g)) { tier = 2; motivo = 'GPU dedicada'; }
  else if (/gtx|rx\s*\d{3}\b|radeon(?! graphics)/.test(g)) { tier = 2; motivo = 'GPU dedicada antigua'; }
  else if (/iris xe|radeon graphics|radeon vega|780m|680m/.test(g)) { tier = 1; motivo = 'Gráfica integrada moderna'; }
  else if (/intel|uhd|hd graphics|iris/.test(g)) { tier = 1; motivo = 'Gráfica integrada'; }
  else if (/mali-g(7|6)\d|adreno\s*(7|6[4-9])\d|apple gpu|apple a1[5-9]/.test(g)) { tier = 1; motivo = 'Móvil de gama alta'; }
  else if (/mali|adreno|powervr|apple a\d/.test(g)) { tier = 0; motivo = 'Móvil'; }

  if (d.movil && tier > 1) { tier = 1; motivo += ' (móvil)'; }
  if (d.memoriaGB && d.memoriaGB <= 2) { tier = Math.min(tier, 0); motivo += ', poca memoria'; }
  else if (d.nucleos <= 2) { tier = Math.min(tier, 1); motivo += ', pocos núcleos'; }
  return [tier, motivo];
}

/* ------------------------------------------------------------------ */
/* applyPreset()                                                       */
/* ------------------------------------------------------------------ */
/**
 * Aplica un preset al renderer y a la escena.
 * @param {WebGLRenderer} renderer
 * @param {Scene} scene
 * @param {'bajo'|'medio'|'alto'|'ultra'|'auto'|object} preset nombre o objeto parcial (se mezcla con 'medio')
 * @param {object} [opts]
 * @param {EffectComposer} [opts.composer]  se le actualiza pixelRatio/tamaño
 * @param {Pass|Pass[]} [opts.bloom]       pases que se activan con postproceso
 * @param {object} [opts.overrides]        cambios puntuales sobre el preset (sombras:false, ...)
 * @returns {object} ajustes efectivos
 */
export function applyPreset(renderer, scene, preset = 'auto', opts = {}) {
  st.renderer = renderer || st.renderer;
  st.scene = scene || st.scene;
  st.opts = { ...st.opts, ...opts };
  renderer = st.renderer; scene = st.scene;

  let base;
  if (typeof preset === 'object' && preset) base = { ...PRESETS.medio, ...preset };
  else {
    // 'auto' respeta lo que el visitante eligiera en el panel la última vez
    if (preset === 'auto' && NIVELES.includes(st.usuario.preset)) preset = st.usuario.preset;
    const nombre = preset === 'auto' ? (st.info || detect(renderer)).recomendado : preset;
    base = { ...(PRESETS[nombre] || PRESETS.medio) };
  }
  const prev = st.ajustes;
  const a = { ...base, ...(st.usuario.overrides || {}), ...(opts.overrides || {}) };
  st.ajustes = a;

  // Resolución
  aplicarResolucion();

  // Sombras
  const cambioSombras = !prev || prev.sombras !== a.sombras || prev.tipoSombra !== a.tipoSombra;
  renderer.shadowMap.enabled = a.sombras;
  renderer.shadowMap.type = SHADOW[a.tipoSombra] ?? 1;
  renderer.shadowMap.needsUpdate = true;

  const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() || 1;
  const aniso = Math.min(a.anisotropia, maxAniso);
  const materiales = new Set();

  scene?.traverse((o) => {
    const ud = o.userData?.rendimiento;
    // Luces con sombra: tamaño del mapa
    if (o.isLight && o.shadow && o.castShadow !== undefined) {
      if (o.shadow.mapSize.x !== a.tamSombra) {
        o.shadow.mapSize.set(a.tamSombra, a.tamSombra);
        o.shadow.map?.dispose(); o.shadow.map = null;
      }
    }
    // Partículas: Points o InstancedMesh marcados
    if (ud?.particulas) {
      const total = ud.total ?? (o.isInstancedMesh ? o.count : o.geometry?.attributes?.position?.count) ?? 0;
      if (ud.total === undefined) ud.total = total;
      const n = Math.max(1, Math.floor(total * a.particulas));
      if (o.isInstancedMesh) o.count = n;
      else o.geometry?.setDrawRange(0, n);
    }
    // Detalle: objetos que sólo se muestran a partir de cierto nivel
    if (ud?.detalleMin !== undefined) {
      const min = typeof ud.detalleMin === 'string' ? NIVELES.indexOf(ud.detalleMin) : ud.detalleMin;
      o.visible = a.detalle >= min;
    }
    if (o.material) for (const m of [].concat(o.material)) materiales.add(m);
  });

  for (const m of materiales) {
    for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
      const t = m[k];
      if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
    }
    if (cambioSombras) m.needsUpdate = true;
  }

  // Postproceso
  for (const p of [].concat(st.opts.bloom || [])) if (p) p.enabled = a.postproceso;

  emitir('preset', { anterior: prev });
  return a;
}

function aplicarResolucion() {
  const r = st.renderer, a = st.ajustes;
  if (!r || !a) return;
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const pr = Math.max(0.35, Math.min(dpr, a.pixelRatioMax) * st.escala);
  if (Math.abs(r.getPixelRatio() - pr) < 0.005) return;
  r.setPixelRatio(pr);
  const c = st.opts.composer;
  if (c) { c.setPixelRatio?.(pr); const s = r.getSize({ x: 0, y: 0, set(x, y) { this.x = x; this.y = y; return this; } }); c.setSize(s.x, s.y); }
}

/** Fija la escala de resolución dinámica a mano (0.35..1). */
export function setEscala(v) {
  st.escala = Math.max(st.ajustes?.escalaMin ?? 0.5, Math.min(1, v));
  aplicarResolucion();
  emitir('escala');
}

/** Usa esto en tu bucle si quieres un único punto de render. */
export function render(renderer, scene, camera, composer) {
  if (composer && st.ajustes?.postproceso !== false) composer.render();
  else renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* autoTune()                                                          */
/* ------------------------------------------------------------------ */
/**
 * Mide el tiempo de frame con su propio requestAnimationFrame y ajusta:
 *  1) la escala de resolución (rápido, sin tirones),
 *  2) si no basta, baja de preset; si sobra margen durante un rato, sube
 *     (nunca por encima del techo).
 * @param {WebGLRenderer} renderer
 * @param {number} [fpsObjetivo=60]
 * @param {object} [opts] { cambiarPreset=true, techo:'ultra', suelo:'bajo', onDecision }
 * @returns {{ stop(), fps:number, ms:number, historial:number[], objetivo:number, setObjetivo(n), pausar(b) }}
 */
export function autoTune(renderer, fpsObjetivo = 60, opts = {}) {
  st.renderer = renderer || st.renderer;
  st.tuner?.stop();
  if (!st.ajustes) applyPreset(st.renderer, st.scene, st.usuario.preset || 'auto');

  const cfg = { cambiarPreset: true, techo: 'ultra', suelo: 'bajo', ...opts };
  const ctl = {
    fps: 0, ms: 0, historial: [], objetivo: st.usuario.fpsObjetivo || fpsObjetivo,
    activo: st.usuario.dinamica !== false, pausado: false,
    stop() { cancelAnimationFrame(raf); st.tuner = null; },
    setObjetivo(n) { this.objetivo = n; st.usuario.fpsObjetivo = n; guardar(); reset(); },
    pausar(b = true) { this.pausado = b; reset(); },
  };
  st.tuner = ctl;

  let raf = 0, last = performance.now(), ventana = [], tLento = 0, tHolgado = 0, enfriamiento = 1.5, tEnMin = 0;
  const reset = () => { ventana = []; tLento = 0; tHolgado = 0; tEnMin = 0; enfriamiento = 1; };

  const decidir = (texto, tipo) => { cfg.onDecision?.(texto, tipo); emitir('decision', { texto, decision: tipo }); };

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = now - last; last = now;
    // pestaña oculta o vuelta de segundo plano: no cuenta
    if (dt <= 0 || dt > 1500 || document.hidden) return;
    ventana.push(dt); if (ventana.length > 30) ventana.shift();
    const media = ventana.reduce((s, v) => s + v, 0) / ventana.length;
    ctl.ms = media; ctl.fps = 1000 / media;
    ctl.historial.push(dt); if (ctl.historial.length > 240) ctl.historial.shift();

    if (!ctl.activo || ctl.pausado || ventana.length < 20) return;
    if ((enfriamiento -= dt / 1000) > 0) return;

    const presupuesto = 1000 / ctl.objetivo;
    const s = dt / 1000;
    if (media > presupuesto * 1.12) { tLento += s; tHolgado = 0; }
    else if (media < presupuesto * 1.03) { tHolgado += s; tLento = Math.max(0, tLento - s); }
    else { tLento = Math.max(0, tLento - s * 0.5); tHolgado = 0; }

    const a = st.ajustes, idx = NIVELES.indexOf(a.nombre);
    const enMin = st.escala <= a.escalaMin + 1e-3;
    tEnMin = enMin && tLento > 0 ? tEnMin + s : 0;

    if (tLento > 0.6 && !enMin) {
      // reducir resolución proporcional a lo que falta
      const factor = Math.max(0.8, Math.sqrt(presupuesto / media));
      setEscala(st.escala * factor);
      decidir(`Resolución al ${Math.round(st.escala * 100)} %`, 'baja-escala');
      tLento = 0; enfriamiento = 0.8;
    } else if (tEnMin > 1.5 && cfg.cambiarPreset && idx > NIVELES.indexOf(cfg.suelo) && st.usuario.preset === 'auto') {
      applyPreset(st.renderer, st.scene, NIVELES[idx - 1]);
      st.escala = 0.9; aplicarResolucion();
      decidir(`Calidad bajada a ${NIVELES[idx - 1]}`, 'baja-preset');
      reset(); enfriamiento = 2;
    } else if (tHolgado > 2.5 && st.escala < 1) {
      setEscala(st.escala + 0.08);
      decidir(`Resolución al ${Math.round(st.escala * 100)} %`, 'sube-escala');
      tHolgado = 0; enfriamiento = 1.2;
    } else if (tHolgado > 8 && st.escala >= 1 && cfg.cambiarPreset && idx < NIVELES.indexOf(cfg.techo) && st.usuario.preset === 'auto') {
      applyPreset(st.renderer, st.scene, NIVELES[idx + 1]);
      st.escala = 0.8; aplicarResolucion();
      decidir(`Calidad subida a ${NIVELES[idx + 1]}`, 'sube-preset');
      reset(); enfriamiento = 3;
    }
  }
  if (!st.usuario.preset) st.usuario.preset = 'auto';
  raf = requestAnimationFrame(tick);
  return ctl;
}

/* ------------------------------------------------------------------ */
/* panel()                                                             */
/* ------------------------------------------------------------------ */
const CSS = `
.mk-rend{--mk-bg:rgba(16,11,34,.86);--mk-fg:#e9e2ff;--mk-dim:#9b90c4;--mk-acc:#b59bff;--mk-line:rgba(181,155,255,.22);
  font:13px/1.4 system-ui,sans-serif;color:var(--mk-fg);background:var(--mk-bg);border:1px solid var(--mk-line);border-radius:14px;
  padding:14px 16px;width:min(300px,100%);box-sizing:border-box;backdrop-filter:blur(10px);display:grid;gap:12px}
.mk-rend h3{margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--mk-acc);display:flex;justify-content:space-between;align-items:baseline}
.mk-rend h3 b{font:600 18px ui-monospace,monospace;letter-spacing:0;color:var(--mk-fg);font-variant-numeric:tabular-nums}
.mk-rend .mk-fila{display:flex;justify-content:space-between;align-items:center;gap:10px}
.mk-rend .mk-seg{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid var(--mk-line);border-radius:9px;overflow:hidden}
.mk-rend .mk-seg button{all:unset;cursor:pointer;text-align:center;padding:6px 0;font-size:11px;color:var(--mk-dim)}
.mk-rend .mk-seg button[aria-pressed=true]{background:var(--mk-acc);color:#140c2b;font-weight:600}
.mk-rend button:focus-visible,.mk-rend input:focus-visible,.mk-rend select:focus-visible{outline:2px solid var(--mk-acc);outline-offset:2px}
.mk-rend label{color:var(--mk-dim)}
.mk-rend input[type=range]{width:120px;accent-color:var(--mk-acc)}
.mk-rend input[type=checkbox]{accent-color:var(--mk-acc);width:16px;height:16px}
.mk-rend select{background:transparent;color:var(--mk-fg);border:1px solid var(--mk-line);border-radius:6px;padding:2px 4px}
.mk-rend select option{background:#160f2e}
.mk-rend .mk-gpu{font-size:11px;color:var(--mk-dim);border-top:1px solid var(--mk-line);padding-top:10px;overflow-wrap:anywhere}
.mk-rend .mk-reset{all:unset;cursor:pointer;font-size:11px;color:var(--mk-acc);justify-self:start}
`;

/**
 * Pinta un panel de ajustes en español dentro de `container`.
 * Usa el renderer/escena que ya conozca el módulo (applyPreset/autoTune),
 * o los que le pases en opts.
 * @returns {{ el:HTMLElement, destroy() }}
 */
export function panel(container, opts = {}) {
  if (opts.renderer) st.renderer = opts.renderer;
  if (opts.scene) st.scene = opts.scene;
  if (!document.getElementById('mk-rend-css')) {
    const s = document.createElement('style'); s.id = 'mk-rend-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const el = document.createElement('section');
  el.className = 'mk-rend'; el.setAttribute('aria-label', 'Ajustes de rendimiento');
  el.innerHTML = `
    <h3>Rendimiento <b data-k="fps">-- fps</b></h3>
    <div class="mk-seg" role="group" aria-label="Calidad">
      ${['auto', ...NIVELES].map((n) => `<button type="button" data-p="${n}">${n === 'auto' ? 'Auto' : n[0].toUpperCase() + n.slice(1)}</button>`).join('')}
    </div>
    <div class="mk-fila"><label for="mk-din">Resolución dinámica</label><input id="mk-din" type="checkbox"></div>
    <div class="mk-fila"><label for="mk-esc">Resolución <span data-k="esc"></span></label><input id="mk-esc" type="range" min="35" max="100" step="1"></div>
    <div class="mk-fila"><label for="mk-obj">FPS objetivo</label>
      <select id="mk-obj"><option value="30">30</option><option value="60">60</option><option value="90">90</option><option value="120">120</option><option value="144">144</option></select></div>
    <div class="mk-fila"><label for="mk-som">Sombras</label><input id="mk-som" type="checkbox"></div>
    <div class="mk-fila"><label for="mk-post">Postprocesado (bloom)</label><input id="mk-post" type="checkbox"></div>
    <div class="mk-fila"><label for="mk-part">Partículas <span data-k="part"></span></label><input id="mk-part" type="range" min="5" max="100" step="5"></div>
    <button type="button" class="mk-reset">Restablecer valores del preset</button>
    <div class="mk-gpu" data-k="gpu"></div>`;
  container.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const k = (n) => el.querySelector(`[data-k="${n}"]`);

  const reaplicar = () => {
    const p = st.usuario.preset || 'auto';
    const nombre = p === 'auto' ? (st.ajustes?.nombre || 'auto') : p;
    applyPreset(st.renderer, st.scene, nombre);
  };
  const override = (clave, valor) => {
    st.usuario.overrides = { ...(st.usuario.overrides || {}), [clave]: valor };
    guardar(); reaplicar();
  };

  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    st.usuario.preset = b.dataset.p; st.usuario.overrides = {}; guardar();
    st.escala = 1;
    applyPreset(st.renderer, st.scene, b.dataset.p);
  }));
  $('#mk-din').addEventListener('change', (e) => {
    st.usuario.dinamica = e.target.checked; guardar();
    if (st.tuner) st.tuner.activo = e.target.checked;
    if (!e.target.checked) setEscala(1);
  });
  $('#mk-esc').addEventListener('input', (e) => {
    st.escala = Number(e.target.value) / 100; aplicarResolucion(); emitir('escala');
    if (st.tuner) st.tuner.pausar(false);
  });
  $('#mk-obj').addEventListener('change', (e) => st.tuner?.setObjetivo(Number(e.target.value)));
  $('#mk-som').addEventListener('change', (e) => override('sombras', e.target.checked));
  $('#mk-post').addEventListener('change', (e) => override('postproceso', e.target.checked));
  $('#mk-part').addEventListener('change', (e) => override('particulas', Number(e.target.value) / 100));
  $('.mk-reset').addEventListener('click', () => { st.usuario.overrides = {}; guardar(); reaplicar(); });

  const pintar = () => {
    const a = st.ajustes; if (!a) return;
    const p = st.usuario.preset || 'auto';
    el.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === p)));
    const autoBtn = el.querySelector('[data-p=auto]');
    autoBtn.textContent = p === 'auto' ? `Auto · ${a.nombre}` : 'Auto';
    $('#mk-din').checked = st.usuario.dinamica !== false;
    $('#mk-esc').value = Math.round(st.escala * 100); k('esc').textContent = `${Math.round(st.escala * 100)} %`;
    $('#mk-som').checked = a.sombras; $('#mk-post').checked = a.postproceso;
    $('#mk-part').value = Math.round(a.particulas * 100); k('part').textContent = `${Math.round(a.particulas * 100)} %`;
    if (st.tuner) $('#mk-obj').value = String(st.tuner.objetivo);
    const i = st.info || (st.renderer && detect(st.renderer));
    if (i) k('gpu').textContent = `${i.gpu} · ${i.motivo} · recomendado: ${i.recomendado}`;
  };
  const off = onChange(pintar);
  pintar();
  let raf = 0;
  const fps = () => { raf = requestAnimationFrame(fps); if (st.tuner) k('fps').textContent = `${Math.round(st.tuner.fps)} fps`; };
  fps();
  return { el, destroy() { off(); cancelAnimationFrame(raf); el.remove(); } };
}
