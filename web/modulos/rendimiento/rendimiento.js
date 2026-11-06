/**
 * rendimiento.js · Modo rendimiento adaptable para La Malkevnia
 *
 * Módulo ES autocontenido. No importa Three.js: trabaja sobre el renderer,
 * la escena y (opcional) el composer que le pases. Probado con three 0.160.0
 * (la versión de la nave); sólo usa API estable desde r150.
 *
 *   import * as R from './rendimiento.js';
 *   const renderer = new THREE.WebGLRenderer({ canvas, ...R.opcionesRenderer() });
 *   R.applyPreset(renderer, scene, 'auto', { composer, bloom });
 *   R.autoTune(renderer, 60);
 *   R.panel(document.querySelector('#ajustes'));
 *   // en el bucle: R.render(renderer, scene, camera, composer);
 *
 * Ver README.md para el detalle de la API.
 */

export const NIVELES = ['bajo', 'medio', 'alto', 'ultra'];

/**
 * Presets. Se pueden retocar antes de llamar a applyPreset
 * (por ejemplo R.PRESETS.ultra.tamSombra = 2048).
 * tamSombra es el lado del mapa de sombra de una luz direccional; las focales
 * usan la mitad y las puntuales un cuarto por cara (renderizan 6 caras).
 */
export const PRESETS = {
  bajo:  { nombre: 'bajo',  pixelRatioMax: 0.75, escalaMin: 0.5,  sombras: false, tamSombra: 512,  tipoSombra: 'basic', postproceso: false, particulas: 0.25, detalle: 0, anisotropia: 1,  antialias: false },
  medio: { nombre: 'medio', pixelRatioMax: 1.0,  escalaMin: 0.6,  sombras: true,  tamSombra: 1024, tipoSombra: 'pcf',   postproceso: false, particulas: 0.5,  detalle: 1, anisotropia: 2,  antialias: true },
  alto:  { nombre: 'alto',  pixelRatioMax: 1.5,  escalaMin: 0.65, sombras: true,  tamSombra: 2048, tipoSombra: 'soft',  postproceso: true,  particulas: 0.8,  detalle: 2, anisotropia: 4,  antialias: true },
  ultra: { nombre: 'ultra', pixelRatioMax: 2.0,  escalaMin: 0.75, sombras: true,  tamSombra: 4096, tipoSombra: 'soft',  postproceso: true,  particulas: 1.0,  detalle: 3, anisotropia: 16, antialias: true },
};

// Constantes de three (BasicShadowMap, PCFShadowMap, PCFSoftShadowMap); así no hace falta importarlo.
const SHADOW = { basic: 0, pcf: 1, soft: 2 };
const CLAVE_LS = 'malkevnia.rendimiento.v1';
const ESCALA_MIN_MANUAL = 0.35;
const OBJETIVOS = [30, 60, 90, 120, 144];
const HZ_COMUNES = [50, 60, 72, 75, 90, 100, 120, 144, 165, 180, 240];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pct = (e) => `${Math.round(e * 100)} %`;
const dpr = () => (typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1);
const fpsValido = (n) => { n = Number(n); return n >= 15 && n <= 360 ? Math.round(n) : null; };

/* ------------------------------------------------------------------ */
/* Estado compartido: un renderer activo a la vez                       */
/* ------------------------------------------------------------------ */
const st = {
  renderer: null, scene: null, opts: {},
  ajustes: null,   // preset efectivo (preset + overrides del integrador + overrides del visitante)
  escala: 1,       // escala de resolución (1 = pixelRatioMax del preset)
  info: null,      // resultado de detect()
  tuner: null,
  oyentes: new Set(),
  usuario: cargar(), // { preset: 'auto'|nivel, overrides, fpsObjetivo, dinamica, escala }
};
if (st.usuario.dinamica === false && typeof st.usuario.escala === 'number') st.escala = st.usuario.escala;

// Lo guardado en localStorage puede venir de otra versión o estar corrupto: sólo se acepta lo conocido.
function cargar() {
  let u;
  try { u = JSON.parse(localStorage.getItem(CLAVE_LS)); } catch { return {}; }
  if (!u || typeof u !== 'object' || Array.isArray(u)) return {};
  const out = {};
  if (u.preset === 'auto' || NIVELES.includes(u.preset)) out.preset = u.preset;
  if (fpsValido(u.fpsObjetivo)) out.fpsObjetivo = fpsValido(u.fpsObjetivo);
  if (typeof u.dinamica === 'boolean') out.dinamica = u.dinamica;
  if (typeof u.escala === 'number' && u.escala >= ESCALA_MIN_MANUAL && u.escala <= 1) out.escala = u.escala;
  out.overrides = sanearOverrides(u.overrides);
  return out;
}
function sanearOverrides(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  if (typeof o.sombras === 'boolean') out.sombras = o.sombras;
  if (typeof o.postproceso === 'boolean') out.postproceso = o.postproceso;
  if (typeof o.particulas === 'number' && o.particulas >= 0.05 && o.particulas <= 1) out.particulas = o.particulas;
  return out;
}
function guardar() {
  try { localStorage.setItem(CLAVE_LS, JSON.stringify(st.usuario)); } catch { /* sin almacenamiento: sigue funcionando */ }
}
function emitir(tipo, extra = {}) {
  const ev = { tipo, ajustes: st.ajustes, escala: st.escala, ...extra };
  for (const fn of [...st.oyentes]) { try { fn(ev); } catch (e) { console.error('[rendimiento]', e); } }
}

