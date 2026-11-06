// generador.js · Sistemas estelares procedurales de La Malkevnia (datos puros)
// La misma semilla da siempre el mismo sistema: estrellas (simples, binarias,
// triples, cuádruples), compañeras compactas, órbitas keplerianas, planetas,
// lunas, cinturones, cometas, zonas de gravedad, anomalías y civilizaciones.
//
// No crea nada en GPU. Usa planetSpec() del módulo de planetas para escoger
// semillas de planeta cuyo tipo encaje con la temperatura de su órbita.
//
//   systemSpec(seed)  -> sistema completo (ver README.md, sección "Esquema")
//   STAR_CLASSES      -> catálogo de clases estelares
//   keplerPosition(orbita, tDias, out) -> posición relativa en unidades de escena

import * as PL from '../planetas-procedurales/planetas.js';
const { planetSpec, normalizeSeed } = PL;

// ¿El módulo de planetas acepta opciones forzadas (v2: tipo, temperatura, contexto…)?
const PLANETAS_V2 = typeof PL.listPlanetTypes === 'function' || !!(PL.PLANET_TYPES && PL.PLANET_TYPES.jupiter_caliente);
const tiposDisponibles = () => {
  const out = new Map();
  for (const [k, t] of Object.entries(PL.PLANET_TYPES || {})) out.set(k, t);
  if (typeof PL.listPlanetTypes === 'function') { try { for (const t of PL.listPlanetTypes()) out.set(t.id ?? t.key ?? t.clave, t); } catch (e) { /* sin lista */ } }
  return out;
};
const GASEOSOS = new Set(['gaseoso', 'jupiter_caliente', 'gigante_helado', 'mini_neptuno']);
export const esGaseoso = (tipo) => GASEOSOS.has(tipo);

/* ------------------------------------------------------------------ */
/*  Aleatoriedad determinista                                          */
/* ------------------------------------------------------------------ */

export function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed, salt = '') {
  const r = mulberry32(hashString(String(seed) + '|' + salt));
  const rng = () => r();
  rng.range = (a, b) => a + (b - a) * r();
  rng.logRange = (a, b) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * r());
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  rng.pick = (arr) => arr[Math.floor(r() * arr.length)];
  rng.chance = (p) => r() < p;
  rng.weighted = (entries) => {
    const total = entries.reduce((s, e) => s + e[1], 0);
    let x = r() * total;
    for (const [v, w] of entries) { if ((x -= w) <= 0) return v; }
    return entries[entries.length - 1][0];
  };
  rng.seed = () => Math.floor(r() * 2 ** 32).toString(36);
  return rng;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r2 = (x, d = 2) => +(+x).toFixed(d);
const sig = (x, d = 3) => (x === 0 ? 0 : +x.toPrecision(d));

/* ------------------------------------------------------------------ */
/*  Nombres                                                             */
/* ------------------------------------------------------------------ */

const ONSETS = ['k', 'v', 'th', 'z', 's', 'm', 'n', 'l', 'r', 'd', 't', 'g', 'br', 'kr', 'dr', 'x', 'y', 'f', 'h', 'qu', 'sh', 'c', 'b', 'p', 'tr', 'vr', 'ss', 'al', 'el', 'or'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'ae', 'ia', 'io', 'ei', 'au', 'y'];
const CODAS = ['', '', '', '', 'n', 'r', 's', 'l', 'th', 'x', 'm', 'nd', 'rn', 'sk', 'z'];
const GRIEGO = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Épsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Sigma', 'Tau', 'Ómicron'];