/** Suscribirse a cambios ('preset' | 'escala' | 'decision' | 'objetivo'). Devuelve la función para darse de baja. */
export function onChange(fn) { st.oyentes.add(fn); return () => st.oyentes.delete(fn); }
/** Ajustes efectivos ahora mismo (o null antes del primer applyPreset). */
export function ajustes() { return st.ajustes; }
/** Escala dinámica de resolución actual (0,35–1). */
export function escala() { return st.escala; }
/** Copia de las preferencias guardadas del visitante. */
export function preferencias() { return { ...st.usuario, overrides: { ...(st.usuario.overrides || {}) } }; }

/* ------------------------------------------------------------------ */
/* detect()                                                            */
/* ------------------------------------------------------------------ */
/**
 * Detecta GPU y dispositivo y recomienda un preset.
 * @param {WebGLRenderer} [renderer] si no se pasa, abre un contexto temporal y lo libera.
 */
export function detect(renderer) {
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const ua = nav.userAgent || '';
  const out = {
    gpu: 'desconocida', fabricante: 'desconocido', webgl2: false, maxTextura: 0,
    movil: /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (nav.maxTouchPoints > 1 && /Macintosh/.test(ua)),
    nucleos: nav.hardwareConcurrency || 4, memoriaGB: nav.deviceMemory || null, dpr: dpr(),
    software: false, tier: 1, recomendado: 'medio', motivo: '',
  };
  let gl = null, temporal = null;
  try { gl = renderer?.getContext?.() || null; } catch { gl = null; }
  if (!gl && typeof document !== 'undefined') {
    temporal = document.createElement('canvas');
    try { gl = temporal.getContext('webgl2') || temporal.getContext('webgl'); } catch { gl = null; }
  }
  if (!gl) {
    Object.assign(out, { tier: 0, recomendado: 'bajo', motivo: 'Sin WebGL' });
    st.info = out;
    return out;
  }
  try {
    out.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    out.maxTextura = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    let nombre = String(gl.getParameter(gl.RENDERER) || '');
    let fab = String(gl.getParameter(gl.VENDOR) || '');
    // Chrome y Safari dan un nombre genérico en RENDERER; Firefox ya da el real (y avisa si se usa la extensión).
    if (esGenerico(nombre)) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        nombre = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || nombre);
        fab = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || fab);
      }
    }
    out.gpu = limpiarGPU(nombre);
    out.fabricante = fab || out.fabricante;
  } catch { /* algunos navegadores bloquean getParameter: nos quedamos con 'desconocida' */ }
  finally { if (temporal) gl.getExtension('WEBGL_lose_context')?.loseContext(); }

  const [tier, motivo] = clasificar(out.gpu.toLowerCase(), out);
  out.tier = tier; out.motivo = motivo;
  out.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(out.gpu);
  out.recomendado = NIVELES[tier];
  st.info = out;
  return out;
}

function esGenerico(n) { return !n || /^(webkit webgl|webkit|mozilla|generic renderer|desconocida)$/i.test(n.trim()); }

// "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060"
function limpiarGPU(g) {
  g = String(g || '').trim().replace(/,\s*or similar$/i, '');
  const m = g.match(/^ANGLE \((.*)\)$/);
  if (m) {
    const partes = []; let prof = 0, cur = '';
    for (const ch of m[1]) {
      if (ch === '(') prof++;
      if (ch === ')') prof--;
      if (ch === ',' && prof === 0) { partes.push(cur.trim()); cur = ''; } else cur += ch;
    }
    partes.push(cur.trim());
    g = partes[1] || partes[0];
  }
  if (/swiftshader/i.test(g)) return 'SwiftShader (render por software)';
  g = g.replace(/^ANGLE Metal Renderer:\s*/i, '')
    .replace(/\((?:TM|R|C)\)/gi, '')
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s*\([^()]*,[^()]*\)\s*$/, '')                       // "(navi21, LLVM 15, DRM 3.49)"
    .replace(/\s*(?:Direct3D\S*|vs_\d\S*|ps_\d\S*|OpenGL Engine|\/PCIe|\/SSE2).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return g || 'desconocida';
}

/** Devuelve [tier 0..3, motivo]. Es una primera estimación: autoTune la corrige con los fps reales. */
function clasificar(g, d) {
  if (esGenerico(g)) return [d.movil ? 0 : 1, 'El navegador oculta la GPU'];
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(g)) return [0, 'Render por software'];

  let tier = 1, motivo = 'GPU no reconocida';
  const portatil = /laptop|max-q|\bmobile\b|\d{3,4}m\b/.test(g);
  let m;
  if (/apple gpu/.test(g)) { tier = d.movil ? 1 : 2; motivo = d.movil ? 'iPhone o iPad' : 'Mac (Safari no dice el modelo)'; }
  else if (/apple m\d+ (pro|max|ultra)/.test(g)) { tier = 3; motivo = 'Apple Silicon de gama alta'; }
  else if (/apple m\d+/.test(g)) { tier = 2; motivo = 'Apple Silicon'; }
  else if ((m = g.match(/rtx\s*(\d{4})/))) {
    const n = +m[1], gen = Math.floor(n / 100), gama = n % 100;
    tier = (gen >= 40 && gama >= 60) || (gen === 30 && gama >= 70) ? 3 : 2;
    motivo = tier === 3 ? 'GPU dedicada de gama alta' : 'GPU dedicada';
  }
  else if (/rtx\s*a\d{3,4}|quadro|nvidia t\d{3,4}|radeon pro|arc\s*(a|b)\d{3}/.test(g)) { tier = 2; motivo = 'GPU dedicada'; }
  else if ((m = g.match(/gtx\s*(\d{3,4})/))) { const n = +m[1]; tier = n >= 1060 ? 2 : 1; motivo = 'GPU dedicada antigua'; }
  else if (/\bmx\s*\d{3}/.test(g)) { tier = 1; motivo = 'GPU dedicada básica de portátil'; }
  else if ((m = g.match(/\brx\s*(\d{3,4})/))) {
    const n = +m[1];
    if (n >= 9000) tier = n % 100 >= 70 ? 3 : 2;
    else if (n >= 6000) { const c = Math.floor((n % 1000) / 100); tier = c >= 7 ? 3 : c >= 6 ? 2 : 1; }
    else if (n >= 5000) tier = Math.floor((n % 1000) / 100) >= 6 ? 2 : 1;
    else tier = n >= 570 ? 2 : 1;
    motivo = tier === 3 ? 'GPU dedicada de gama alta' : tier === 2 ? 'GPU dedicada' : 'GPU dedicada básica';
  }
  else if (/radeon (rx )?vega (56|64)|radeon vii/.test(g)) { tier = 2; motivo = 'GPU dedicada'; }
  else if (/radeon|\b[6-8]\d0m\b/.test(g)) { tier = 1; motivo = 'Gráfica integrada AMD'; }
  else if (/intel/.test(g) && /hd graphics\s*[2-5]\d{3}\b/.test(g)) { tier = 0; motivo = 'Gráfica integrada antigua'; }
  else if (/iris xe|arc graphics|iris plus|uhd|hd graphics|iris|intel/.test(g)) { tier = 1; motivo = 'Gráfica integrada Intel'; }
  else if ((m = g.match(/adreno\D*(\d{3})/))) { tier = +m[1] >= 640 ? 1 : 0; motivo = tier ? 'Móvil de gama alta' : 'Móvil'; }
  else if ((m = g.match(/(?:mali|immortalis)-g(\d{2,3})/))) { const n = +m[1]; tier = (n >= 76 && n < 100) || n >= 610 ? 1 : 0; motivo = tier ? 'Móvil de gama alta' : 'Móvil'; }
  else if (/xclipse/.test(g)) { tier = 1; motivo = 'Móvil de gama alta'; }
  else if (/mali|adreno|powervr|apple a\d/.test(g)) { tier = 0; motivo = 'Móvil'; }

  if (portatil && tier === 3) { tier = 2; motivo += ' (portátil)'; }
  if (d.movil && tier > 1) { tier = 1; motivo += ' (móvil)'; }
  if (d.memoriaGB && d.memoriaGB <= 2) { tier = 0; motivo += ', poca memoria'; }
  else if (d.nucleos <= 2 && tier > 1) { tier = 1; motivo += ', pocos núcleos'; }
  if (d.webgl2 === false && tier > 1) { tier = 1; motivo += ', sin WebGL 2'; }
  return [tier, motivo];
}

/**
 * Opciones para el constructor de WebGLRenderer según el preset que se va a usar.
 * El antialias del lienzo no se puede cambiar después de crearlo.
 */
export function opcionesRenderer() {
  const nivel = NIVELES.includes(st.usuario.preset) ? st.usuario.preset : (st.info || detect()).recomendado;
  return { antialias: PRESETS[nivel].antialias, powerPreference: 'high-performance' };
}

/* ------------------------------------------------------------------ */
/* applyPreset()                                                       */
/* ------------------------------------------------------------------ */
function resolverNombre(preset) {
  if (preset === 'auto') {
    if (NIVELES.includes(st.usuario.preset)) return st.usuario.preset;            // elección fija del visitante
    if (st.ajustes && NIVELES.includes(st.ajustes.nombre)) return st.ajustes.nombre; // ya ajustado en esta visita
    return (st.info || detect(st.renderer)).recomendado;
  }
  if (PRESETS[preset]) return preset;
  console.warn(`[rendimiento] preset desconocido "${preset}"; uso "medio"`);
  return 'medio';
}
function componer(preset) {
  const base = preset && typeof preset === 'object'
    ? { ...PRESETS.medio, nombre: 'medio', ...preset }
    : { ...PRESETS[resolverNombre(preset)] };
  return { ...base, ...(st.opts.overrides || {}), ...(st.usuario.overrides || {}) };
}

/**
 * Aplica un preset al renderer y a la escena.
 * @param {WebGLRenderer} renderer  null para reutilizar el último
 * @param {Scene} scene             null para reutilizar la última
 * @param {'auto'|'bajo'|'medio'|'alto'|'ultra'|object} [preset='auto']
 *        'auto': la elección fija del visitante; si no hay, el nivel al que ya se ajustó; si no, el recomendado.
 * @param {object} [opts] { composer, bloom (pase o array), overrides (se recuerdan) }
 * @returns {object|null} ajustes efectivos
 */