export function makeWord(rng, minSyl = 2, maxSyl = 3) {
  const n = rng.int(minSyl, maxSyl);
  let w = '';
  for (let i = 0; i < n; i++) {
    const onset = i === 0 ? (rng.chance(0.85) ? rng.pick(ONSETS) : '') : rng.pick(ONSETS);
    const coda = i === n - 1 ? rng.pick(CODAS) : (rng.chance(0.3) ? rng.pick(['n', 'r', 'l', 's']) : '');
    w += onset + rng.pick(VOWELS) + coda;
  }
  w = w.replace(/(.)\1\1+/g, '$1$1').replace(/([aeiouy])\1+/g, '$1');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function makeSystemName(rng) {
  const base = makeWord(rng, 2, 3);
  return rng.weighted([
    [base, 40], [`${rng.pick(GRIEGO)} ${base}`, 14], [`${base} ${rng.pick(['Mayor', 'Menor', 'Austral', 'Boreal'])}`, 10],
    [`Velo de ${base}`, 4], [`${base}-${makeWord(rng, 1, 1)}`, 8], [`Faro de ${base}`, 3], [`La ${base}`, 3],
  ]);
}

const PUEBLO_SUF = ['í', 'enses', 'anos', 'itas', 'eos', 'ar'];
function makePeople(rng) {
  const w = makeWord(rng, 2, 2).replace(/[aeiouy]+$/i, '');
  return `los ${w}${rng.pick(PUEBLO_SUF)}`;
}

/* ------------------------------------------------------------------ */
/*  Catálogo de estrellas                                               */
/* ------------------------------------------------------------------ */
// Rangos aproximadamente reales (masas y radios en soles, T en kelvin,
// L en luminosidades solares). Las "fantasía" llevan fantasia: true.

export const STAR_CLASSES = {
  O: { nombre: 'Estrella azul de clase O', T: [30000, 45000], M: [16, 60], R: [6.6, 14], L: [3e4, 8e5], peso: 1 },
  B: { nombre: 'Estrella azul-blanca de clase B', T: [10500, 30000], M: [2.1, 16], R: [1.8, 6.6], L: [25, 3e4], peso: 3 },
  A: { nombre: 'Estrella blanca de clase A', T: [7500, 10000], M: [1.4, 2.1], R: [1.4, 1.9], L: [5, 25], peso: 5 },
  F: { nombre: 'Estrella amarillo-blanca de clase F', T: [6000, 7500], M: [1.04, 1.4], R: [1.15, 1.4], L: [1.5, 5], peso: 8 },
  G: { nombre: 'Enana amarilla de clase G', T: [5200, 6000], M: [0.8, 1.04], R: [0.9, 1.15], L: [0.6, 1.5], peso: 11 },
  K: { nombre: 'Enana naranja de clase K', T: [3900, 5200], M: [0.45, 0.8], R: [0.7, 0.9], L: [0.08, 0.6], peso: 12 },
  M: { nombre: 'Enana roja de clase M', T: [2400, 3900], M: [0.08, 0.45], R: [0.12, 0.7], L: [0.001, 0.08], peso: 15 },
  'enana-marron': { nombre: 'Enana marrón', T: [700, 2400], M: [0.013, 0.075], R: [0.08, 0.12], L: [1e-6, 1e-4], peso: 3 },
  'gigante-roja': { nombre: 'Gigante roja', T: [3300, 4600], M: [0.8, 3], R: [15, 110], L: [100, 3000], peso: 5 },
  'supergigante-roja': { nombre: 'Supergigante roja', T: [3300, 4100], M: [10, 25], R: [300, 900], L: [3e4, 3e5], peso: 1.2 },
  'supergigante-azul': { nombre: 'Supergigante azul', T: [15000, 30000], M: [20, 45], R: [25, 70], L: [1e5, 6e5], peso: 1.2 },
  'wolf-rayet': { nombre: 'Estrella Wolf-Rayet', T: [40000, 110000], M: [10, 25], R: [1, 3], L: [1e5, 1e6], peso: 0.8 },
  'enana-blanca': { nombre: 'Enana blanca', T: [7000, 40000], M: [0.5, 1.25], R: [0.008, 0.02], L: [1e-3, 0.5], peso: 3 },
  neutrones: { nombre: 'Estrella de neutrones', T: [6e5, 1e6], M: [1.2, 2.2], R: [1.4e-5, 1.4e-5], L: [1e-4, 1e-2], peso: 0.8 },
  pulsar: { nombre: 'Púlsar', T: [6e5, 1e6], M: [1.2, 2.1], R: [1.4e-5, 1.4e-5], L: [1e-3, 1e-1], peso: 1 },
  magnetar: { nombre: 'Magnetar', T: [6e5, 1.2e6], M: [1.4, 2.2], R: [1.4e-5, 1.4e-5], L: [1e-2, 1], peso: 0.5 },
  'agujero-negro': { nombre: 'Agujero negro estelar', T: [0, 0], M: [5, 40], R: [2e-5, 1e-4], L: [0, 0], peso: 0.7 },
  protoestrella: { nombre: 'Protoestrella T Tauri', T: [3200, 5200], M: [0.5, 3], R: [2, 5], L: [1, 40], peso: 1.6 },
  'estrella-violeta': { nombre: 'Estrella violeta', T: [12000, 19000], M: [1.2, 3], R: [1.4, 3], L: [15, 150], peso: 0.9, fantasia: true },
  'estrella-quark': { nombre: 'Estrella de quarks', T: [1e6, 3e6], M: [1.6, 2.4], R: [1e-5, 1e-5], L: [1e-2, 0.5], peso: 0.35, fantasia: true },
};

const COMPACTAS = new Set(['enana-blanca', 'neutrones', 'pulsar', 'magnetar', 'agujero-negro', 'estrella-quark']);
const GIGANTES = new Set(['gigante-roja', 'supergigante-roja', 'supergigante-azul']);
export const isCompact = (c) => COMPACTAS.has(c);
export const isGiant = (c) => GIGANTES.has(c);

const DESC_ESTRELLA = {
  O: ['Un horno azul que vive deprisa: apenas unos millones de años antes de estallar.', 'Su viento estelar barre el polvo de media galaxia; mirarla de frente es mirar un soplete.'],
  B: ['Azul y orgullosa, ilumina las nebulosas cercanas como un farol en la niebla.', 'Joven y brillante; las sondas tienen que llevar doble filtro para no quemarse los ojos.'],
  A: ['Blanca, limpia, de esas que parecen recién estrenadas.', 'Gira tan rápido que se ensancha por el ecuador como una peonza.'],
  F: ['Amarillo-blanca y generosa: calienta sin agobiar.', 'Una estrella tranquila de luz cálida, buena compañera de viaje.'],
  G: ['Parecida al viejo Sol: amarilla, estable, paciente.', 'Una enana amarilla de las de toda la vida. Da gusto encontrarse una.'],
  K: ['Naranja y longeva: seguirá aquí cuando casi todo lo demás se haya apagado.', 'Su luz de atardecer permanente tiñe de cobre a sus planetas.'],
  M: ['Pequeña, roja y testaruda; vivirá billones de años entre llamaradas de mal genio.', 'Una brasa diminuta que a veces escupe fulguraciones que duplican su brillo.'],
  'enana-marron': ['Ni estrella ni planeta: una brasa magenta que nunca llegó a encenderse del todo.', 'Brilla más en infrarrojo que en luz visible; de cerca parece un gigante gaseoso que se avergüenza.'],
  'gigante-roja': ['Una estrella que ya se tragó sus planetas interiores y ahora respira despacio, hinchada y roja.', 'Su superficie hierve en celdas del tamaño de mundos enteros.'],
  'supergigante-roja': ['Si estuviera en el sitio del Sol, su piel llegaría más allá de Júpiter.', 'Un globo inmenso y frío que algún día será supernova. No hay prisa: quedan unos milenios.'],
  'supergigante-azul': ['Brilla como cien mil soles juntos. Las sombras aquí son cuchillos.', 'Un faro azul visible desde el otro lado del brazo galáctico.'],
  'wolf-rayet': ['Ha perdido su envoltura y sopla un viento furioso que dibuja burbujas de gas a su alrededor.', 'Desnuda hasta el núcleo, arde a más de cuarenta mil grados y se deshace en conchas de gas.'],
  'enana-blanca': ['El rescoldo de una estrella como el Sol: del tamaño de un planeta y del peso de una estrella.', 'Una cucharadita de su materia pesaría toneladas. Se enfría en silencio durante eones.'],
  neutrones: ['Una ciudad de diámetro con la masa de un sol. La gravedad en su superficie aplanaría montañas a milímetros.', 'Lo que queda tras una supernova: un núcleo atómico gigante, girando y caliente.'],
  pulsar: ['Gira cientos de veces por segundo y barre el espacio con dos haces, como un faro galáctico.', 'Su latido es tan regular que la Malkevnia lo usa para poner en hora su reloj.'],
  magnetar: ['Su campo magnético borraría una tarjeta de crédito a medio camino de la Luna.', 'De vez en cuando su corteza se resquebraja y suelta un destello que se ve desde otras galaxias.'],
  'agujero-negro': ['Nada sale de ahí; solo el disco que gira a su alrededor, gritando en rayos X.', 'La luz de las estrellas de detrás se dobla a su alrededor como si el espacio fuese de cristal líquido.'],
  protoestrella: ['Una estrella recién nacida, envuelta aún en el disco de polvo del que saldrán sus planetas.', 'Escupe chorros por los polos mientras engorda a costa de su disco.'],
  'estrella-violeta': ['Nadie sabe por qué brilla en violeta. Las sondas vuelven con los sensores cantando.', 'Una estrella imposible, de luz púrpura, que los cartógrafos de la Malkevnia tratan con cariño y cierto respeto.'],
  'estrella-quark': ['Más densa que una estrella de neutrones; su superficie cambia de color como el aceite en el agua.', 'Hipotética en los libros, real en este rincón: materia de quarks libres brillando en tonos de arcoíris.'],
};

/* ------------------------------------------------------------------ */
/*  Color de cuerpo negro (aprox. Tanner Helland)                      */
/* ------------------------------------------------------------------ */

export function blackbodyHex(T) {
  const t = clamp(T, 1000, 40000) / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (x) => clamp(Math.round(x), 0, 255);
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

const STAR_COLOR_OVERRIDE = {
  'enana-marron': 0xb0406a, 'estrella-violeta': 0xb47cff, 'agujero-negro': 0x000000,
  'estrella-quark': 0xd8c8ff, neutrones: 0xcfe0ff, pulsar: 0xc8dcff, magnetar: 0xd9c8ff, 'wolf-rayet': 0x9fb4ff,
};

/* ------------------------------------------------------------------ */
/*  Escala visual (unidades de escena)                                  */
/* ------------------------------------------------------------------ */
// La realidad no cabe en pantalla: los radios y distancias se comprimen de
// forma monótona (lo grande sigue siendo más grande), pero los periodos son
// keplerianos de verdad: P(años) = sqrt(a^3 / M).

export const ESCALA = { K: 11, planetaMin: 0.42 };

function starSceneRadius(clase, Rsun, rng) {
  switch (clase) {
    case 'agujero-negro': return 1.25;
    case 'neutrones': case 'pulsar': case 'magnetar': return 0.28;
    case 'estrella-quark': return 0.24;
    case 'enana-blanca': return 0.5;
    case 'enana-marron': return 1.05;
    case 'gigante-roja': return 8.5 + 4 * Math.log10(Rsun / 15 + 1) + rng.range(-0.4, 0.4);
    case 'supergigante-roja': return 15 + 3 * Math.log10(Rsun / 300 + 1);
    case 'supergigante-azul': return 9 + 2.5 * Math.log10(Rsun / 25 + 1);
    default: return 1.15 + 2.1 * Math.log10(1 + 2 * Rsun);
  }
}

export function periodDays(aUA, Msun) { return 365.25 * Math.sqrt((aUA ** 3) / Math.max(Msun, 1e-3)); }

/* ------------------------------------------------------------------ */
/*  Estrellas                                                           */
/* ------------------------------------------------------------------ */

function makeStar(rng, clase, id, sysName) {
  const C = STAR_CLASSES[clase];
  const f = rng();
  const lerp = (r) => r[0] + (r[1] - r[0]) * f;
  const llerp = (r) => (r[0] <= 0 ? 0 : Math.exp(Math.log(r[0]) + (Math.log(r[1]) - Math.log(r[0])) * f));
  const masaSol = lerp(C.M);
  const temperaturaK = Math.round(lerp(C.T) * rng.range(0.97, 1.03));
  const radioSol = llerp(C.R) * rng.range(0.92, 1.08);
  let luminosidadSol = llerp(C.L) * rng.range(0.85, 1.15);
  const color = STAR_COLOR_OVERRIDE[clase] ?? blackbodyHex(temperaturaK);
  const actividad = clase === 'M' ? rng.range(0.6, 1) : clase === 'protoestrella' ? rng.range(0.5, 0.9)
    : isCompact(clase) ? rng.range(0.2, 0.6) : rng.range(0.1, 0.55);
  const rotacionPeriodo = clase === 'pulsar' ? rng.range(0.12, 0.7) : clase === 'magnetar' ? rng.range(2, 5)
    : clase === 'neutrones' ? rng.range(0.5, 2) : rng.range(25, 70);
  const flags = {
    jets: clase === 'protoestrella',
    nebulosa: clase === 'wolf-rayet' ? 'wolf-rayet'
      : clase === 'enana-blanca' && rng.chance(0.45) ? 'planetaria'
      : (clase === 'pulsar' || clase === 'agujero-negro' || clase === 'magnetar') && rng.chance(0.3) ? 'remanente' : null,
    discoAcrecion: null,
    manchas: !isCompact(clase) && rng.chance(0.55),
  };
  const nombre = `${sysName} ${id}`;
  const star = {
    id, seed: rng.seed(), nombre, clase, claseNombre: C.nombre, fantasia: !!C.fantasia,
    masaSol: sig(masaSol), radioSol: sig(radioSol), temperaturaK, luminosidadSol: sig(luminosidadSol),
    color, actividad: r2(actividad), rotacionPeriodo: r2(rotacionPeriodo), flags,
    radio: 0, // escena; se rellena abajo
    descripcion: rng.pick(DESC_ESTRELLA[clase]),
    edadGa: r2(clase === 'protoestrella' ? rng.range(0.0005, 0.01) : ['O', 'B', 'wolf-rayet', 'supergigante-azul', 'supergigante-roja'].includes(clase) ? rng.range(0.003, 0.05)
      : isCompact(clase) ? rng.range(0.1, 11) : rng.range(0.4, 11), 3),
  };
  star.radio = r2(starSceneRadius(clase, radioSol, rng), 3);
  if (clase === 'agujero-negro') {
    star.flags.discoAcrecion = rng.chance(0.85) ? { interior: star.radio * 2.6, exterior: star.radio * rng.range(7, 11), color: 0xffb070 } : null;
    star.flags.jets = !!star.flags.discoAcrecion && rng.chance(0.55);
    star.luminosidadSol = star.flags.discoAcrecion ? sig(rng.logRange(1e3, 1e5)) : 0;
  }
  if (clase === 'protoestrella') star.flags.discoAcrecion = { interior: star.radio * 1.6, exterior: star.radio * 4.5, color: 0xff9a60 };
  return star;
}

function pickPrimaryClass(rng) {
  return rng.weighted(Object.entries(STAR_CLASSES).map(([k, c]) => [k, c.peso]));
}

/* ------------------------------------------------------------------ */
/*  Jerarquía de estrellas                                              */
/* ------------------------------------------------------------------ */
// Nodo = { tipo:'estrella', estrella } | { tipo:'par', a, b, orbita }
// Los planetas cuelgan de cualquier nodo: de una estrella (tipo S) o de un
// par (circumbinarios, tipo P).

export const ARQUITECTURAS = {
  simple: 'Estrella solitaria',
  'binaria-cercana': 'Binaria cercana',
  'binaria-amplia': 'Binaria amplia',
  'binaria-interactiva': 'Binaria interactiva (transferencia de masa)',
  'triple-jerarquica': 'Triple jerárquica',
  'cuadruple': 'Cuádruple (dos parejas)',
};

function chooseArchitecture(rng, primClass) {
  if (isGiant(primClass) && primClass !== 'gigante-roja') return rng.weighted([['simple', 6], ['binaria-amplia', 3], ['binaria-interactiva', 2]]);
  if (primClass === 'protoestrella') return rng.weighted([['simple', 7], ['binaria-amplia', 2], ['binaria-cercana', 1]]);
  if (isCompact(primClass)) return rng.weighted([['simple', 5], ['binaria-interactiva', 4], ['binaria-amplia', 2], ['triple-jerarquica', 1]]);
  return rng.weighted([['simple', 40], ['binaria-cercana', 18], ['binaria-amplia', 16], ['binaria-interactiva', 8], ['triple-jerarquica', 12], ['cuadruple', 5]]);
}

// Clase de una compañera: más ligera que la principal en la mayoría de casos.
function companionClass(rng, primary) {
  const pool = ['G', 'K', 'M', 'M', 'M', 'K', 'F', 'enana-marron', 'enana-blanca', 'A'];
  for (let k = 0; k < 12; k++) {
    const c = rng.pick(pool);
    if (STAR_CLASSES[c].M[0] <= primary.masaSol * 1.05 || rng.chance(0.15)) return c;
  }
  return 'M';
}

function eggletonRL(q) { // radio del lóbulo de Roche / separación, para la masa con razón q = m/m_otra
  const q23 = Math.pow(q, 2 / 3);
  return 0.49 * q23 / (0.6 * q23 + Math.log(1 + Math.pow(q, 1 / 3)));
}

/* ------------------------------------------------------------------ */
/*  Planetas                                                            */
/* ------------------------------------------------------------------ */

const TIPOS_POR_ZONA = {
  infierno: [['volcanico', 6], ['desertico', 2], ['rocoso', 1], ['jupiter_caliente', 3], ['gaseoso', 1]],  // > 900 K
  caliente: [['desertico', 5], ['volcanico', 3], ['rocoso', 3], ['mini_neptuno', 1.5], ['gaseoso', 0.4]],
  habitable: [['vergel', 5], ['oceanico', 4], ['archipielago', 3], ['pantanoso', 2], ['tundra', 1.5], ['desertico', 2], ['rocoso', 1]],
  templado: [['rocoso', 4], ['desertico', 3], ['tundra', 3], ['helado', 2], ['oceanico', 1], ['mini_neptuno', 2]],
  frio: [['gaseoso', 7], ['helado', 3], ['gigante_helado', 2], ['mini_neptuno', 1.5], ['rocoso', 1]],
  helado: [['helado', 5], ['gigante_helado', 4], ['gaseoso', 2]],
};
// Zona sugerida de los tipos registrados (exóticos) -> zonas propias
const ZONA_SUGERIDA = { interior: ['infierno', 'caliente'], habitable: ['habitable'], exterior: ['templado', 'frio', 'helado'] };
const FALLBACK_V1 = { jupiter_caliente: 'gaseoso', mini_neptuno: 'gaseoso', gigante_helado: 'gaseoso', archipielago: 'oceanico', pantanoso: 'vergel', tundra: 'helado' };

function tiposParaZona(zona) {
  const disp = tiposDisponibles();
  const out = [];
  for (const [t, w] of TIPOS_POR_ZONA[zona]) {
    if (disp.has(t)) out.push([t, w]);
    else if (FALLBACK_V1[t] && disp.has(FALLBACK_V1[t])) out.push([FALLBACK_V1[t], w * 0.5]);
  }
  // Exóticos registrados por otros módulos: entran con poco peso pero entran
  for (const [k, t] of disp) {
    if (TIPOS_POR_ZONA[zona].some(([x]) => x === k) || !t) continue;
    const zs = [].concat(t.zonas || t.zona || []);
    if (zs.some((z) => (ZONA_SUGERIDA[z] || []).includes(zona))) out.push([k, t.exotico || t.exotic ? 1.2 : 1.5]);
  }
  return out.length ? out : [['rocoso', 1]];
}

const ZONA_NOMBRE = {
  infierno: 'Abrasado por su estrella', caliente: 'Zona caliente', habitable: 'Zona habitable', templado: 'Borde frío',
  frio: 'Más allá de la línea de hielo', helado: 'Confines helados',
};

// Busca una semilla de planeta cuyo tipo sea uno de los deseados.
function findPlanetSeed(base, deseados, opts) {
  if (PLANETAS_V2) {
    const s = 'p' + hashString(base).toString(36);
    try { const spec = planetSpec(s, opts); if (spec?.meta) return { s, spec, opts }; } catch (e) { /* cae a la búsqueda */ }
  }
  let fallback = null;
  for (let k = 0; k < 48; k++) {
    const s = 'p' + hashString(base + '#' + k).toString(36);
    const spec = planetSpec(s);
    if (!fallback) fallback = { s, spec };
    if (deseados.includes(spec.meta.tipo)) return { s, spec };
  }
  return fallback;
}

const CIV_NIVELES = [
  'Sin vida inteligente',
  'Civilización planetaria',          // 1: luces nocturnas
  'Civilización orbital',             // 2: estaciones y satélites
  'Civilización interplanetaria',     // 3: anillo orbital, ascensor, tráfico
  'Civilización estelar (enjambre de Dyson)',
  'Civilización de tipo II (esfera de Dyson)',
];

const CIV_DESC = [
  '{pueblo} encienden sus ciudades al anochecer; desde órbita se ven como brasas repartidas por los continentes.',
  '{pueblo} cultivan algas en mares templados y cantan a sus lunas. Todavía no han salido de casa.',
  '{pueblo} han llenado su órbita de estaciones con forma de rueda. Sus faros parpadean en un código que nadie ha descifrado.',
  '{pueblo} tendieron un anillo de acero alrededor de su ecuador. Por él suben y bajan ascensores día y noche.',
  '{pueblo} viajan entre los mundos del sistema en convoyes luminosos. La Malkevnia les hace señales con las luces de cortesía.',
  '{pueblo} están desmontando un planeta para construir espejos alrededor de su estrella. Llevan siglos y van por la mitad.',
  '{pueblo} encerraron su sol en un enrejado de paneles. Solo se escapa luz por las rendijas.',
];

const RUINAS_DESC = [
  'Restos de anillos orbitales a la deriva: alguien vivió aquí hace mucho. Las balizas aún emiten, cada vez más débiles.',
  'Ruinas silenciosas en órbita. Ni rastro de quién las construyó; los sensores captan una canción repetida en bucle.',
];

function planetMassEarth(meta) {
  const R = meta.radioKm / 6371;
  return meta.gravedad * R * R;
}

function makePlanets(rng, node, ctx) {
  // node.L (luminosidad total que calienta), node.M (masa), aMin/aMax en UA
  const { aMin, aMax } = node.limites;
  if (aMax <= aMin * 1.3) return [];
  const planetas = [];
  const L = Math.max(node.L, 1e-6);
  const hzIn = Math.sqrt(L / 1.1), hzOut = Math.sqrt(L / 0.53);
  const hielo = 2.7 * Math.sqrt(L);
  node.zonaHabitable = { interiorUA: sig(hzIn), exteriorUA: sig(hzOut) };
  node.lineaHieloUA = sig(hielo);
  let nMax = node.esPar ? rng.int(1, 6) : rng.int(2, 11);
  if (node.estrella && isCompact(node.estrella.clase)) nMax = rng.int(0, 4);
  if (node.estrella?.clase === 'enana-marron') nMax = rng.int(0, 4);
  if (node.estrella?.clase === 'protoestrella') nMax = rng.int(1, 4);
  let a = aMin * rng.range(1.05, 1.6);
  for (let i = 0; i < nMax && a < aMax; i++) {
    const T = 278 * Math.pow(L, 0.25) / Math.sqrt(a); // K, temperatura de equilibrio aproximada
    const zona = T > 900 ? 'infierno' : T > 330 ? 'caliente' : (a >= hzIn && a <= hzOut) ? 'habitable' : a < hielo ? 'templado' : a < hielo * 6 ? 'frio' : 'helado';
    const tipoDeseado = rng.weighted(tiposParaZona(zona));
    const idx = ctx.planetCount++;
    const periodoPrev = periodDays(a, node.M);
    const acopladoPrev = a < 0.12 * Math.pow(node.M, 1 / 3) || (zona === 'infierno' && rng.chance(0.7));
    const planetOpts = {
      tipo: tipoDeseado, temperatura: Math.round(T - 273), acopladoMarea: acopladoPrev,
      contexto: { sistema: ctx.nombre, estrella: node.estrella ? node.estrella.nombre : `${ctx.nombre} ${node.id}`, aUA: sig(a), zona: zona === 'habitable' ? 'habitable' : (zona === 'infierno' || zona === 'caliente') ? 'interior' : 'exterior', periodoDias: sig(periodoPrev, 4) },
    };
    const { s: planetSeed, spec } = findPlanetSeed(`${ctx.seed}|${node.id}|${i}`, [tipoDeseado, FALLBACK_V1[tipoDeseado]].filter(Boolean), planetOpts);
    const meta = spec.meta;
    const gas = esGaseoso(meta.tipo);
    const e = r2(rng.chance(0.15) ? rng.range(0.15, 0.45) : rng.range(0, 0.08), 3);
    const incl = r2(rng.range(-0.06, 0.06), 3);
    const periodoDias = periodDays(a, node.M);
    const masaTierra = planetMassEarth(meta);
    const hillUA = a * (1 - e) * Math.cbrt((masaTierra / 333000) / (3 * node.M));
    // Mareas: planetas muy cercanos quedan acoplados (misma cara siempre hacia la estrella)
    const acoplado = acopladoPrev;
    // Lunas: las del módulo de planetas + lunas menores (gigantes gaseosos coleccionan decenas)
    const lunasBase = spec.visual.moons?.length ?? meta.lunas?.length ?? 0;
    let lunasMenores = 0;
    if (gas) lunasMenores = rng.weighted([[rng.int(2, 9), 4], [rng.int(10, 30), 4], [rng.int(31, 80), 2]]);
    else if (!acoplado && rng.chance(0.25)) lunasMenores = rng.int(1, 3);
    if (acoplado || hillUA < 0.002) lunasMenores = 0;
    const mareas = acoplado ? 'Acoplado por marea: una cara en día eterno, la otra en noche eterna.'
      : lunasBase > 0 && rng.chance(0.3) ? 'Sus lunas interiores se calientan por las mareas y tienen géiseres.'
      : e > 0.2 ? 'Órbita excéntrica: veranos brutales en el perihelio e inviernos largos.' : null;
    // Radio en escena
    const radio = gas ? clamp(1.35 + (meta.radioKm - 24000) / 61000 * 1.15, 1.3, 2.5) : clamp(0.42 + (meta.radioKm - 1800) / 9200 * 0.62, ESCALA.planetaMin, 1.05);
    planetas.push({
      id: `${node.id}-${String.fromCharCode(98 + i)}`, letra: String.fromCharCode(98 + i), idx,
      planetSeed, nombre: meta.nombre, designacion: `${ctx.nombre} ${node.esPar ? node.id + ' ' : (ctx.multiple ? node.id : '')}${String.fromCharCode(98 + i)}`.replace(/\s+/g, ' ').trim(),
      tipo: meta.tipo, tipoNombre: meta.tipoNombre, zona, zonaNombre: ZONA_NOMBRE[zona], circumbinario: !!node.esPar,
      temperaturaK: Math.round(T), temperaturaC: Math.round(T - 273), radioKm: meta.radioKm, gravedad: meta.gravedad, masaTierra: sig(masaTierra),
      radio: r2(radio, 3), anillos: !!spec.visual.rings, acopladoMarea: acoplado, mareas,
      lunas: lunasBase + lunasMenores, lunasPrincipales: lunasBase, lunasMenores,
      hillUA: sig(hillUA), limiteRocheKm: Math.round(2.44 * meta.radioKm),
      orbita: { alrededorDe: node.id, aUA: sig(a), e, inclinacion: incl, periodoDias: sig(periodoDias, 4), fase: r2(rng.range(0, Math.PI * 2), 3), argPeri: r2(rng.range(0, Math.PI * 2), 3), nodo: r2(rng.range(0, Math.PI * 2), 3), aEscena: 0 },
      civilizacion: null, anomalia: null, meta,
      planetOpts: PLANETAS_V2 ? planetOpts : null,
    });
    a *= rng.range(1.38, 2.1) * (gas ? 1.15 : 1);
  }
  return planetas;
}

function assignCivilizations(rng, planetas, ctx) {
  let maxNivel = 0, civHost = null;
  for (const p of planetas) {
    const hab = p.zona === 'habitable' ? 0.42 : ['vergel', 'oceanico', 'archipielago', 'pantanoso'].includes(p.tipo) ? 0.3 : esGaseoso(p.tipo) ? 0.05 : 0.08;
    if (!rng.chance(hab)) continue;
    let nivel = rng.weighted([[1, 5], [2, 4], [3, 3], [4, 1.2], [5, 0.5]]);
    if (esGaseoso(p.tipo)) nivel = Math.max(2, nivel); // colonias flotantes / estaciones
    const pueblo = makePeople(rng);
    const rasgos = [];
    if (!esGaseoso(p.tipo)) rasgos.push('luces');
    if (nivel >= 2) rasgos.push('estaciones');
    if (nivel >= 3) rasgos.push('anillo-orbital', 'ascensor', 'trafico');
    if (nivel >= 4) rasgos.push('enjambre-dyson');
    if (nivel >= 5) rasgos.push('esfera-dyson');
    if (rng.chance(0.4)) rasgos.push('faro');
    const desc = rng.pick(CIV_DESC.slice(Math.max(0, nivel - 1), nivel + 2)).replace('{pueblo}', pueblo.charAt(0).toUpperCase() + pueblo.slice(1));
    p.civilizacion = { nivel, nivelNombre: CIV_NIVELES[nivel], pueblo, descripcion: desc, rasgos, estaciones: nivel >= 2 ? rng.int(1, nivel + 1) : 0, extinta: false };
    if (p.planetOpts) p.planetOpts.civilizacion = p.civilizacion;
    if (nivel > maxNivel) { maxNivel = nivel; civHost = p; }
  }
  // Ruinas de una civilización extinta
  if (rng.chance(0.12) && planetas.length) {
    const p = rng.pick(planetas.filter((q) => !q.civilizacion) .concat([]));
    if (p) p.civilizacion = { nivel: 0, nivelNombre: 'Civilización extinta', pueblo: makePeople(rng), descripcion: rng.pick(RUINAS_DESC), rasgos: ['ruinas'], estaciones: 0, extinta: true };
  }
  ctx.civilizacionMax = maxNivel;
  ctx.civilizacionPrincipal = civHost ? civHost.id : null;
}

/* ------------------------------------------------------------------ */
/*  Sistema completo                                                    */
/* ------------------------------------------------------------------ */

const NEBULA_TINTS = [0x5a3aa8, 0x7a3a9a, 0x3a4aa8, 0x2a6a8a, 0x8a3a6a, 0x4a2a7a, 0x6a5ab8, 0x2a5a6a];

const NOTAS_CAPITAN = [
  'Apagamos motores al entrar. Aquí el silencio tiene otro color.',
  'Buen sitio para fondear una noche y escuchar la radio de fondo cósmico.',
  'Las cartas antiguas marcaban este sistema con un dibujito de una tetera. No sé por qué.',
  'Repostamos hielo en el cinturón exterior. Café recién hecho con agua de cometa.',
  'Si alguien lee esto: dejamos una baliza en el punto L4. Saluda al pasar.',
  'El ordenador de a bordo insiste en que aquí ya estuvimos. Yo no me acuerdo.',
  'Pusimos un disco viejo y nos quedamos mirando las órbitas un buen rato.',
  'Ruta tranquila. Ni piratas, ni tormentas, ni prisa.',
];

export function systemSpec(seedIn) {
  const seed = normalizeSeed(seedIn);
  const rng = makeRng(seed, 'sistema');
  const nombre = makeSystemName(rng);
  const designacion = `MKV-S ${rng.int(1000, 9999)}${rng.pick(['', '', 'A', 'X', 'Ω'])}`;

  // --- Estrellas y jerarquía ---
  const primClass = pickPrimaryClass(rng);
  let arquitectura = chooseArchitecture(rng, primClass);
  const estrellas = [];
  const ids = ['A', 'B', 'C', 'D'];
  const newStar = (clase) => { const s = makeStar(rng, clase, ids[estrellas.length], nombre); estrellas.push(s); return s; };
  const leaf = (s) => ({ tipo: 'estrella', id: s.id, estrella: s, M: s.masaSol, L: s.luminosidadSol, esPar: false, planetas: [] });
  const pair = (a, b, aUA, e, extra = {}) => {
    const M = a.M + b.M;
    return {
      tipo: 'par', id: a.id + b.id, a, b, M, L: a.L + b.L, esPar: true, planetas: [],
      orbita: { aUA: sig(aUA), e: r2(e, 3), periodoDias: sig(periodDays(aUA, M), 4), periodoVisualDias: sig(Math.max(periodDays(aUA, M), 3), 4), fase: r2(rng.range(0, 6.283), 3), argPeri: r2(rng.range(0, 6.283), 3), inclinacion: r2(rng.range(-0.08, 0.08), 3), nodo: r2(rng.range(0, 6.283), 3), aEscena: 0 },
      ...extra,
    };
  };

  let root;
  const A = newStar(primClass);
  if (arquitectura === 'simple') {
    root = leaf(A);
  } else if (arquitectura === 'binaria-cercana') {
    const B = newStar(companionClass(rng, A));
    const aUA = Math.max(rng.logRange(0.06, 0.6), 0.04 * Math.cbrt(A.masaSol + B.masaSol));
    root = pair(leaf(A), leaf(B), aUA, rng.range(0, 0.15));
  } else if (arquitectura === 'binaria-amplia') {
    const B = newStar(companionClass(rng, A));
    root = pair(leaf(A), leaf(B), rng.logRange(60, 400), rng.range(0.1, 0.55));
  } else if (arquitectura === 'binaria-interactiva') {
    // Donante hinchada que llena su lóbulo de Roche + acretor compacto con disco
    let donorClass = isGiant(A.clase) ? A.clase : rng.weighted([['gigante-roja', 6], ['K', 1], ['G', 1], ['M', 0.6], ['supergigante-azul', 0.8]]);
    let accClass = isCompact(A.clase) ? A.clase : rng.weighted([['enana-blanca', 5], ['neutrones', 2], ['pulsar', 1], ['agujero-negro', 2.5], ['estrella-quark', 0.4]]);
    // Rehacemos A/B con los papeles bien puestos (A = la más brillante en el catálogo)
    estrellas.length = 0;
    const donor = newStar(donorClass);
    const acc = newStar(accClass);
    acc.flags.discoAcrecion = { interior: acc.radio * (acc.clase === 'agujero-negro' ? 2.6 : 2.2), exterior: acc.radio * (acc.clase === 'agujero-negro' ? 9 : 14), color: acc.clase === 'enana-blanca' ? 0xbfd0ff : 0xffc080 };
    acc.flags.jets = acc.clase !== 'enana-blanca' && rng.chance(0.7);
    if (acc.clase === 'agujero-negro') acc.luminosidadSol = sig(rng.logRange(1e3, 1e5));
    const q = donor.masaSol / acc.masaSol;
    const rl = eggletonRL(q);
    const aUA = Math.max((donor.radioSol * 0.00465) / rl, 0.02);
    root = pair(leaf(donor), leaf(acc), aUA, 0, { transferencia: { donante: donor.id, acretor: acc.id, rocheDonante: r2(rl, 4) } });
    arquitectura = 'binaria-interactiva';
  } else if (arquitectura === 'triple-jerarquica') {
    const B = newStar(companionClass(rng, A));
    const C = newStar(rng.chance(0.25) ? rng.pick(['enana-blanca', 'enana-marron', 'pulsar']) : companionClass(rng, A));
    const inner = pair(leaf(A), leaf(B), rng.logRange(0.06, 0.4), rng.range(0, 0.12));
    root = pair(inner, leaf(C), rng.logRange(120, 600), rng.range(0.1, 0.5));
  } else { // cuádruple: dos parejas cercanas en órbita amplia
    const B = newStar(companionClass(rng, A));
    const C = newStar(companionClass(rng, A));
    const D = newStar(companionClass(rng, C));
    const p1 = pair(leaf(A), leaf(B), rng.logRange(0.06, 0.3), rng.range(0, 0.1));
    const p2 = pair(leaf(C), leaf(D), rng.logRange(0.06, 0.3), rng.range(0, 0.1));
    root = pair(p1, p2, rng.logRange(200, 700), rng.range(0.1, 0.45));
  }

  // --- Límites de estabilidad de los planetas por nodo ---
  const ctx = { seed, nombre, planetCount: 0, multiple: estrellas.length > 1 };
  const nodes = [];
  (function setLimits(node, aMaxParent) {
    nodes.push(node);
    if (node.tipo === 'estrella') {
      const s = node.estrella;
      const rUA = s.radioSol * 0.00465;
      let aMin = Math.max(0.025, rUA * (isGiant(s.clase) ? 2.2 : 4));
      if (s.clase === 'protoestrella') aMin = 0.08;
      node.limites = { aMin, aMax: Math.min(aMaxParent, 70 * Math.sqrt(Math.max(s.masaSol, 0.08))) };
    } else {
      const o = node.orbita;
      const aMinP = o.aUA * (2.4 + 3 * o.e); // estabilidad circumbinaria (Holman-Wiegert aprox.)
      const aMaxS = o.aUA * (1 - o.e) * 0.28;
      node.limites = { aMin: aMinP, aMax: Math.min(aMaxParent, 60 * Math.sqrt(node.M)) };
      setLimits(node.a, aMaxS);
      setLimits(node.b, aMaxS);
    }
  })(root, Infinity);

  // Planetas de cada nodo (en la binaria interactiva, solo circumbinarios lejanos)
  const planetas = [];
  for (const node of nodes) {
    if (root.transferencia && node.tipo === 'estrella') continue;
    if (node.tipo === 'par' && node.orbita.aUA > 50) { node.limites.aMin = Math.max(node.limites.aMin, 1); }
    node.planetas = makePlanets(makeRng(seed, 'planetas-' + node.id), node, ctx);
    planetas.push(...node.planetas);
  }
  assignCivilizations(makeRng(seed, 'civ'), planetas, ctx);

  // --- Cinturones (en UA) y escala de escena ---
  const brng = makeRng(seed, 'cinturones');
  for (const node of nodes) planBelts(node, brng, node === root);
  computeSceneLayout(root);

  // --- Cinturones y discos (ya colocados por computeSceneLayout) ---
  const cinturones = [];
  for (const node of nodes) for (const c of node.cinturones || []) cinturones.push(c);
  for (const c of cinturones) {
    c.tipoNombre = c.tipoNombre || { asteroides: 'Cinturón de asteroides', hielo: 'Cinturón helado (tipo Kuiper)', escombros: 'Disco de escombros', cristal: 'Cinturón de cristal' }[c.tipo];
    if (c.tipo === 'asteroides') c.descripcion = 'Los huecos de Kirkwood marcan dónde el gigante, con sus empujoncitos resonantes, no deja quedarse a ninguna roca.';
    if (c.tipo === 'cristal') c.descripcion = 'Rocas de cuarzo y hielo que devuelven la luz en todos los colores. Nadie sabe de dónde salió tanto cristal.';
    if (c.tipo === 'hielo') c.descripcion = 'Bolas de hielo sucio y cometas dormidos, mucho más allá del último planeta.';
    if (c.tipo === 'escombros') c.descripcion = 'Polvo de planetas que chocaron, o que su estrella hizo pedazos.';
    if (c.tipo === 'disco-protoplanetario') c.descripcion = 'Polvo y gas del que aún están naciendo planetas; los huecos son sus órbitas.';
  }

  const crng = makeRng(seed, 'cometas');
  const cometas = [];
  const nCom = crng.weighted([[0, 2], [1, 4], [2, 3], [3, 2], [5, 0.6]]);
  for (let i = 0; i < nCom; i++) {
    const q = crng.logRange(0.3, 4) * Math.sqrt(Math.max(root.L, 0.05)) ** 0.5 + (root.esPar ? root.limites.aMin : 0);
    const e = crng.range(0.6, 0.93);
    const a = q / (1 - e);
    cometas.push({
      id: `cometa-${i + 1}`, nombre: `Cometa ${makeWord(crng, 2, 2)}`, alrededorDe: root.id,
      orbita: { aUA: sig(a), e: r2(e, 3), periodoDias: sig(periodDays(a, root.M), 4), fase: r2(crng.range(0, 6.283), 3), argPeri: r2(crng.range(0, 6.283), 3), inclinacion: r2(crng.range(-0.6, 0.6), 3), nodo: r2(crng.range(0, 6.283), 3), aEscena: 0, eEscena: 0 },
    });
  }
  for (const c of cometas) {
    // Elipse en escena: perihelio y afelio comprimidos por separado
    const qS = sceneDist(root, c.orbita.aUA * (1 - c.orbita.e)), QS = sceneDist(root, c.orbita.aUA * (1 + c.orbita.e));
    c.orbita.aEscena = r2((qS + QS) / 2); c.orbita.eEscena = r2((QS - qS) / (QS + qS), 3);
  }

  // --- Gravedad: Lagrange, Roche, Hill ---
  const gravedad = { lagrange: [], roche: [], hill: [] };
  for (const node of nodes) {
    if (node.tipo === 'par' && node.orbita.aUA < 2) {
      const q = node.b.M / node.a.M;
      gravedad.roche.push({ par: node.id, q: r2(q, 4), lobuloA: r2(eggletonRL(node.a.M / node.b.M), 4), lobuloB: r2(eggletonRL(q), 4), puntosL: lagrangeOfPair(node.b.M / node.M) });
    }
    const big = [...node.planetas].sort((x, y) => y.masaTierra - x.masaTierra)[0];
    if (big) {
      const mu = (big.masaTierra / 333000) / node.M;
      gravedad.lagrange.push({ planeta: big.id, alrededorDe: node.id, mu: sig(mu), troyanos: esGaseoso(big.tipo) || mu > 5e-6, puntos: ['L1', 'L2', 'L3', 'L4', 'L5'] });
      big.troyanos = esGaseoso(big.tipo);
    }
  }
  for (const p of planetas) gravedad.hill.push({ planeta: p.id, radioUA: p.hillUA, limiteRocheKm: p.limiteRocheKm });

  // --- Anomalías (lo fantasioso) ---
  const arng = makeRng(seed, 'anomalias');
  const anomalias = [];
  if (arng.chance(0.09)) anomalias.push({ id: 'agujero-de-gusano', tipo: 'agujero-de-gusano', nombre: 'Agujero de gusano', descripcion: 'Una esfera que refleja estrellas que no son de aquí. Las sondas que entran vuelven… a veces.', distanciaEscena: r2(rootExtent(root) * arng.range(0.65, 0.9)), fase: r2(arng.range(0, 6.28), 3) });
  const candidatoDesint = planetas.find((p) => p.zona === 'infierno' && !esGaseoso(p.tipo));
  if (candidatoDesint && arng.chance(0.4)) {
    candidatoDesint.anomalia = 'desintegrandose';
    anomalias.push({ id: 'desintegracion', tipo: 'planeta-desintegrandose', planeta: candidatoDesint.id, nombre: `${candidatoDesint.nombre} se deshace`, descripcion: 'Tan cerca de su estrella que se evapora: deja una cola de roca vaporizada como un cometa.' });
  }
  if (arng.chance(0.18)) anomalias.push({ id: 'baliza', tipo: 'baliza-antigua', nombre: 'Baliza antigua', descripcion: 'Una baliza que emite un pulso cada 7,3 segundos desde antes de que existieran las cartas de navegación.', distanciaEscena: r2(rootExtent(root) * arng.range(0.5, 1)), fase: r2(arng.range(0, 6.28), 3) });
  if (arng.chance(0.12) && planetas.length > 1) {
    const p = arng.pick(planetas);
    if (!p.anomalia) { p.anomalia = 'anillo-gigante'; anomalias.push({ id: 'anillo-gigante', tipo: 'anillo-gigante', planeta: p.id, nombre: `Los grandes anillos de ${p.nombre}`, descripcion: 'Un sistema de anillos doscientas veces más grande que el planeta. Seguramente una luna que se acercó demasiado.' }); }
  }

  // --- Resumen ---
  const totalLunas = planetas.reduce((s, p) => s + p.lunas, 0);
  const hz = root.zonaHabitable || nodes.find((n) => n.zonaHabitable)?.zonaHabitable || null;
  const tags = [];
  if (estrellas.length > 1) tags.push(ARQUITECTURAS[arquitectura]);
  for (const s of estrellas) if (!['G', 'K', 'M', 'F'].includes(s.clase)) tags.push(s.claseNombre);
  if (ctx.civilizacionMax) tags.push(CIV_NIVELES[ctx.civilizacionMax]);
  for (const a of anomalias) tags.push(a.nombre);

  const spec = {
    version: 1, seed, nombre, designacion, arquitectura, arquitecturaNombre: ARQUITECTURAS[arquitectura],
    estrellas, jerarquia: serializeNode(root), planetas, cinturones, cometas, anomalias, gravedad,
    zonaHabitable: hz, lineaHieloUA: root.lineaHieloUA ?? null,
    civilizacion: { nivelMax: ctx.civilizacionMax, planetaPrincipal: ctx.civilizacionPrincipal },
    totalLunas, nebulosa: rng.pick(NEBULA_TINTS), extensionEscena: r2(rootExtent(root)),
    notaCapitan: rng.pick(NOTAS_CAPITAN), etiquetas: tags,
  };
  // Referencias internas (no serializables) para el constructor de escena
  Object.defineProperty(spec, '_root', { value: root, enumerable: false });
  Object.defineProperty(spec, '_nodes', { value: nodes, enumerable: false });
  return spec;
}

/* ------------------------------------------------------------------ */
/*  Disposición en escena                                               */
/* ------------------------------------------------------------------ */

// Extensión visual de un planeta con sus lunas y anillos (para no solapar órbitas)
export function planetReach(p) {
  const moons = p.lunasPrincipales > 0 || p.lunasMenores > 0 ? 5.6 + Math.min(p.lunasPrincipales, 6) * 0.4 : 0;
  return p.radio * Math.max(moons, p.anillos ? 2.8 : 1.5, 1.5) + (p.anomalia === 'anillo-gigante' ? p.radio * 4 : 0);
}

// UA -> escena para un nodo: compresión sqrt, pero interpolando entre las órbitas
// reales de sus planetas (que se separan lo justo para que quepan sus lunas).
function sceneDist(node, aUA) {
  const m = node.mapa;
  const base = (a) => node.nucleo + ESCALA.K * Math.sqrt(a);
  if (!m || !m.length) return base(aUA);
  const sq = Math.sqrt(aUA);
  if (sq <= m[0][0]) return node.nucleo + (m[0][1] - node.nucleo) * (sq / m[0][0]);
  for (let i = 1; i < m.length; i++) {
    if (sq <= m[i][0]) { const t = (sq - m[i - 1][0]) / (m[i][0] - m[i - 1][0]); return m[i - 1][1] + t * (m[i][1] - m[i - 1][1]); }
  }
  const [lq, ls] = m[m.length - 1];
  const stretch = Math.max(1, (ls - node.nucleo) / (ESCALA.K * lq));
  return ls + ESCALA.K * stretch * (sq - lq);
}

export function escalaEscena(spec, nodeId, aUA) {
  const node = spec._nodes.find((n) => n.id === nodeId);
  return node ? sceneDist(node, aUA) : ESCALA.K * Math.sqrt(aUA);
}

// Decide qué cinturones tiene un nodo (en UA). computeSceneLayout les hace sitio.
function planBelts(node, brng, isRoot) {
  node.plan = { dentro: null, entre: null, fuera: null, disco: null };
  const ps = node.planetas;
  if (!ps.length && !isRoot) return;
  const host = node.estrella;
  if (host?.clase === 'protoestrella') {
    node.plan.disco = { id: `${node.id}-disco`, tipo: 'disco-protoplanetario', tipoNombre: 'Disco protoplanetario', alrededorDe: node.id, interiorUA: sig(node.limites.aMin * 0.6), exteriorUA: sig(Math.max((ps[ps.length - 1]?.orbita.aUA ?? 1) * 1.6, 3)) };
    return;
  }
  const gi = ps.findIndex((p) => esGaseoso(p.tipo) && p.masaTierra > 30);
  const gIdx = gi >= 0 ? gi : ps.findIndex((p) => esGaseoso(p.tipo));
  if (gIdx >= 0 && brng.chance(0.75)) {
    const g = ps[gIdx], aJ = g.orbita.aUA;
    const inner = gIdx > 0 ? ps[gIdx - 1] : null;
    const lo = Math.max(inner ? inner.orbita.aUA * 1.25 : aJ * 0.35, aJ * 0.35), hi = aJ * 0.78;
    if (hi > lo * 1.08) {
      node.plan.entre = {
        antesDe: gIdx, id: `${node.id}-asteroides`, tipo: brng.chance(0.12) ? 'cristal' : 'asteroides', alrededorDe: node.id, interiorUA: sig(lo), exteriorUA: sig(hi),
        // Huecos de Kirkwood: resonancias con el gigante (3:1, 5:2, 7:3, 2:1)
        huecosKirkwood: [1 / 3, 2 / 5, 3 / 7, 1 / 2].map((r) => sig(aJ * Math.pow(r, 2 / 3))).filter((x) => x > lo && x < hi),
        resonanteCon: g.id,
      };
    }
  }
  if (brng.chance(isRoot ? 0.7 : 0.35)) {
    const last = ps[ps.length - 1];
    const lo = last ? last.orbita.aUA * 1.35 : node.limites.aMin * 3;
    node.plan.fuera = { id: `${node.id}-kuiper`, tipo: 'hielo', alrededorDe: node.id, interiorUA: sig(lo), exteriorUA: sig(lo * brng.range(1.6, 2.4)) };
  }
  if (host && ['enana-blanca', 'A', 'pulsar', 'neutrones', 'F'].includes(host.clase) && brng.chance(host.clase === 'F' ? 0.2 : 0.5)) {
    const lo = node.limites.aMin * 1.1;
    const first = ps[0]?.orbita.aUA ?? lo * 4;
    node.plan.dentro = { id: `${node.id}-escombros`, tipo: 'escombros', alrededorDe: node.id, interiorUA: sig(lo), exteriorUA: sig(Math.max(lo * 1.3, Math.min(first * 0.7, lo * 2.2))) };
  }
}

function computeSceneLayout(root) {
  // De abajo arriba: núcleo (lo que ocupan las estrellas) y extensión (núcleo + planetas + cinturones)
  (function layout(node) {
    if (node.tipo === 'estrella') {
      const s = node.estrella;
      const glow = s.flags.nebulosa === 'planetaria' ? 9 : s.flags.nebulosa ? 6 : 0;
      const disk = s.flags.discoAcrecion ? s.flags.discoAcrecion.exterior : 0;
      node.nucleo = Math.max(s.radio * 1.6 + 1.2, disk + 1, glow);
    } else {
      layout(node.a); layout(node.b);
      const o = node.orbita;
      const fa = node.b.M / node.M, fb = node.a.M / node.M; // fracción de la separación que recorre cada uno
      let sep;
      if (node.transferencia) {
        // La donante llena exactamente su lóbulo de Roche
        const donor = node.a.estrella.id === node.transferencia.donante ? node.a : node.b;
        const acc = donor === node.a ? node.b : node.a;
        sep = donor.estrella.radio / node.transferencia.rocheDonante;
        sep = Math.max(sep, donor.estrella.radio + acc.estrella.flags.discoAcrecion.exterior + 3);
      } else {
        const visual = (o.aUA < 1 ? 8 : 2.2 * ESCALA.K) * Math.sqrt(o.aUA);
        const minSep = (node.a.extension + node.b.extension) * 1.2 / (1 - o.e);
        sep = Math.max(visual, minSep);
      }
      o.aEscena = r2(sep, 3);
      const apo = sep * (1 + o.e);
      node.nucleo = Math.max(apo * fa + node.a.extension, apo * fb + node.b.extension) + 2.5;
    }
    const plan = node.plan || {};
    node.cinturones = [];
    const sqrtMap = (c, lo, hi, a) => lo + (hi - lo) * (Math.sqrt(a) - Math.sqrt(c.interiorUA)) / (Math.sqrt(c.exteriorUA) - Math.sqrt(c.interiorUA));
    let prev = node.nucleo, prevReach = 0;
    if (plan.dentro) {
      const c = plan.dentro, w = Math.max(3, node.nucleo * 0.6);
      c.interiorEscena = r2(node.nucleo + 0.5); c.exteriorEscena = r2(node.nucleo + 0.5 + w);
      node.cinturones.push(c); prev = c.exteriorEscena + 0.5;
    }
    node.mapa = [];
    node.planetas.forEach((p, i) => {
      const reach = planetReach(p);
      let gapExtra = 0;
      if (plan.entre && plan.entre.antesDe === i) {
        const c = plan.entre, w = Math.max(6, (prev + prevReach) * 0.35);
        c.interiorEscena = r2(prev + prevReach + 1.5); c.exteriorEscena = r2(c.interiorEscena + w);
        c.huecosEscena = c.huecosKirkwood.map((a) => r2(sqrtMap(c, c.interiorEscena, c.exteriorEscena, a)));
        node.cinturones.push(c);
        gapExtra = w + 3;
      }
      const want = node.nucleo + ESCALA.K * Math.sqrt(p.orbita.aUA);
      const peri = Math.max(want, prev + prevReach + reach + 1.2 + gapExtra);
      const es = r2(p.orbita.e * 0.5, 3); // excentricidad visual (suavizada para que no se crucen)
      const d = peri / (1 - es);
      p.orbita.aEscena = r2(d, 3);
      p.orbita.eEscena = es;
      p.alcanceEscena = r2(reach, 3);
      node.mapa.push([Math.sqrt(p.orbita.aUA), d]);
      prev = d * (1 + es); prevReach = reach;
    });
    let ext = node.planetas.length ? prev + prevReach + 2 : node.nucleo;
    if (plan.fuera) {
      const c = plan.fuera, lo = ext + 3, w = Math.max(10, lo * 0.35);
      c.interiorEscena = r2(lo); c.exteriorEscena = r2(lo + w);
      node.cinturones.push(c); ext = lo + w + 2;
    }
    if (plan.disco) {
      const c = plan.disco;
      c.interiorEscena = r2(node.nucleo * 0.75); c.exteriorEscena = r2(Math.max(ext * 1.15, node.nucleo * 4));
      c.huecosEscena = node.planetas.map((p) => p.orbita.aEscena);
      node.cinturones.push(c); ext = Math.max(ext, c.exteriorEscena + 2);
    }
    for (const c of node.cinturones) c.huecosEscena = c.huecosEscena || [];
    node.extension = ext;
  })(root);
}

function rootExtent(root) { return Math.max(root.extension, root.nucleo) + 30; }

// Puntos de Lagrange de un par (unidades: separación = 1, origen en el baricentro,
// masa 1 en x = -mu, masa 2 en x = 1 - mu). mu = m2 / (m1 + m2).
export function lagrangeOfPair(mu) {
  const f = (x) => {
    const r1 = x + mu, r2_ = x - 1 + mu;
    return x - (1 - mu) * r1 / Math.abs(r1) ** 3 - mu * r2_ / Math.abs(r2_) ** 3;
  };
  const solve = (a, b) => { for (let i = 0; i < 80; i++) { const m = (a + b) / 2; (f(a) * f(m) <= 0) ? (b = m) : (a = m); } return (a + b) / 2; };
  const L1 = solve(-mu + 1e-6, 1 - mu - 1e-6);
  const L2 = solve(1 - mu + 1e-6, 3);
  const L3 = solve(-3, -mu - 1e-6);
  const h = Math.sqrt(3) / 2;
  return { L1: [r2(L1, 5), 0], L2: [r2(L2, 5), 0], L3: [r2(L3, 5), 0], L4: [r2(0.5 - mu, 5), r2(h, 5)], L5: [r2(0.5 - mu, 5), r2(-h, 5)] };
}

function serializeNode(n) {
  if (n.tipo === 'estrella') return { tipo: 'estrella', id: n.id, planetas: n.planetas.map((p) => p.id), zonaHabitable: n.zonaHabitable ?? null, lineaHieloUA: n.lineaHieloUA ?? null, nucleoEscena: r2(n.nucleo) };
  return {
    tipo: 'par', id: n.id, masaSol: sig(n.M), orbita: n.orbita, transferencia: n.transferencia ?? null,
    a: serializeNode(n.a), b: serializeNode(n.b), planetas: n.planetas.map((p) => p.id),
    zonaHabitable: n.zonaHabitable ?? null, lineaHieloUA: n.lineaHieloUA ?? null, nucleoEscena: r2(n.nucleo),
  };
}

/* ------------------------------------------------------------------ */
/*  Kepler                                                              */
/* ------------------------------------------------------------------ */
// orbita: { aEscena, e (o eEscena), periodoDias, fase (anomalía media en t=0), argPeri, inclinacion, nodo }
// Devuelve en `out` ({x,y,z}) la posición relativa al foco, plano orbital ~XZ (Y arriba).

export function keplerPosition(o, tDias, out) {
  const e = o.eEscena != null ? o.eEscena : o.e; // en escena se usa la excentricidad visual
  const a = o.aEscena;
  const M = o.fase + (2 * Math.PI * tDias) / (o.periodoVisualDias || o.periodoDias);
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // rotación: argumento del periastro (en el plano), inclinación (sobre X), nodo (sobre Y)
  const cw = Math.cos(o.argPeri), sw = Math.sin(o.argPeri);
  let px = x * cw - y * sw, pz = x * sw + y * cw, py = 0;
  const ci = Math.cos(o.inclinacion), si = Math.sin(o.inclinacion);
  const pz2 = pz * ci - py * si; py = pz * si + py * ci; pz = pz2;
  const cn = Math.cos(o.nodo), sn = Math.sin(o.nodo);
  out.x = px * cn - pz * sn; out.z = px * sn + pz * cn; out.y = py;
  return out;
}