export function applyPreset(renderer, scene, preset = 'auto', opts = {}) {
  if (renderer && renderer !== st.renderer) {
    // otro renderer (p. ej. el universo a pantalla completa): no arrastrar el composer ni la escena del anterior
    st.renderer = renderer; st.opts = {}; st.scene = null;
  }
  if (scene) st.scene = scene;
  renderer = st.renderer; scene = st.scene;
  if (!renderer) { console.warn('[rendimiento] applyPreset necesita un WebGLRenderer'); return null; }
  st.opts = { ...st.opts, ...(opts || {}) };
  vigilarDPR();

  const prev = st.ajustes;
  const a = componer(preset);
  st.ajustes = a;

  aplicarResolucion();

  // Sombras: activar, desactivar o cambiar de tipo obliga a recompilar los materiales
  const tipo = SHADOW[a.tipoSombra] ?? SHADOW.pcf;
  const sm = renderer.shadowMap;
  const recompilar = sm.enabled !== a.sombras || (a.sombras && sm.type !== tipo);
  sm.enabled = a.sombras;
  sm.type = tipo;
  sm.needsUpdate = true;

  const maxTex = renderer.capabilities?.maxTextureSize || 4096;
  const aniso = Math.max(1, Math.min(a.anisotropia, renderer.capabilities?.getMaxAnisotropy?.() || 1));
  const materiales = new Set();

  scene?.traverse((o) => {
    const ud = o.userData?.rendimiento;
    if (ud?.ignorar) return;

    if (o.isLight && o.shadow) {
      const factor = ud?.sombraFactor ?? (o.isPointLight ? 0.25 : o.isSpotLight ? 0.5 : 1);
      const limite = o.isPointLight ? maxTex / 4 : maxTex; // la puntual usa un atlas de 4×2 caras
      const lado = clamp(2 ** Math.floor(Math.log2(Math.max(1, a.tamSombra * factor))), 128, limite);
      if (o.shadow.mapSize.x !== lado || o.shadow.mapSize.y !== lado) { o.shadow.mapSize.set(lado, lado); liberarSombra(o.shadow); }
      else if (!a.sombras) liberarSombra(o.shadow); // devuelve la memoria de vídeo
    }

    if (ud?.particulas) {
      const g = o.geometry;
      const total = ud.total ?? (o.isInstancedMesh ? o.instanceMatrix.count : (g?.index?.count ?? g?.attributes?.position?.count ?? 0));
      const n = Math.max(1, Math.floor(total * a.particulas));
      if (o.isInstancedMesh) o.count = n;
      else g?.setDrawRange(0, n);
    }

    if (ud?.detalleMin !== undefined) {
      const min = typeof ud.detalleMin === 'string' ? NIVELES.indexOf(ud.detalleMin) : Number(ud.detalleMin);
      const mostrar = !(min >= 0) || a.detalle >= min;
      // sólo se vuelve a mostrar lo que ocultó este módulo: respeta la visibilidad que gestione la app
      if (!mostrar && o.visible) { o.visible = false; ud._ocultoPorRendimiento = true; }
      else if (mostrar && ud._ocultoPorRendimiento) { o.visible = true; ud._ocultoPorRendimiento = false; }
    }

    if (o.material) for (const m of [].concat(o.material)) if (m) materiales.add(m);
  });

  for (const m of materiales) {
    for (const k in m) { const t = m[k]; if (t && t.isTexture) ajustarTextura(t, aniso); }
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) ajustarTextura(u.value, aniso);
    if (recompilar) m.needsUpdate = true;
  }

  // Postproceso: los pases de bloom se encienden y apagan; R.render() se salta el composer si está apagado
  for (const p of [].concat(st.opts.bloom || [])) if (p) p.enabled = a.postproceso;

  // Con composer, el antialias del lienzo se pierde: se pide MSAA a sus render targets (WebGL 2)
  const c = st.opts.composer;
  if (c && renderer.capabilities?.isWebGL2 !== false && renderer.extensions?.has?.('EXT_color_buffer_float')) {
    const muestras = a.antialias ? 4 : 0; // si R.render() se salta el composer, no llega a reservar memoria
    for (const rt of [c.renderTarget1, c.renderTarget2]) {
      if (rt && (rt.samples || 0) !== muestras) { rt.samples = muestras; rt.dispose(); }
    }
  }

  emitir('preset', { anterior: prev });
  return a;
}

function liberarSombra(sombra) { if (sombra.map) { sombra.map.dispose(); sombra.map = null; } }

function ajustarTextura(t, aniso) {
  if (t.isRenderTargetTexture || t.isCubeTexture || t.anisotropy === aniso) return;
  const conMipmaps = t.generateMipmaps !== false || (t.mipmaps && t.mipmaps.length > 1);
  if (!conMipmaps) return; // sin mipmaps la anisotropía no hace nada: no merece la pena volver a subirla
  t.anisotropy = aniso;
  if (t.image) t.needsUpdate = true;
}

function pixelRatioPara(a, e) {
  return Math.round(Math.max(ESCALA_MIN_MANUAL, Math.min(dpr(), a.pixelRatioMax) * e) * 100) / 100;
}

function aplicarResolucion() {
  const r = st.renderer, a = st.ajustes;
  if (!r || !a || r.xr?.isPresenting) return; // en VR manda el framebuffer de la sesión XR
  const pr = pixelRatioPara(a, st.escala);
  if (Math.abs(r.getPixelRatio() - pr) < 0.01) return;
  r.setPixelRatio(pr);
  const c = st.opts.composer;
  if (c?.setPixelRatio) c.setPixelRatio(pr);
  else if (c?.setSize && r.domElement) c.setSize(r.domElement.clientWidth || r.domElement.width / pr, r.domElement.clientHeight || r.domElement.height / pr);
}

// Si la ventana pasa a otra pantalla (o cambia el zoom), devicePixelRatio cambia: se recalcula.
let dprVigilado = 0;
function vigilarDPR() {
  if (typeof matchMedia !== 'function' || dprVigilado === dpr()) return;
  dprVigilado = dpr();
  try {
    matchMedia(`(resolution: ${dprVigilado}dppx)`).addEventListener('change', () => {
      dprVigilado = 0; aplicarResolucion(); vigilarDPR(); emitir('escala');
    }, { once: true });
  } catch { /* navegadores antiguos */ }
}

function fijarEscala(v, min) {
  st.escala = Math.round(clamp(v, min, 1) * 100) / 100;
  aplicarResolucion();
  emitir('escala');
}

/** Fija la escala de resolución a mano (0,35–1). Con la resolución dinámica activa, autoTune la seguirá moviendo. */
export function setEscala(v) { fijarEscala(Number(v) || 1, ESCALA_MIN_MANUAL); }

/** Renderiza con el composer si el postproceso está activo; si no, directo (más barato). */
export function render(renderer, scene, camera, composer) {
  if (composer && st.ajustes?.postproceso !== false) composer.render();
  else renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* autoTune()                                                          */
/* ------------------------------------------------------------------ */
/**
 * Mide el tiempo entre frames con su propio requestAnimationFrame y ajusta:
 *  1) la escala de resolución (rápido, sin recompilar nada),
 *  2) si con la resolución al mínimo sigue lento, baja un preset (sólo en Auto),
 *  3) con margen sostenido sube la resolución y, después, el preset (sin pasar del techo).
 * Sólo cuenta los frames en los que la app ha renderizado de verdad (renderer.info.render.frame),
 * así que una escena en pausa no se toma como "va sobrado".
 * Si sube a un nivel que luego no aguanta, ese nivel queda bloqueado 30 s, luego 60 s, 120 s…
 * y tras tres fallos, hasta recargar la página.
 *
 * @param {WebGLRenderer} renderer
 * @param {number} [fpsObjetivo=60]  el que el visitante elija en el panel tiene prioridad
 * @param {object} [opts] { cambiarPreset=true, techo:'ultra', suelo:'bajo', onDecision(texto, tipo) }
 * @returns controlador { fps, ms, hz, historial, objetivo, objetivoEfectivo, activo, pausado,
 *                        setObjetivo(n), pausar(b), reiniciar(), stop() }
 */
export function autoTune(renderer, fpsObjetivo = 60, opts = {}) {
  if (renderer && renderer !== st.renderer) applyPreset(renderer, null, 'auto');
  else if (!st.ajustes && st.renderer) applyPreset(st.renderer, st.scene, 'auto');
  if (!st.renderer) { console.warn('[rendimiento] autoTune necesita un WebGLRenderer'); return null; }
  st.tuner?.stop();
  if (!st.usuario.preset) st.usuario.preset = 'auto';

  const cfg = { cambiarPreset: true, techo: 'ultra', suelo: 'bajo', ...opts };
  const iSuelo = Math.max(0, NIVELES.indexOf(cfg.suelo));
  const iTecho = NIVELES.indexOf(cfg.techo) >= 0 ? NIVELES.indexOf(cfg.techo) : NIVELES.length - 1;
  const ahora = () => performance.now() / 1000;

  let raf = 0, ultimoRender = 0, ultimoFrame, rendererVisto = null;
  let vis = [], visSuma = 0;   // ventana de ~1 s para mostrar fps
  let ven = [], venSuma = 0;   // ventana de decisiones: se vacía tras cada cambio
  let tLento = 0, tHolgado = 0, tEnMin = 0, enfriamiento = 1, tHz = 0;
  let esperaEscala = 2.5, ultimaSubidaEscala = -Infinity, ultimoRebote = -Infinity;
  let bloqueos = {};           // índice de nivel -> { hasta, espera, fallos }

  const vaciar = () => { ven = []; venSuma = 0; tLento = 0; tHolgado = 0; tEnMin = 0; };

  const ctl = {
    fps: 0, ms: 0, hz: null, historial: [],
    objetivo: st.usuario.fpsObjetivo || fpsValido(fpsObjetivo) || 60,
    activo: st.usuario.dinamica !== false,
    pausado: false,
    /** Objetivo real: nunca por encima de la frecuencia de la pantalla, si se ha podido medir. */
    get objetivoEfectivo() { return ctl.hz ? Math.min(ctl.objetivo, ctl.hz) : ctl.objetivo; },
    setObjetivo(n) {
      const v = fpsValido(n); if (!v) return;
      ctl.objetivo = v; st.usuario.fpsObjetivo = v; guardar();
      ctl.reiniciar(); emitir('objetivo');
    },
    pausar(b = true) { ctl.pausado = !!b; vaciar(); },
    /** Olvida bloqueos y esperas (útil al cambiar de escena o de sala pesada). */
    reiniciar() { bloqueos = {}; esperaEscala = 2.5; vaciar(); enfriamiento = 0.5; },
    stop() { cancelAnimationFrame(raf); if (st.tuner === ctl) st.tuner = null; },
  };
  st.tuner = ctl;

  const decidir = (texto, tipo) => {
    try { cfg.onDecision?.(texto, tipo); } catch (e) { console.error('[rendimiento]', e); }
    emitir('decision', { texto, decision: tipo });
  };

  function cambiarNivel(nuevo) {
    // conserva los píxeles reales para que el cambio de calidad no dé un salto de resolución
    if (ctl.activo) {
      const prAntes = st.renderer.getPixelRatio();
      const a2 = componer(nuevo);
      st.escala = Math.round(clamp(prAntes / Math.min(dpr(), a2.pixelRatioMax), a2.escalaMin, 1) * 100) / 100;
    }
    applyPreset(st.renderer, st.scene, nuevo);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const r = st.renderer;
    if (r !== rendererVisto) { rendererVisto = r; ultimoFrame = r?.info?.render?.frame; ultimoRender = now; vaciar(); return; }
    const f = r?.info?.render?.frame;
    if (f !== undefined && f === ultimoFrame) return; // la app no ha pintado este frame
    ultimoFrame = f;
    const dt = now - ultimoRender; ultimoRender = now;
    if (dt <= 0 || dt > 1000 || document.hidden || r?.xr?.isPresenting) return;

    vis.push(dt); visSuma += dt;
    while (visSuma > 1000 && vis.length > 2) visSuma -= vis.shift();
    ctl.ms = visSuma / vis.length; ctl.fps = 1000 / ctl.ms;
    ctl.historial.push(dt); if (ctl.historial.length > 240) ctl.historial.shift();
    if ((tHz += dt) > 500) { tHz = 0; ctl.hz = estimarHz(ctl.historial); }

    if (enfriamiento > 0) { enfriamiento -= dt / 1000; return; } // recompilaciones y realojos tras un cambio
    ven.push(dt); venSuma += dt;
    while (venSuma > 1000 && ven.length > 8) venSuma -= ven.shift();
    const a = st.ajustes;
    if (!a || ctl.pausado || venSuma < 500 || ven.length < 5) return;

    const obj = ctl.objetivoEfectivo, presupuesto = 1000 / obj, media = mediaRecortada(ven), s = dt / 1000;
    if (media > presupuesto * 1.12) { tLento += s; tHolgado = 0; }
    else if (media <= presupuesto * 1.04) { tHolgado += s; tLento = Math.max(0, tLento - s); }
    else { tLento = Math.max(0, tLento - s / 2); tHolgado = Math.max(0, tHolgado - s); }

    const auto = cfg.cambiarPreset && st.usuario.preset === 'auto';
    const idx = NIVELES.indexOf(a.nombre);
    const enMin = !ctl.activo || st.escala <= a.escalaMin + 0.005;
    tEnMin = enMin && tLento > 0 ? tEnMin + s : 0;
    const t = ahora();
    const fpsTxt = `${Math.round(1000 / media)} de ${Math.round(obj)} fps`;

    if (ctl.activo && !enMin && tLento > 0.5) {
      const antes = st.escala;
      fijarEscala(antes * clamp(Math.sqrt(presupuesto / media), 0.75, 0.95), a.escalaMin); // coste ∝ píxeles ∝ escala²
      if (t - ultimaSubidaEscala < 4) { esperaEscala = Math.min(esperaEscala * 2, 40); ultimoRebote = t; }
      decidir(`Resolución ${pct(antes)} → ${pct(st.escala)} · ${fpsTxt}`, 'baja-escala');
      vaciar(); enfriamiento = 0.3;
    } else if (auto && enMin && tEnMin > 1.2 && idx > iSuelo) {
      const nuevo = NIVELES[idx - 1];
      const b = bloqueos[idx] || { espera: 30, fallos: 0 };
      const fallos = b.fallos + 1;
      bloqueos[idx] = { hasta: fallos >= 3 ? Infinity : t + b.espera, espera: Math.min(b.espera * 2, 300), fallos };
      cambiarNivel(nuevo);
      decidir(`Calidad ${a.nombre} → ${nuevo} · ${fpsTxt}`, 'baja-preset');
      vaciar(); enfriamiento = 1.5;
    } else if (ctl.activo && st.escala < 1 && tHolgado > esperaEscala) {
      const antes = st.escala;
      fijarEscala(Math.max(antes * 1.1, antes + 0.05), a.escalaMin);
      ultimaSubidaEscala = t;
      decidir(`Resolución ${pct(antes)} → ${pct(st.escala)} · hay margen`, 'sube-escala');
      vaciar(); enfriamiento = 0.3;
    } else if (auto && (st.escala >= 1 || !ctl.activo) && tHolgado > 6 && idx >= 0 && idx < iTecho && !(bloqueos[idx + 1]?.hasta > t)) {
      const nuevo = NIVELES[idx + 1];
      cambiarNivel(nuevo);
      decidir(`Calidad ${a.nombre} → ${nuevo} · estable a ${Math.round(obj)} fps`, 'sube-preset');
      vaciar(); enfriamiento = 1.5;
    }
    // si la resolución deja de rebotar, la espera para subirla vuelve poco a poco a lo normal
    if (esperaEscala > 2.5 && t - ultimoRebote > 30) { esperaEscala = Math.max(2.5, esperaEscala / 2); ultimoRebote = t; }
  }

  raf = requestAnimationFrame(tick);
  return ctl;
}

// Media sin el 10 % de frames más lentos: un tirón suelto (GC, carga de textura) no cambia la calidad.
function mediaRecortada(v) {
  const o = [...v].sort((x, y) => x - y);
  const n = o.length - Math.floor(o.length * 0.1);
  let s = 0; for (let i = 0; i < n; i++) s += o[i];
  return s / n;
}

// Frecuencia de la pantalla a partir de los frames más rápidos; null si no encaja con ninguna habitual.
function estimarHz(h) {
  if (h.length < 30) return null;
  const o = [...h].sort((x, y) => x - y);
  const hz = 1000 / o[Math.floor(o.length * 0.1)];
  let mejor = null, err = Infinity;
  for (const c of HZ_COMUNES) { const e = Math.abs(hz - c) / c; if (e < err) { err = e; mejor = c; } }
  return err < 0.045 ? mejor : null;
}

/* ------------------------------------------------------------------ */
/* panel()                                                             */
/* ------------------------------------------------------------------ */
const CSS = `
.mk-rend{--mk-bg:rgba(16,11,34,.88);--mk-fg:#e9e2ff;--mk-dim:#a99fd0;--mk-acc:#b59bff;--mk-line:rgba(181,155,255,.24);
  font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--mk-fg);background:var(--mk-bg);border:1px solid var(--mk-line);border-radius:14px;
  padding:14px 16px;width:min(300px,100%);box-sizing:border-box;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:grid;gap:12px;color-scheme:dark}
.mk-rend *{box-sizing:border-box}
.mk-rend .mk-tit{margin:0;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--mk-acc);display:flex;justify-content:space-between;align-items:baseline}
.mk-rend .mk-tit b{font:600 18px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0;color:var(--mk-fg);font-variant-numeric:tabular-nums}
.mk-rend .mk-fila{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:24px}
.mk-rend .mk-seg{display:grid;grid-template-columns:1.6fr repeat(4,1fr);border:1px solid var(--mk-line);border-radius:9px;overflow:hidden}
.mk-rend .mk-seg button{all:unset;cursor:pointer;text-align:center;padding:7px 2px;font-size:11px;color:var(--mk-dim);white-space:nowrap}
.mk-rend .mk-seg button:hover{color:var(--mk-fg)}
.mk-rend .mk-seg button[aria-pressed=true]{background:var(--mk-acc);color:#140c2b;font-weight:600}
.mk-rend button:focus-visible,.mk-rend input:focus-visible,.mk-rend select:focus-visible{outline:2px solid var(--mk-acc);outline-offset:2px}
.mk-rend label{color:var(--mk-dim)}
.mk-rend label span{color:var(--mk-fg);font-variant-numeric:tabular-nums}
.mk-rend input[type=range]{width:120px;accent-color:var(--mk-acc);margin:0}
.mk-rend input[type=checkbox]{accent-color:var(--mk-acc);width:16px;height:16px;margin:0}
.mk-rend select{background:transparent;color:var(--mk-fg);border:1px solid var(--mk-line);border-radius:6px;padding:2px 4px;font:inherit}
.mk-rend select option{background:#160f2e;color:#e9e2ff}
.mk-rend .mk-gpu{font-size:11px;color:var(--mk-dim);border-top:1px solid var(--mk-line);padding-top:10px;overflow-wrap:anywhere}
.mk-rend .mk-reset{all:unset;cursor:pointer;font-size:11px;color:var(--mk-acc);justify-self:start}
.mk-rend .mk-reset:hover{text-decoration:underline}
`;
let panelesCreados = 0;

/**
 * Pinta un panel de ajustes en español dentro de `container`.
 * Usa el renderer y la escena que ya conozca el módulo, o los de opts { renderer, scene }.
 * @returns {{ el: HTMLElement, destroy(): void }}
 */
export function panel(container, opts = {}) {
  if (!container) { console.warn('[rendimiento] panel necesita un contenedor'); return null; }
  if (opts.renderer && opts.renderer !== st.renderer) applyPreset(opts.renderer, opts.scene || null, 'auto');
  else if (opts.scene) st.scene = opts.scene;
  if (!document.getElementById('mk-rend-css')) {
    const s = document.createElement('style'); s.id = 'mk-rend-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  const id = (n) => `mk-${n}-${panelesCreados}`;
  panelesCreados++;
  const el = document.createElement('section');
  el.className = 'mk-rend'; el.setAttribute('aria-label', 'Ajustes de rendimiento');
  el.innerHTML = `
    <p class="mk-tit">Rendimiento <b data-k="fps">-- fps</b></p>
    <div class="mk-seg" role="group" aria-label="Calidad">
      ${['auto', ...NIVELES].map((n) => `<button type="button" data-p="${n}" aria-pressed="false">${n === 'auto' ? 'Auto' : n[0].toUpperCase() + n.slice(1)}</button>`).join('')}
    </div>
    <div class="mk-fila"><label for="${id('din')}">Resolución dinámica</label><input id="${id('din')}" type="checkbox"></div>
    <div class="mk-fila"><label for="${id('esc')}">Resolución <span data-k="esc"></span></label><input id="${id('esc')}" type="range" min="${ESCALA_MIN_MANUAL * 100}" max="100" step="1"></div>
    <div class="mk-fila"><label for="${id('obj')}">FPS objetivo</label><select id="${id('obj')}"></select></div>
    <div class="mk-fila"><label for="${id('som')}">Sombras</label><input id="${id('som')}" type="checkbox"></div>
    <div class="mk-fila"><label for="${id('post')}">Postprocesado (bloom)</label><input id="${id('post')}" type="checkbox"></div>
    <div class="mk-fila"><label for="${id('part')}">Partículas <span data-k="part"></span></label><input id="${id('part')}" type="range" min="5" max="100" step="5"></div>
    <button type="button" class="mk-reset">Restablecer valores del preset</button>
    <div class="mk-gpu" data-k="gpu"></div>`;
  container.appendChild(el);
  const q = (n) => el.querySelector(`#${id(n)}`);
  const k = (n) => el.querySelector(`[data-k="${n}"]`);
  const objetivo = () => st.tuner?.objetivo || st.usuario.fpsObjetivo || 60;

  const reaplicar = () => applyPreset(st.renderer, st.scene, st.usuario.preset === 'auto' || !st.usuario.preset ? 'auto' : st.usuario.preset);
  const override = (clave, valor) => {
    st.usuario.overrides = { ...(st.usuario.overrides || {}), [clave]: valor };
    guardar(); reaplicar();
  };

  el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.p;
    st.usuario.preset = p; st.usuario.overrides = {}; guardar();
    if (st.usuario.dinamica !== false) st.escala = 1;
    // "Auto" vuelve a empezar desde lo recomendado para esta GPU
    applyPreset(st.renderer, st.scene, p === 'auto' ? (st.info || detect(st.renderer)).recomendado : p);
    st.tuner?.reiniciar();
  }));
  q('din').addEventListener('change', (e) => {
    st.usuario.dinamica = e.target.checked;
    if (e.target.checked) delete st.usuario.escala; else st.usuario.escala = st.escala;
    guardar();
    if (st.tuner) { st.tuner.activo = e.target.checked; st.tuner.reiniciar(); }
    emitir('escala');
  });
  // mover la resolución a mano desactiva la dinámica (si no, autoTune la volvería a mover)
  q('esc').addEventListener('input', (e) => {
    if (st.usuario.dinamica !== false) { st.usuario.dinamica = false; if (st.tuner) st.tuner.activo = false; }
    setEscala(Number(e.target.value) / 100);
  });
  q('esc').addEventListener('change', () => { st.usuario.escala = st.escala; guardar(); });
  q('obj').addEventListener('change', (e) => {
    const v = fpsValido(e.target.value);
    if (st.tuner) st.tuner.setObjetivo(v); else { st.usuario.fpsObjetivo = v; guardar(); }
  });
  q('som').addEventListener('change', (e) => override('sombras', e.target.checked));
  q('post').addEventListener('change', (e) => override('postproceso', e.target.checked));
  q('part').addEventListener('input', (e) => { k('part').textContent = `${e.target.value} %`; });
  q('part').addEventListener('change', (e) => override('particulas', Number(e.target.value) / 100));
  el.querySelector('.mk-reset').addEventListener('click', () => { st.usuario.overrides = {}; guardar(); reaplicar(); });

  const pintarInfo = () => {
    const i = st.info || (st.renderer ? detect(st.renderer) : null);
    if (!i) return;
    const hz = st.tuner?.hz ? ` · pantalla de ${st.tuner.hz} Hz` : '';
    k('gpu').textContent = `${i.gpu} · ${i.motivo}${hz} · recomendado: ${i.recomendado}`;
  };
  const pintar = () => {
    const a = st.ajustes; if (!a) return;
    const p = st.usuario.preset || 'auto';
    el.querySelectorAll('[data-p]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === p)));
    el.querySelector('[data-p=auto]').textContent = p === 'auto' ? `Auto · ${a.nombre}` : 'Auto';
    q('din').checked = st.usuario.dinamica !== false;
    q('esc').value = String(Math.round(st.escala * 100)); k('esc').textContent = pct(st.escala);
    q('som').checked = !!a.sombras; q('post').checked = !!a.postproceso;
    q('part').value = String(Math.round(a.particulas * 100)); k('part').textContent = pct(a.particulas);
    const sel = q('obj'), o = objetivo();
    const opciones = [...new Set([...OBJETIVOS, o])].sort((x, y) => x - y);
    if ([...sel.options].map((x) => x.value).join() !== opciones.join()) sel.innerHTML = opciones.map((v) => `<option value="${v}">${v}</option>`).join('');
    sel.value = String(o);
    pintarInfo();
  };
  const off = onChange(pintar);
  pintar();
  const reloj = setInterval(() => {
    if (st.tuner) k('fps').textContent = `${Math.round(st.tuner.fps)} fps`;
    pintarInfo();
  }, 250);
  return { el, destroy() { off(); clearInterval(reloj); el.remove(); } };
}
