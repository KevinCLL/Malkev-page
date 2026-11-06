// planetas.js · Generador de planetas procedurales de La Malkevnia (v2)
// Módulo ES autocontenido. Depende solo de 'three' (three@0.160.0 vía importmap).
// Determinista: la misma semilla (y las mismas opciones) da siempre el mismo
// planeta, con el mismo nombre, lore, datos, colores, lunas y anillos.
//
// API pública (ver README.md):
//   planetSpec(seed, opts?)       -> { meta, visual }   datos puros, sin GPU
//   generatePlanet(seed, opts?)   -> handle { group, mesh, meta, visual, uniforms, update, setLightDirection,
//                                             setSunPosition, setLightColor, lightDirection, lightColor, dispose }
//   registerPlanetTypes(mod)      -> añade tipos de otro módulo (p. ej. mundos exóticos)
//   listPlanetTypes()             -> catálogo completo (núcleo + registrados)
//   randomSeed(), normalizeSeed(s), PLANET_TYPES
//   Utilidades: makeRng, makeWord, hashString, NOISE_GLSL, HEIGHT_GLSL

import * as THREE from 'three';

/* ================================================================== */
/*  Aleatoriedad determinista                                          */
/* ================================================================== */

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

/** Generador pseudoaleatorio con utilidades. `salt` separa flujos independientes. */
export function makeRng(seed, salt = '') {
  const r = mulberry32(hashString(String(seed) + '|' + salt));
  const rng = () => r();
  rng.range = (a, b) => a + (b - a) * r();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  rng.pick = (arr) => arr[Math.floor(r() * arr.length)];
  rng.chance = (p) => r() < p;
  rng.weighted = (entries) => {
    const total = entries.reduce((s, e) => s + e[1], 0);
    let x = r() * total;
    for (const [v, w] of entries) { if ((x -= w) <= 0) return v; }
    return entries[entries.length - 1][0];
  };
  return rng;
}

export function normalizeSeed(seed) {
  const s = String(seed ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return s || 'malkevnia';
}

export function randomSeed() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(7);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 2 ** 32);
  let s = '';
  for (const v of buf) s += chars[v % chars.length];
  return s;
}

/* ================================================================== */
/*  Catálogo de tipos (núcleo)                                          */
/* ================================================================== */
// zonas: dónde encaja en un sistema ('interior' caliente, 'habitable', 'exterior' frío)

export const PLANET_TYPES = {
  rocoso:           { nombre: 'Mundo rocoso',         peso: 12, zonas: ['interior', 'habitable', 'exterior'], gas: false },
  desertico:        { nombre: 'Mundo desértico',      peso: 9,  zonas: ['interior', 'habitable'], gas: false },
  oceanico:         { nombre: 'Mundo oceánico',       peso: 7,  zonas: ['habitable'], gas: false },
  archipielago:     { nombre: 'Mundo archipiélago',   peso: 5,  zonas: ['habitable'], gas: false },
  vergel:           { nombre: 'Vergel templado',      peso: 7,  zonas: ['habitable'], gas: false },
  tundra:           { nombre: 'Mundo de tundra',      peso: 6,  zonas: ['habitable', 'exterior'], gas: false },
  pantanoso:        { nombre: 'Mundo pantanoso',      peso: 5,  zonas: ['habitable'], gas: false },
  volcanico:        { nombre: 'Mundo volcánico',      peso: 8,  zonas: ['interior'], gas: false },
  helado:           { nombre: 'Mundo helado',         peso: 9,  zonas: ['exterior'], gas: false },
  gaseoso:          { nombre: 'Gigante gaseoso',      peso: 12, zonas: ['exterior'], gas: true },
  jupiter_caliente: { nombre: 'Júpiter caliente',     peso: 4,  zonas: ['interior'], gas: true },
  gigante_helado:   { nombre: 'Gigante de hielo',     peso: 8,  zonas: ['exterior'], gas: true },
  mini_neptuno:     { nombre: 'Mini-Neptuno',         peso: 6,  zonas: ['habitable', 'exterior'], gas: true },
};
// Ids estables para los shaders (uType). 6 = gigante gaseoso (cualquier tipo de gas).
const SHADER_ID = { rocoso: 0, desertico: 1, oceanico: 2, archipielago: 2, vergel: 3, tundra: 3, pantanoso: 3, volcanico: 4, helado: 5, gaseoso: 6, jupiter_caliente: 6, gigante_helado: 6, mini_neptuno: 6 };
for (const k in PLANET_TYPES) PLANET_TYPES[k].id = SHADER_ID[k];

/* ---------- Registro de tipos externos (mundos exóticos, etc.) ---------- */

const EXTERNAL = [];
const OWNER = {};
/** Proporción de semillas que caen en tipos registrados (si hay alguno). */
export const EXTERNAL_SHARE = 0.35;

/**
 * Registra tipos de otro módulo. mod = { tipos: { clave: { nombre, peso, zonas } }, planetSpec(seed, opts), generatePlanet(seed, opts) }.
 * Tras registrar, planetSpec/generatePlanet(seed) pueden delegar en ese módulo (con opts.tipo forzado).
 * Para que una semilla sea reproducible, el conjunto de módulos registrados debe ser el mismo.
 */
export function registerPlanetTypes(mod) {
  if (!mod || !mod.tipos || typeof mod.planetSpec !== 'function' || typeof mod.generatePlanet !== 'function') {
    throw new Error('registerPlanetTypes: se esperaba { tipos, planetSpec, generatePlanet }');
  }
  if (EXTERNAL.includes(mod)) return;
  EXTERNAL.push(mod);
  for (const k of Object.keys(mod.tipos)) {
    if (PLANET_TYPES[k]) { console.warn(`registerPlanetTypes: el tipo «${k}» ya existe en el núcleo; se ignora.`); continue; }
    OWNER[k] = mod;
  }
}

/** Catálogo completo: { clave: { nombre, peso, zonas, gas, origen: 'nucleo'|'registrado' } } */
export function listPlanetTypes() {
  const out = {};
  for (const [k, t] of Object.entries(PLANET_TYPES)) out[k] = { ...t, origen: 'nucleo' };
  for (const [k, mod] of Object.entries(OWNER)) out[k] = { gas: false, zonas: ['interior', 'habitable', 'exterior'], ...mod.tipos[k], origen: 'registrado' };
  return out;
}

function resolveTipo(seed, opts) {
  if (opts.tipo) {
    if (PLANET_TYPES[opts.tipo] || OWNER[opts.tipo]) return opts.tipo;
    console.warn(`planetas: tipo desconocido «${opts.tipo}», se elige por semilla.`);
  }
  const zona = opts.zona;
  const fits = (t) => !zona || !t.zonas || t.zonas.includes(zona);
  const ext = Object.keys(OWNER).filter((k) => fits(OWNER[k].tipos[k]));
  if (ext.length && makeRng(seed, 'exotico')() < EXTERNAL_SHARE) {
    const r = makeRng(seed, 'tipo-ext');
    return r.weighted(ext.map((k) => [k, OWNER[k].tipos[k].peso ?? 1]));
  }
  const r = makeRng(seed, 'tipo');
  const core = Object.entries(PLANET_TYPES).filter(([, t]) => fits(t));
  return r.weighted((core.length ? core : Object.entries(PLANET_TYPES)).map(([k, t]) => [k, t.peso]));
}

/* ================================================================== */
/*  Nombres                                                             */
/* ================================================================== */

const ONSETS = ['k', 'v', 'th', 'z', 's', 'm', 'n', 'l', 'r', 'd', 't', 'g', 'br', 'kr', 'dr', 'x', 'y', 'f', 'h', 'qu', 'sh', 'c', 'b', 'p', 'tr', 'vr', 'ss', 'ç'];
const ONSETS_MID = ONSETS.filter((o) => o !== 'ç');
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'ae', 'ia', 'io', 'ei', 'au', 'y'];
const CODAS = ['', '', '', '', 'n', 'r', 's', 'l', 'th', 'x', 'm', 'nd', 'rn', 'sk', 'z'];
const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'IX'];

/** Palabra inventada pronunciable y capitalizada. */
export function makeWord(rng, minSyl = 2, maxSyl = 3) {
  const n = rng.int(minSyl, maxSyl);
  let w = '';
  for (let i = 0; i < n; i++) {
    const onset = i === 0 ? (rng.chance(0.85) ? rng.pick(ONSETS) : '') : rng.pick(ONSETS_MID);
    const coda = i === n - 1 ? rng.pick(CODAS) : (rng.chance(0.3) ? rng.pick(['n', 'r', 'l', 's']) : '');
    w += onset + rng.pick(VOWELS) + coda;
  }
  w = w.replace(/(.)\1\1+/g, '$1$1').replace(/^ç/, 's').replace(/yy/g, 'y');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function makePlanetName(rng) {
  const base = makeWord(rng, 2, 3);
  const suf = rng.weighted([['', 40], [' Prime', 9], ['roman', 18], [' Menor', 7], [' Mayor', 7], ['guion', 10], [' de los Vientos', 2], [' Silente', 2], [' Lejano', 2], [' del Alba', 2]]);
  if (suf === 'roman') return `${base} ${rng.pick(ROMAN)}`;
  if (suf === 'guion') return `${base}-${makeWord(rng, 1, 1)}`;
  return base + suf;
}

/* ================================================================== */
/*  Lore                                                                */
/* ================================================================== */

const SONDAS = ['Lirio', 'Paciencia', 'Farolillo', 'Vigía-3', 'Marea Lenta', 'Cometa Azul', 'Grulla', 'Errante', 'Duermevela', 'Linterna'];
const ORIGEN = [
  'Catalogado por primera vez en el ciclo {ciclo} por la sonda {sonda}.',
  'Las cartas estelares de La Malkevnia lo marcan con un círculo y una nota a lápiz: «volver con calma».',
  'Apareció en el radar un martes cualquiera, mientras sonaba algo tranquilo en el puente.',
  'Nadie recuerda quién le puso nombre, pero el ordenador de a bordo se niega a cambiarlo.',
  'Su señal llegó antes que su luz: un pulso suave cada {pulso} segundos.',
  'Figura en un mapa antiguo encontrado dentro de una caja de juego de segunda mano.',
  'La sonda {sonda} pasó a su lado sin detenerse y solo dejó una foto borrosa y una palabra: «precioso».',
  'Lo encontró la tripulación buscando otra cosa, como pasa con las mejores cosas.',
];

const DESCR = {
  rocoso: [
    'Es un mundo de mesetas grises y cañones que se pierden en sombra.',
    'Su corteza está rota en placas que crujen al amanecer, cuando el frío cede.',
    'Llanuras de basalto y cráteres antiguos, quietos desde hace millones de años.',
  ],
  desertico: [
    'Dunas que cambian de forma cada noche y un cielo que nunca termina de estar limpio.',
    'Un océano de arena teñida de óxido donde el viento escribe y borra caminos.',
    'Sus desiertos guardan ruinas cristalizadas que brillan cuando el sol está bajo.',
  ],
  oceanico: [
    'Un único océano lo cubre casi todo, con un puñado de islas como migas en un mantel.',
    'Mareas lentas y enormes recorren su superficie, empujadas por {lunasTxt}.',
    'Bajo el agua hay luz: algo allí abajo brilla en tonos que no tienen nombre.',
  ],
  archipielago: [
    'Miles de islas salpican mares poco profundos de color turquesa.',
    'Un rosario de islas volcánicas, playas claras y arrecifes que se ven desde la órbita.',
    'Aquí el mar nunca está lejos: ninguna isla es más grande que un país pequeño.',
  ],
  vergel: [
    'Bosques templados, ríos anchos y un clima que invita a quedarse una temporada.',
    'Continentes verdes y mares tranquilos; de noche el silencio es casi total.',
    'Huele a lluvia incluso desde la órbita, o eso dice siempre la tripulación.',
  ],
  tundra: [
    'Llanuras frías de musgo y liquen bajo un sol que nunca sube del todo.',
    'Un mundo de veranos cortos, lagos helados y casquetes que bajan casi hasta el ecuador.',
    'Viento constante, hierba rala y una luz dorada que dura horas en cada atardecer.',
  ],
  pantanoso: [
    'Ciénagas, manglares y nieblas que no se levantan nunca del todo.',
    'Agua tibia y poco profunda por todas partes, y un zumbido de vida que no cesa.',
    'Sus nubes bajas descargan tormentas eléctricas casi cada tarde.',
  ],
  volcanico: [
    'Ríos de lava trazan su superficie como venas encendidas bajo una costra negra.',
    'Volcanes en erupción perpetua iluminan su cara nocturna como brasas.',
    'La roca aquí está viva: se agrieta, se funde y vuelve a cerrarse en horas.',
  ],
  helado: [
    'Una capa de hielo de kilómetros cubre un mar escondido que nunca ha visto el sol.',
    'Glaciares azules y grietas tan profundas que el eco tarda minutos en volver.',
    'Escarcha fina como azúcar y un silencio que se puede oír desde la cápsula.',
  ],
  gaseoso: [
    'Un gigante de bandas lentas y tormentas del tamaño de continentes.',
    'Sus nubes giran en franjas de color que nunca se repiten del todo.',
    'Más que un planeta, un cielo sin suelo que se hunde en presión y calor.',
  ],
  jupiter_caliente: [
    'Un gigante que orbita pegado a su estrella; su cara nocturna brilla de puro calor.',
    'Vientos de miles de kilómetros por hora arrastran nubes de hierro vaporizado.',
    'Está tan cerca de su sol que su atmósfera se escapa en una cola tenue, como un cometa.',
  ],
  gigante_helado: [
    'Un gigante azul y sereno, de agua, amoníaco y metano bajo nubes altas.',
    'Su color frío esconde vientos supersónicos y un manto de hielos calientes.',
    'Desde lejos parece una canica de vidrio; de cerca, un océano de nubes sin fin.',
  ],
  mini_neptuno: [
    'Demasiado grande para ser rocoso y demasiado pequeño para ser gigante: un mundo de brumas.',
    'Una envoltura espesa de hidrógeno y vapor cubre lo que sea que haya debajo.',
    'Su cielo es una neblina pálida que difumina el sol en un halo enorme.',
  ],
};

const LEYENDAS = [
  'Se dice que, al pasar cerca, la radio de la nave capta una canción de cuna en un idioma desconocido.',
  'Un faro abandonado en {lugar} sigue emitiendo tres notas y un silencio.',
  'Los viejos registros hablan de una biblioteca enterrada en {lugar}, con libros que nadie ha abierto.',
  'Hay quien jura haber visto una sala de recreativas encendida en {lugar}, sin nadie dentro.',
  'Cuenta la bitácora que alguien dejó aquí una partida a medias, y que la ficha sigue en la casilla.',
  'Las lecturas muestran estructuras geométricas en {lugar}; el ordenador las clasifica como «probablemente nada».',
  'Su órbita es tan regular que la tripulación la usa para poner los relojes en hora.',
  'Aquí se proyectó una película al aire libre hace siglos; la pantalla, gigantesca, aún sigue en pie en {lugar}.',
  'Nadie ha aterrizado todavía. Quizá sea mejor así.',
  'En {lugar} hay una baliza con un mensaje grabado: «Volved cuando queráis. La puerta está abierta».',
  'Los sensores detectan cada noche, siempre a la misma hora, un destello breve en {lugar}.',
  'Una vieja guía de viaje lo describe como «ideal para leer sin prisa».',
];

const LUGARES = {
  rocoso: ['el fondo de un cañón', 'la cara oculta', 'un cráter polar'],
  desertico: ['las dunas del ecuador', 'un oasis de cristal', 'una meseta solitaria'],
  oceanico: ['la isla más pequeña', 'una fosa abisal', 'un arrecife luminoso'],
  archipielago: ['una isla sin nombre', 'el atolón del sur', 'una laguna turquesa'],
  vergel: ['un bosque de copas violetas', 'la desembocadura del gran río', 'un valle con niebla'],
  tundra: ['un lago helado', 'la llanura de los vientos', 'una colina de piedras apiladas'],
  pantanoso: ['un manglar sin fondo', 'una isla de juncos', 'la ciénaga mayor'],
  volcanico: ['la ladera del volcán mayor', 'una isla de roca fría', 'una cueva de obsidiana'],
  helado: ['el casquete norte', 'una grieta azul', 'un lago bajo el hielo'],
  gaseoso: ['la gran tormenta', 'la banda ecuatorial', 'una de sus lunas'],
  jupiter_caliente: ['el punto más caliente', 'la cara nocturna', 'su cola de gas'],
  gigante_helado: ['el polo que mira al sol', 'la mancha oscura', 'uno de sus anillos'],
  mini_neptuno: ['la capa de bruma alta', 'el borde del día', 'su luna mayor'],
};

const CONSEJOS = [
  'Recomendación del capitán: bajar despacio y con música.',
  'Recomendación del capitán: mirar el amanecer desde órbita al menos una vez.',
  'Recomendación del capitán: no tocar nada que brille.',
  'Recomendación del capitán: traer termo y manta.',
  'Recomendación del capitán: apuntar las coordenadas y volver otro día.',
  'Recomendación del capitán: ideal para una partida larga en la sala de juegos mientras orbitamos.',
  'Recomendación del capitán: poner una peli en la sala de proyección y dejar que el planeta gire de fondo.',
];

const RASGO_AURORA = ['Sus auroras {aurora} se ven desde la órbita como cortinas lentas.', 'De noche, los polos se encienden con auroras {aurora}.'];
const RASGO_RAYOS = ['Las tormentas eléctricas encienden sus nubes en destellos breves.', 'Desde la nave se ven relámpagos recorriendo la cara nocturna.'];
const RASGO_ANILLOS = ['Sus anillos proyectan una sombra fina sobre las nubes.', 'Un sistema de anillos lo rodea como un disco de vinilo.'];
const RASGO_MUCHAS_LUNAS = ['Lo acompaña un pequeño cortejo de {n} lunas.', 'Tiene {n} lunas, y cada una cuenta su propia historia.'];

function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }

/* ================================================================== */
/*  Física aproximada                                                   */
/* ================================================================== */

// radio (km), densidad (g/cm³), temperatura media (°C), día (h), habitabilidad base
const PHYS = {
  rocoso:           { r: [1500, 9000],    d: [3.4, 6.0], t: [-90, 140],  dia: [10, 90], hab: 15 },
  desertico:        { r: [2500, 9000],    d: [3.8, 5.6], t: [15, 85],    dia: [12, 60], hab: 35 },
  oceanico:         { r: [4000, 14000],   d: [2.4, 4.6], t: [2, 34],     dia: [14, 40], hab: 70 },
  archipielago:     { r: [4500, 11000],   d: [4.0, 5.8], t: [18, 32],    dia: [16, 36], hab: 85 },
  vergel:           { r: [4500, 10000],   d: [4.4, 5.8], t: [6, 26],     dia: [18, 40], hab: 95 },
  tundra:           { r: [3500, 9000],    d: [4.0, 5.6], t: [-45, 4],    dia: [14, 50], hab: 45 },
  pantanoso:        { r: [4500, 10000],   d: [4.0, 5.6], t: [16, 40],    dia: [16, 40], hab: 60 },
  volcanico:        { r: [2000, 12000],   d: [4.5, 8.0], t: [180, 520],  dia: [8, 70],  hab: 3 },
  helado:           { r: [1200, 8000],    d: [1.4, 2.6], t: [-220, -60], dia: [10, 80], hab: 8 },
  gaseoso:          { r: [40000, 90000],  d: [0.6, 1.6], t: [-180, -90], dia: [8, 16],  hab: 0 },
  jupiter_caliente: { r: [60000, 140000], d: [0.2, 0.9], t: [900, 2200], dia: [20, 120], hab: 0 },
  gigante_helado:   { r: [18000, 32000],  d: [1.1, 1.7], t: [-220, -190], dia: [13, 20], hab: 0 },
  mini_neptuno:     { r: [10000, 20000],  d: [0.8, 2.5], t: [-150, 60],  dia: [10, 30], hab: 2 },
};

const ATMOS = {
  rocoso: ['tenue de dióxido de carbono', 'casi inexistente', 'fina de argón'],
  desertico: ['seca de nitrógeno y polvo', 'de dióxido de carbono con tormentas de arena', 'fina y anaranjada'],
  oceanico: ['húmeda de nitrógeno y oxígeno', 'densa y nubosa', 'de vapor de agua y nitrógeno'],
  archipielago: ['cálida y húmeda, respirable', 'de nitrógeno y oxígeno, salada', 'tropical y limpia'],
  vergel: ['de nitrógeno y oxígeno, respirable', 'templada y húmeda, casi respirable', 'rica en oxígeno'],
  tundra: ['fría y seca, respirable con abrigo', 'de nitrógeno con poco oxígeno', 'limpia y cortante'],
  pantanoso: ['espesa, húmeda y rica en metano', 'de nitrógeno, vapor y esporas', 'cálida y cargada de electricidad'],
  volcanico: ['de azufre y ceniza', 'tóxica de dióxido de azufre', 'densa y ardiente'],
  helado: ['tenue de nitrógeno', 'de metano helado', 'casi inexistente'],
  gaseoso: ['de hidrógeno y helio', 'de hidrógeno, helio y metano', 'de hidrógeno con nubes de amoníaco'],
  jupiter_caliente: ['de hidrógeno con nubes de silicatos', 'abrasadora, con vapor de hierro', 'de hidrógeno y sodio ionizado'],
  gigante_helado: ['de hidrógeno, helio y metano', 'fría, con nubes de metano', 'de hidrógeno y hielos volátiles'],
  mini_neptuno: ['espesa de hidrógeno y vapor de agua', 'brumosa de hidrógeno y helio', 'de hidrógeno con neblina de hidrocarburos'],
};

function gravityLabel(g) {
  if (g < 0.12) return 'Casi ingrávido';
  if (g < 0.45) return 'Ligera';
  if (g < 0.8) return 'Suave';
  if (g < 1.25) return 'Terrestre';
  if (g < 2) return 'Intensa';
  if (g < 3.2) return 'Aplastante';
  return 'Extrema';
}

/* ================================================================== */
/*  Parámetros visuales                                                  */
/* ================================================================== */

const col = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))).getHex();
const AURORA_HUES = [[0.36, 'verdes'], [0.78, 'violetas'], [0.92, 'rosadas'], [0.5, 'turquesas']];

function baseVisual(tipo, rng) {
  return {
    type: SHADER_ID[tipo] ?? 0,
    seedOffset: [rng.range(-100, 100), rng.range(-100, 100), rng.range(-100, 100)],
    freq: rng.range(1.2, 2.4), octaves: 6, warp: rng.range(0.15, 0.6), sea: -1,
    colors: [], ice: 0, iceColor: col(0.58, 0.25, 0.92), emissive: 0x000000, lava: 0,
    bands: 0, bandWarp: 0, spot: 0, spotDir: [0, 1, 0], swirl: 0, thermal: 0, haze: 0,
    bump: rng.range(0.6, 1.4), spec: 0.6, ambient: 0.02,
    atmoColor: 0x8899ff, atmoStrength: 0.6, clouds: 0, cloudColor: 0xffffff, cloudScale: 2.5,
    aurora: 0, auroraColor: 0x66ffaa, auroraNombre: '', lightning: 0,
    rings: null, spin: rng.range(0.03, 0.12), tilt: rng.range(-0.45, 0.45),
  };
}

function visualFor(tipo, rng, isMoon = false) {
  const v = baseVisual(tipo, rng);
  const exotic = rng.chance(0.22); // tonos púrpura/raros de vez en cuando
  const hShift = exotic ? rng.range(0.55, 0.85) : 0;
  const H = (h) => h + hShift;
  switch (tipo) {
    case 'rocoso': {
      const h = H(rng.range(0.02, 0.12));
      v.colors = [col(h, 0.2, 0.15), col(h, 0.2, 0.25), col(h, rng.range(0.1, 0.3), 0.28), col(h + 0.02, 0.18, 0.4), col(h, 0.12, 0.55), col(h, 0.06, 0.72)];
      v.ice = rng.chance(0.4) ? rng.range(0.05, 0.15) : 0; v.atmoColor = col(H(0.6), 0.3, 0.7); v.atmoStrength = rng.range(0.12, 0.4);
      v.freq = rng.range(1.8, 3.2); v.bump = rng.range(1.2, 2.0);
      break;
    }
    case 'desertico': {
      const h = H(rng.range(0.04, 0.11));
      v.colors = [col(h, 0.5, 0.2), col(h, 0.5, 0.3), col(h, 0.55, 0.42), col(h + 0.02, 0.6, 0.55), col(h + 0.03, 0.5, 0.66), col(h + 0.04, 0.35, 0.8)];
      v.sea = rng.chance(0.25) ? rng.range(0.2, 0.32) : -1;
      if (v.sea > 0) { v.colors[0] = col(0.52, 0.5, 0.18); v.colors[1] = col(0.48, 0.5, 0.38); }
      v.ice = rng.chance(0.3) ? rng.range(0.03, 0.08) : 0; v.atmoColor = col(h + 0.02, 0.6, 0.65); v.atmoStrength = rng.range(0.5, 0.9);
      v.clouds = rng.chance(0.3) ? rng.range(0.15, 0.3) : 0; v.cloudColor = col(h, 0.4, 0.85);
      v.dunes = 1;
      break;
    }
    case 'oceanico': {
      const w = exotic ? rng.range(0.68, 0.78) : rng.range(0.53, 0.62), l = H(rng.range(0.08, 0.35));
      v.sea = rng.range(0.62, 0.74);
      v.colors = [col(w, 0.7, 0.14), col(w - 0.03, 0.65, 0.36), col(l, 0.35, 0.55), col(l, 0.45, 0.35), col(l, 0.3, 0.45), col(l, 0.1, 0.85)];
      v.ice = rng.range(0.08, 0.2); v.atmoColor = col(w, 0.7, 0.65); v.atmoStrength = rng.range(0.8, 1.2);
      v.clouds = rng.range(0.35, 0.6); v.spec = 1;
      break;
    }
    case 'archipielago': {
      const w = exotic ? rng.range(0.66, 0.74) : rng.range(0.48, 0.55), g = H(rng.range(0.22, 0.32));
      v.sea = rng.range(0.56, 0.64); v.freq = rng.range(2.6, 4.2); v.warp = rng.range(0.1, 0.3);
      v.colors = [col(w + 0.05, 0.7, 0.2), col(w - 0.02, 0.75, 0.52), col(0.12, 0.45, 0.72), col(g, 0.55, 0.32), col(g + 0.04, 0.45, 0.24), col(0.08, 0.2, 0.45)];
      v.ice = rng.range(0.0, 0.08); v.atmoColor = col(0.55, 0.7, 0.68); v.atmoStrength = rng.range(0.8, 1.1);
      v.clouds = rng.range(0.3, 0.48); v.spec = 1.1;
      break;
    }
    case 'vergel': {
      const w = exotic ? rng.range(0.68, 0.78) : rng.range(0.55, 0.63), g = H(rng.range(0.22, 0.38));
      v.sea = rng.range(0.42, 0.56);
      v.colors = [col(w, 0.65, 0.16), col(w - 0.04, 0.55, 0.38), col(g - 0.1, 0.45, 0.6), col(g, 0.5, 0.3), col(g + 0.03, 0.35, 0.22), col(0.08, 0.15, 0.5)];
      v.ice = rng.range(0.06, 0.16); v.atmoColor = col(w, 0.7, 0.68); v.atmoStrength = rng.range(0.8, 1.1);
      v.clouds = rng.range(0.4, 0.6); v.spec = 0.9;
      if (rng.chance(0.25)) { v.colors[3] = col(0.78, 0.4, 0.35); v.colors[4] = col(0.8, 0.35, 0.25); } // bosques violetas
      break;
    }
    case 'tundra': {
      const w = exotic ? rng.range(0.66, 0.74) : rng.range(0.56, 0.62), g = H(rng.range(0.1, 0.2));
      v.sea = rng.range(0.3, 0.45);
      v.colors = [col(w, 0.35, 0.14), col(w, 0.3, 0.3), col(g, 0.22, 0.42), col(g + 0.06, 0.25, 0.33), col(g, 0.12, 0.5), col(0.6, 0.1, 0.85)];
      v.ice = rng.range(0.3, 0.48); v.atmoColor = col(0.6, 0.45, 0.75); v.atmoStrength = rng.range(0.6, 0.9);
      v.clouds = rng.range(0.3, 0.5); v.spec = 0.6;
      break;
    }
    case 'pantanoso': {
      const w = exotic ? rng.range(0.8, 0.88) : rng.range(0.2, 0.3), g = H(rng.range(0.22, 0.3));
      v.sea = rng.range(0.47, 0.55); v.freq = rng.range(2.2, 3.4);
      v.colors = [col(w, 0.35, 0.12), col(w + 0.02, 0.3, 0.24), col(g, 0.35, 0.3), col(g + 0.04, 0.45, 0.2), col(g - 0.05, 0.3, 0.26), col(g, 0.15, 0.4)];
      v.atmoColor = col(0.3, 0.4, 0.65); v.atmoStrength = rng.range(0.8, 1.2);
      v.clouds = rng.range(0.5, 0.7); v.cloudColor = col(0.25, 0.08, 0.82); v.spec = 0.45; v.bump = rng.range(0.4, 0.9);
      break;
    }
    case 'volcanico': {
      const h = H(rng.range(0.0, 0.05));
      v.colors = [col(h, 0.1, 0.05), col(h, 0.1, 0.08), col(h, 0.15, 0.1), col(h, 0.12, 0.16), col(h, 0.1, 0.22), col(h, 0.08, 0.3)];
      v.emissive = exotic ? col(rng.range(0.75, 0.9), 1, 0.55) : col(rng.range(0.02, 0.09), 1, 0.55);
      v.lava = rng.range(1.0, 2.2); v.atmoColor = exotic ? col(0.82, 0.7, 0.5) : col(0.05, 0.8, 0.5); v.atmoStrength = rng.range(0.4, 0.8);
      v.freq = rng.range(1.6, 2.6); v.bump = rng.range(1.0, 1.8);
      v.clouds = rng.chance(0.4) ? rng.range(0.1, 0.25) : 0; v.cloudColor = 0x5a4a48;
      break;
    }
    case 'helado': {
      const h = H(rng.range(0.52, 0.6));
      v.colors = [col(h, 0.5, 0.25), col(h, 0.45, 0.45), col(h, 0.3, 0.7), col(h, 0.25, 0.8), col(h - 0.02, 0.2, 0.88), col(h, 0.1, 0.96)];
      v.sea = rng.chance(0.3) ? rng.range(0.2, 0.3) : -1;
      v.ice = rng.range(0.2, 0.4); v.iceColor = col(h, 0.15, 0.95); v.atmoColor = col(h, 0.5, 0.75); v.atmoStrength = rng.range(0.25, 0.6);
      v.spec = 0.5; v.bump = rng.range(0.5, 1.0); v.iceCracks = 1;
      break;
    }
    case 'gaseoso': {
      const h = exotic ? rng.range(0.68, 0.88) : rng.pick([rng.range(0.03, 0.12), rng.range(0.52, 0.64), rng.range(0.08, 0.14)]);
      const s = rng.range(0.3, 0.65);
      v.colors = [col(h - 0.04, s + 0.2, 0.35), col(h, s, 0.3), col(h + 0.03, s * 0.8, 0.5), col(h - 0.02, s * 0.6, 0.72), col(h + 0.06, s, 0.42), col(h, s * 0.4, 0.85)];
      v.bands = rng.range(10, 26); v.bandWarp = rng.range(0.05, 0.22);
      if (rng.chance(0.6)) setSpot(v, rng, 0.12, 0.28);
      v.atmoColor = col(h, s, 0.7); v.atmoStrength = rng.range(0.6, 1.0); v.spec = 0; v.bump = 0;
      v.spin = rng.range(0.08, 0.2); v.freq = rng.range(1.5, 2.5);
      break;
    }
    case 'jupiter_caliente': {
      const h = exotic ? rng.range(0.8, 0.95) : rng.range(0.0, 0.07);
      v.colors = [col(h, 0.8, 0.12), col(h, 0.6, 0.16), col(h + 0.02, 0.7, 0.28), col(h + 0.04, 0.6, 0.42), col(h, 0.5, 0.22), col(h + 0.06, 0.6, 0.58)];
      v.bands = rng.range(6, 12); v.bandWarp = rng.range(0.1, 0.3); v.swirl = rng.range(0.05, 0.2);
      v.thermal = rng.range(0.8, 1.6); v.emissive = col(h + 0.03, 1, 0.5);
      v.atmoColor = col(h + 0.04, 0.9, 0.55); v.atmoStrength = rng.range(1.0, 1.5); v.spec = 0; v.bump = 0;
      v.spin = rng.range(0.02, 0.05); v.freq = rng.range(1.2, 2.0);
      break;
    }
    case 'gigante_helado': {
      const h = exotic ? rng.range(0.7, 0.8) : rng.range(0.5, 0.6);
      const s = rng.range(0.35, 0.65);
      v.colors = [col(h + 0.03, s + 0.2, 0.25), col(h, s, 0.5), col(h - 0.01, s * 0.9, 0.56), col(h + 0.01, s * 0.7, 0.66), col(h - 0.02, s, 0.46), col(h, s * 0.4, 0.82)];
      v.bands = rng.range(4, 10); v.bandWarp = rng.range(0.03, 0.08);
      if (rng.chance(0.4)) setSpot(v, rng, 0.1, 0.18);
      v.atmoColor = col(h, 0.6, 0.72); v.atmoStrength = rng.range(0.8, 1.2); v.spec = 0; v.bump = 0;
      v.spin = rng.range(0.07, 0.14); v.freq = rng.range(1.2, 2.0); v.tilt = rng.chance(0.25) ? rng.range(1.2, 1.6) * (rng.chance(0.5) ? 1 : -1) : v.tilt;
      break;
    }
    case 'mini_neptuno': {
      const h = exotic ? rng.range(0.72, 0.85) : rng.pick([rng.range(0.45, 0.6), rng.range(0.6, 0.7), rng.range(0.1, 0.16)]);
      const s = rng.range(0.15, 0.35);
      v.colors = [col(h, s + 0.1, 0.42), col(h, s, 0.5), col(h + 0.03, s, 0.6), col(h - 0.03, s, 0.68), col(h + 0.02, s + 0.1, 0.46), col(h, s * 0.5, 0.8)];
      v.bands = rng.range(4, 9); v.bandWarp = rng.range(0.06, 0.16); v.haze = rng.range(0.15, 0.35);
      v.atmoColor = col(h, 0.4, 0.8); v.atmoStrength = rng.range(1.2, 1.6); v.spec = 0; v.bump = 0;
      v.spin = rng.range(0.05, 0.1);
      break;
    }
  }

  if (!isMoon) {
    // Auroras (necesitan atmósfera y magnetosfera)
    const auroraChance = { gaseoso: 0.6, gigante_helado: 0.55, jupiter_caliente: 0.2, mini_neptuno: 0.35, vergel: 0.45, oceanico: 0.45, archipielago: 0.35, tundra: 0.55, pantanoso: 0.3, helado: 0.25, desertico: 0.15, rocoso: 0.1, volcanico: 0.15 }[tipo] ?? 0;
    if (rng.chance(auroraChance)) {
      const [ah, an] = rng.pick(AURORA_HUES);
      v.aurora = rng.range(0.5, 1.0); v.auroraColor = col(ah, 0.9, 0.6); v.auroraNombre = an;
    }
    // Tormentas eléctricas
    const lightningChance = { gaseoso: 0.45, jupiter_caliente: 0.35, gigante_helado: 0.2, mini_neptuno: 0.2, pantanoso: 0.75, oceanico: 0.3, vergel: 0.2, archipielago: 0.3, volcanico: 0.3 }[tipo] ?? 0;
    if ((v.clouds > 0 || v.type === 6) && rng.chance(lightningChance)) v.lightning = rng.range(0.6, 1.0);

    // Anillos
    const ringChance = { gaseoso: 0.55, gigante_helado: 0.45, mini_neptuno: 0.15, helado: 0.15, jupiter_caliente: 0.02 }[tipo] ?? 0.07;
    if (rng.chance(ringChance)) {
      const icy = tipo === 'gigante_helado' || tipo === 'helado';
      const rh = rng.chance(0.3) ? rng.range(0.7, 0.85) : icy ? rng.range(0.5, 0.62) : rng.range(0.05, 0.14);
      v.rings = {
        inner: rng.range(1.25, 1.6), outer: rng.range(1.9, 2.7), opacity: rng.range(0.5, 0.9),
        colorA: col(rh, rng.range(0.15, 0.4), rng.range(0.55, 0.75)), colorB: col(rh + 0.04, rng.range(0.1, 0.3), rng.range(0.3, 0.45)),
        freq: rng.range(30, 90), tilt: rng.range(-0.12, 0.12),
        g: [rng(), rng(), rng(), rng(), rng(), rng()],
      };
      if (tipo === 'gigante_helado' && rng.chance(0.6)) { v.rings.opacity *= 0.45; v.rings.outer = v.rings.inner + rng.range(0.3, 0.6); } // anillos finos y oscuros
    }
  }
  return v;
}

function setSpot(v, rng, a, b) {
  v.spot = rng.range(a, b);
  const lat = rng.range(-0.5, 0.5), lon = rng.range(0, Math.PI * 2), c = Math.cos(lat);
  v.spotDir = [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)];
}

/* ================================================================== */
/*  Especificación pura (meta + visual)                                 */
/* ================================================================== */

const MOON_COUNT = {
  gaseoso: [[0, 1], [1, 1], [2, 2], [3, 2], [4, 3], [5, 3], [6, 2], [7, 2], [8, 2]],
  gigante_helado: [[0, 1], [1, 2], [2, 2], [3, 3], [4, 2], [5, 2], [6, 1]],
  jupiter_caliente: [[0, 6], [1, 1]],
  mini_neptuno: [[0, 3], [1, 3], [2, 2], [3, 1]],
};

function moonSpec(rng, planetName, i, tipoPlaneta, giant) {
  const tipo = rng.weighted([['rocoso', 6], ['helado', giant ? 6 : 2], ['volcanico', giant ? 2 : 0.7], ['desertico', 1], ['tundra', giant ? 0.6 : 0.3], ['oceanico', 0.25]]);
  const r = giant ? rng.range(0.04, 0.16) : rng.range(0.08, 0.27);
  const nombre = rng.chance(0.5) ? makeWord(rng, 2, 2) : `${planetName.split(' ')[0]} ${String.fromCharCode(98 + i)}`;
  return { nombre, tipo, radio: r, distancia: 0, periodo: 0, inclinacion: rng.range(-0.3, 0.3) + (rng.chance(0.08) ? rng.range(0.5, 1.2) : 0), fase: rng.range(0, Math.PI * 2), seed: Math.floor(rng() * 1e9).toString(36) };
}

/**
 * Especificación de un planeta sin crear nada en GPU.
 * opts: { tipo, zona, temperatura, lunas, acopladoMarea, contexto, civilizacion }
 */
export function planetSpec(seedIn, opts = {}) {
  const seed = normalizeSeed(seedIn);
  const tipo = resolveTipo(seed, opts);
  if (OWNER[tipo]) return OWNER[tipo].planetSpec(seed, { ...opts, tipo });

  const T = PLANET_TYPES[tipo];
  const P = PHYS[tipo];
  const rng = makeRng(seed, 'meta');
  const nombre = makePlanetName(rng);
  const designacion = `MKV-${rng.int(1000, 9999)}${rng.pick(['b', 'c', 'd', 'e', 'f'])}`;
  const sector = `${makeWord(rng, 2, 2)}-${rng.int(1, 12)}`;
  const gas = T.gas;

  const radioKm = Math.round(rng.range(...P.r));
  const densidad = +rng.range(...P.d).toFixed(2);
  const rRel = radioKm / 6371;
  const masaTierras = +((densidad / 5.514) * rRel ** 3).toFixed(rRel ** 3 * densidad > 50 ? 0 : 2);
  const gravedad = +((densidad / 5.514) * rRel).toFixed(2);
  const velocidadEscape = +(11.19 * Math.sqrt(((densidad / 5.514) * rRel ** 3) / rRel)).toFixed(1);
  const tRand = Math.round(rng.range(...P.t));
  const temperatura = Number.isFinite(opts.temperatura) ? Math.round(opts.temperatura) : tRand;
  const acopladoMarea = !!opts.acopladoMarea;
  const diaRand = +rng.range(...P.dia).toFixed(1);
  const periodoOrbital = opts.contexto?.periodoDias;
  const duracionDia = acopladoMarea ? +((periodoOrbital ?? rng.range(3, 40)) * 24).toFixed(1) : diaRand;

  let nLunas = rng.weighted(MOON_COUNT[tipo] ?? [[0, 5], [1, 4], [2, 2], [3, 1]]);
  if (Number.isFinite(opts.lunas)) nLunas = Math.max(0, Math.min(8, Math.round(opts.lunas)));

  const habBase = P.hab + rng.range(-8, 8);
  const tempFactor = gas ? 1 : Math.exp(-(((temperatura - 15) / 38) ** 2));
  const gravFactor = gas ? 1 : Math.exp(-(((Math.log2(Math.max(gravedad, 0.05))) / 1.6) ** 2));
  const habitabilidad = gas ? rng.int(0, 2) : Math.max(0, Math.min(99, Math.round(habBase * tempFactor * gravFactor)));
  const estado = rng.pick(['Sin explorar', 'Sin explorar', 'Observado desde órbita', 'Sondeado', 'Visitado una vez']);
  const atmosfera = rng.pick(ATMOS[tipo]);
  const giant = gas && tipo !== 'mini_neptuno';

  const lunas = [];
  for (let i = 0; i < nLunas; i++) lunas.push(moonSpec(rng, nombre, i, tipo, giant));

  // Visual (flujo aleatorio separado para que meta y aspecto no se pisen)
  const vrng = makeRng(seed, 'visual');
  const visual = visualFor(tipo, vrng);
  if (acopladoMarea) { visual.spin = 0; }

  // Lore
  const lunasTxt = nLunas === 0 ? 'nada que se vea' : nLunas === 1 ? 'su única luna' : `sus ${nLunas} lunas`;
  const vars = { ciclo: rng.int(212, 989), sonda: rng.pick(SONDAS), pulso: rng.int(3, 41), lugar: rng.pick(LUGARES[tipo]), lunasTxt, aurora: visual.auroraNombre, n: nLunas };
  const lore = [fill(rng.pick(ORIGEN), vars), fill(rng.pick(DESCR[tipo]), vars)];
  const rasgos = [];
  if (visual.aurora) rasgos.push(RASGO_AURORA);
  if (visual.lightning) rasgos.push(RASGO_RAYOS);
  if (visual.rings) rasgos.push(RASGO_ANILLOS);
  if (nLunas >= 4) rasgos.push(RASGO_MUCHAS_LUNAS);
  if (rasgos.length && rng.chance(0.75)) lore.push(fill(rng.pick(rng.pick(rasgos)), vars));
  if (opts.contexto?.estrella) {
    const c = opts.contexto;
    const dist = Number.isFinite(c.aUA) ? ` a ${c.aUA.toLocaleString('es-ES', { maximumFractionDigits: 2 })} UA` : '';
    lore.push(acopladoMarea ? `Orbita ${c.estrella}${dist} mostrándole siempre la misma cara.` : `Orbita ${c.estrella}${dist}${c.periodoDias ? `, con un año de ${Math.round(c.periodoDias).toLocaleString('es-ES')} días` : ''}.`);
  } else if (acopladoMarea) lore.push('Siempre muestra la misma cara a su estrella: un lado de día eterno y otro de noche sin fin.');
  lore.push(fill(rng.pick(LEYENDAS), vars));
  if (rng.chance(0.55)) lore.push(rng.pick(CONSEJOS));

  const etiquetas = [];
  if (!gas && masaTierras > 2 && masaTierras < 10) etiquetas.push('Supertierra');
  if (!gas && masaTierras < 0.05) etiquetas.push('Mundo enano');
  if (acopladoMarea) etiquetas.push('Acoplado por marea');
  if (visual.rings) etiquetas.push('Con anillos');
  if (visual.aurora) etiquetas.push('Auroras');
  if (visual.lightning) etiquetas.push('Tormentas eléctricas');

  const meta = {
    seed, nombre, designacion, sector, tipo, tipoNombre: T.nombre, origen: 'nucleo',
    radioKm, densidad, masaTierras, gravedad, gravedadDesc: gravityLabel(gravedad), velocidadEscape,
    temperatura, duracionDia, duracionDiaTexto: duracionDia >= 72 ? `${(duracionDia / 24).toLocaleString('es-ES', { maximumFractionDigits: 1 })} días` : `${duracionDia.toLocaleString('es-ES')} h`, acopladoMarea, atmosfera, habitabilidad, estado,
    lunas: [], anillos: !!visual.rings, auroras: !!visual.aurora, tormentasElectricas: !!visual.lightning,
    etiquetas, lore: lore.join(' '), loreFrases: lore,
    contexto: opts.contexto ?? null, civilizacion: opts.civilizacion ?? null,
  };

  // Lunas: órbitas en radios del planeta (planeta = 1)
  let dist = visual.rings ? visual.rings.outer + 0.45 : 1.75;
  visual.moons = lunas.map((m) => {
    dist += vrng.range(0.45, 0.85) + m.radio * 2;
    m.distancia = +dist.toFixed(2);
    m.periodo = +(Math.pow(dist, 1.5) * vrng.range(5, 8)).toFixed(1); // segundos de animación por vuelta
    const mv = visualFor(m.tipo, makeRng(m.seed, 'visual'), true);
    mv.clouds = 0; mv.atmoStrength *= 0.25; mv.octaves = 3; mv.bump *= 0.6; mv.freq *= 0.75; mv.spin = 0.02;
    meta.lunas.push({ nombre: m.nombre, tipo: m.tipo, tipoNombre: PLANET_TYPES[m.tipo].nombre, radioKm: Math.round(radioKm * m.radio), periodoDias: +(m.periodo * 1.7).toFixed(1), distanciaRadios: m.distancia });
    return { ...m, visual: mv };
  });
  return { meta, visual };
}

/* ================================================================== */
/*  GLSL                                                                */
/* ================================================================== */

/** Ruido simplex 3D (Ashima / Stefan Gustavson, MIT) + fbm. */
export const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p,int oct){
  float a=0.5,s=0.0,n=0.0;
  for(int i=0;i<8;i++){
    if(i>=oct)break;
    s+=a*snoise(p);n+=a;p=p*2.03+vec3(1.7,9.2,4.1);a*=0.5;
  }
  return s/n;
}
`;

/**
 * Altura del terreno (0..1) en el punto unitario n. Requiere NOISE_GLSL.
 * Es exactamente la que usa la superficie: úsala para colocar cosas solo en tierra (h > uSea).
 */
export const HEIGHT_GLSL = /* glsl */`
float planetHeight(vec3 n,vec3 seedOffset,float freq,float warp,int oct){
  vec3 p=n*freq+seedOffset;
  vec3 wv=vec3(snoise(p+vec3(1.7)),snoise(p+vec3(8.3)),snoise(p+vec3(3.1)));
  float h=fbm(p+wv*warp,oct)*0.5+0.5;
  return clamp((h-0.5)*1.6+0.5,0.0,1.0);
}
`;

const LIGHTNING_GLSL = /* glsl */`
float lightningAt(vec3 n,float t,float density){
  vec3 cell=floor(n*7.0);
  float slot=floor(t*2.5);
  float r=fract(sin(dot(cell+vec3(slot*0.37,slot*1.31,slot*0.71),vec3(12.9898,78.233,37.719)))*43758.5453);
  float on=step(1.0-0.006*density,r);
  float ph=fract(t*2.5);
  float flick=ph<0.08?1.0:(ph<0.14?0.15:(ph<0.22?0.7:0.0));
  vec3 c=normalize((cell+0.5)/7.0);
  float d=length(n-c);
  float jitter=fract(r*91.7);
  return on*flick*smoothstep(0.16+0.06*jitter,0.0,d);
}
`;

const SURFACE_VERT = /* glsl */`
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorld;
varying vec3 vT1;
varying vec3 vT2;
void main(){
  vObj=normalize(position);
  vec3 up=abs(vObj.y)>0.99?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0);
  vec3 t1=normalize(cross(up,vObj));
  vec3 t2=cross(vObj,t1);
  vT1=normalMatrix*t1;
  vT2=normalMatrix*t2;
  vNormalV=normalize(normalMatrix*normal);
  vec4 w=modelMatrix*vec4(position,1.0);
  vWorld=w.xyz;
  vec4 mv=viewMatrix*w;
  vViewPos=mv.xyz;
  gl_Position=projectionMatrix*mv;
}`;

const SURFACE_FRAG = /* glsl */`
uniform int uType;
uniform vec3 uSeedOffset;
uniform float uFreq;
uniform int uOctaves;
uniform float uWarp;
uniform float uSea;
uniform vec3 uColors[6];
uniform float uIce;
uniform vec3 uIceColor;
uniform vec3 uEmissive;
uniform float uLava;
uniform float uDunes;
uniform float uIceCracks;
uniform float uCity;
uniform float uCityThr;
uniform vec3 uCityColor;
uniform float uBands;
uniform float uBandWarp;
uniform float uSwirl;
uniform float uThermal;
uniform float uHaze;
uniform float uSpot;
uniform vec3 uSpotDir;
uniform float uBump;
uniform float uSpec;
uniform float uAmbient;
uniform vec3 uAtmoColor;
uniform float uAtmoStrength;
uniform float uAurora;
uniform vec3 uAuroraColor;
uniform float uLightning;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uTime;
uniform float uRingOn;
uniform vec3 uRingCenter;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
uniform float uRingOpacity;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vWorld;
varying vec3 vT1;
varying vec3 vT2;
${NOISE_GLSL}
${HEIGHT_GLSL}
${LIGHTNING_GLSL}
vec3 ramp4(vec3 a,vec3 b,vec3 c,vec3 d,float t){
  t=clamp(t,0.0,1.0);
  if(t<0.33)return mix(a,b,t/0.33);
  if(t<0.66)return mix(b,c,(t-0.33)/0.33);
  return mix(c,d,(t-0.66)/0.34);
}
void main(){
  vec3 n=normalize(vObj);
  vec3 p=n*uFreq+uSeedOffset;
  vec3 col;float h=0.0;float specMask=0.0;vec3 emis=vec3(0.0);float cap=0.0;float land=0.0;
  bool gas=uType==6;
  if(gas){
    float w=fbm(vec3(n.x*1.5,n.y*7.0,n.z*1.5)*uFreq+uSeedOffset+vec3(uTime*0.004,0.0,0.0),5);
    float lat=n.y+w*uBandWarp;
    if(uSwirl>0.0)lat+=fbm(n*uFreq*0.9+uSeedOffset+vec3(0.0,0.0,uTime*0.003),4)*uSwirl;
    float sd=distance(n,uSpotDir);
    if(uSpot>0.0){
      float s=smoothstep(uSpot*1.6,0.0,sd);
      lat+=s*sin(sd*45.0-uTime*0.2)*0.025;
    }
    float b=0.5+0.5*sin(lat*uBands);
    float b2=0.5+0.5*sin(lat*uBands*2.37+1.7);
    float t=clamp(b*0.6+b2*0.3+w*0.25+0.05,0.0,1.0);
    col=ramp4(uColors[1],uColors[2],uColors[3],uColors[5],t);
    col=mix(col,uColors[4],smoothstep(0.55,0.95,b2)*0.35);
    if(uSpot>0.0){
      float core=smoothstep(uSpot,uSpot*0.25,sd);
      col=mix(col,uColors[0],core*0.85);
    }
    if(uHaze>0.0)col=mix(col,uColors[5],uHaze*0.35);
    if(uThermal>0.0)emis=uEmissive*uThermal*(0.35+0.65*t)*(0.85+0.15*sin(uTime*0.3+lat*20.0));
    h=t;
  }else{
    vec3 wv=vec3(snoise(p+vec3(1.7)),snoise(p+vec3(8.3)),snoise(p+vec3(3.1)));
    h=planetHeight(n,uSeedOffset,uFreq,uWarp,uOctaves);
    if(uSea>0.0&&h<uSea){
      float depth=(uSea-h)/uSea;
      col=mix(uColors[1],uColors[0],smoothstep(0.0,0.35,depth));
      specMask=1.0;
    }else{
      float s0=max(uSea,0.0);
      float t=(h-s0)/(1.0-s0);
      col=ramp4(uColors[2],uColors[3],uColors[4],uColors[5],t);
      land=1.0;
    }
    if(uDunes>0.0){
      float d=sin(dot(n,normalize(vec3(0.3,1.0,0.2)))*90.0+snoise(p*3.0)*4.0);
      col*=1.0-uDunes*(0.07-0.07*d);
    }
    if(uLava>0.0){
      float r=pow(1.0-abs(snoise(p*1.8+wv*0.6)),9.0);
      float r2=pow(1.0-abs(snoise(p*4.5+vec3(5.0))),14.0);
      float c=clamp(max(r,r2*0.8)*smoothstep(0.75,0.35,h)*1.4,0.0,1.0);
      float pulse=0.85+0.15*sin(uTime*0.8+h*20.0);
      emis=uEmissive*c*uLava*pulse;
      col=mix(col,col*0.3,c);
    }
    if(uIceCracks>0.0){
      float r=pow(1.0-abs(snoise(p*3.0+wv)),14.0);
      col=mix(col,uColors[1],r*0.7*uIceCracks);
    }
    if(uIce>0.0){
      float lat=abs(n.y)+snoise(p*2.5)*0.06+(land*(h-max(uSea,0.0)))*0.25;
      cap=smoothstep(1.0-uIce,1.0-uIce+0.03,lat);
      col=mix(col,uIceColor,cap);
      specMask*=1.0-cap;
    }
  }
  vec3 N=normalize(vNormalV);
  vec3 Nb=N;
  if(uBump>0.0&&!gas){
    vec3 up=abs(n.y)>0.99?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0);
    vec3 t1=normalize(cross(up,n));vec3 t2=cross(n,t1);
    int bo=max(uOctaves-1,2);
    float sl=max(uSea,0.0);
    float e=0.0025;
    float hb0=max(planetHeight(n,uSeedOffset,uFreq,uWarp,bo),sl);
    float hb1=max(planetHeight(normalize(n+t1*e),uSeedOffset,uFreq,uWarp,bo),sl);
    float hb2=max(planetHeight(normalize(n+t2*e),uSeedOffset,uFreq,uWarp,bo),sl);
    vec2 g=vec2(hb1-hb0,hb2-hb0)/e;
    Nb=normalize(N-uBump*0.035*(g.x*normalize(vT1)+g.y*normalize(vT2)));
  }
  vec3 Lw=normalize(uLightDir);
  vec3 L=normalize((viewMatrix*vec4(Lw,0.0)).xyz);
  vec3 V=normalize(-vViewPos);
  float ndl=dot(N,L);
  float diff=max(dot(Nb,L),0.0)*smoothstep(-0.05,0.2,ndl);
  // Sombra de los anillos sobre la superficie
  float ringShadow=0.0;
  if(uRingOn>0.5){
    float den=dot(Lw,uRingNormal);
    if(abs(den)>1e-4){
      float tt=dot(uRingCenter-vWorld,uRingNormal)/den;
      if(tt>0.0){
        float rr=length(vWorld+Lw*tt-uRingCenter);
        float band=smoothstep(uRingInner,uRingInner+0.05*(uRingOuter-uRingInner),rr)*smoothstep(uRingOuter,uRingOuter-0.08*(uRingOuter-uRingInner),rr);
        ringShadow=band*uRingOpacity*(0.55+0.25*sin(rr*60.0));
      }
    }
  }
  diff*=1.0-0.75*ringShadow;
  vec3 lit=col*(diff*1.1*uLightColor+uAmbient);
  vec3 Hh=normalize(L+V);
  float sp=pow(max(dot(N,Hh),0.0),70.0)*specMask*uSpec*step(0.0,ndl)*(1.0-ringShadow);
  lit+=uLightColor*sp*0.55;
  float night=1.0-smoothstep(-0.12,0.12,ndl);
  if(uCity>0.0&&!gas){
    float cn=snoise(p*9.0)*0.5+0.5;
    float cn2=snoise(p*38.0)*0.5+0.5;
    float cm=smoothstep(uCityThr,uCityThr+0.15,cn)*smoothstep(0.5,0.75,cn2)*land*(1.0-cap)*smoothstep(0.0,0.08,h-max(uSea,0.0));
    lit+=uCityColor*cm*night*uCity;
  }
  lit+=emis*(0.45+0.75*night);
  if(uLightning>0.0&&gas){
    float fl=lightningAt(n,uTime,uLightning);
    lit+=vec3(0.75,0.8,1.0)*fl*(0.25+1.2*night)*uLightning;
  }
  if(uAurora>0.0){
    float al=abs(n.y);
    float ang=atan(n.z,n.x);
    float band=smoothstep(0.72,0.84,al)*smoothstep(0.98,0.88,al);
    float wav=0.55+0.45*sin(ang*7.0+uTime*0.5+snoise(n*4.0+vec3(uTime*0.08))*3.0);
    lit+=uAuroraColor*uAurora*band*wav*(0.15+0.85*night)*0.9;
  }
  float fres=pow(1.0-max(dot(N,V),0.0),3.0);
  lit+=uAtmoColor*fres*uAtmoStrength*smoothstep(-0.25,0.5,ndl)*uLightColor;
  gl_FragColor=vec4(lit,1.0);
  #include <colorspace_fragment>
}`;

const ATMO_VERT = /* glsl */`
varying vec3 vNormalV;varying vec3 vViewPos;varying vec3 vWorldN;varying vec3 vObjN;
void main(){
  vObjN=normalize(normal);
  vNormalV=normalize(normalMatrix*normal);
  vWorldN=normalize(mat3(modelMatrix)*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.0);vViewPos=mv.xyz;
  gl_Position=projectionMatrix*mv;
}`;
const ATMO_FRAG = /* glsl */`
uniform vec3 uAtmoColor;uniform float uAtmoStrength;uniform vec3 uLightDir;uniform vec3 uLightColor;uniform float uLimb;
uniform float uAurora;uniform vec3 uAuroraColor;uniform float uTime;
varying vec3 vNormalV;varying vec3 vViewPos;varying vec3 vWorldN;varying vec3 vObjN;
void main(){
  vec3 V=normalize(-vViewPos);
  float x=-dot(normalize(vNormalV),V);
  float i=pow(clamp(x/uLimb,0.0,1.0),2.2);
  i*=smoothstep(1.25,0.9,x/uLimb);
  float light=smoothstep(-0.35,0.55,dot(normalize(vWorldN),normalize(uLightDir)));
  vec3 c=uAtmoColor*uLightColor*i*light*uAtmoStrength;
  if(uAurora>0.0){
    float al=abs(normalize(vObjN).y);
    float band=smoothstep(0.7,0.85,al)*smoothstep(1.0,0.9,al);
    float wav=0.6+0.4*sin(atan(vObjN.z,vObjN.x)*6.0+uTime*0.7);
    c+=uAuroraColor*uAurora*band*wav*i*(1.0-0.6*light)*1.3;
  }
  gl_FragColor=vec4(c,1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_FRAG = /* glsl */`
uniform vec3 uSeedOffset;uniform float uCover;uniform vec3 uCloudColor;uniform vec3 uLightDir;uniform vec3 uLightColor;uniform float uTime;uniform float uScale;uniform float uLightning;
varying vec3 vObj;varying vec3 vNormalV;varying vec3 vViewPos;
${NOISE_GLSL}
${LIGHTNING_GLSL}
void main(){
  vec3 n=normalize(vObj);
  vec3 p=n*uScale+uSeedOffset*0.7+vec3(0.0,0.0,uTime*0.01);
  vec3 w=vec3(snoise(p*0.7),snoise(p*0.7+5.2),snoise(p*0.7+9.1));
  float c=fbm(vec3(p.x,p.y*1.6,p.z)+w*0.35,5)*0.5+0.5;
  float a=smoothstep(1.0-uCover,1.0-uCover+0.22,c);
  vec3 N=normalize(vNormalV);
  vec3 L=normalize((viewMatrix*vec4(uLightDir,0.0)).xyz);
  float d=dot(N,L);
  float lit=max(d,0.0)*0.95+0.03;
  a*=smoothstep(-0.35,0.1,d)*0.9+0.1;
  vec3 colr=uCloudColor*lit*uLightColor;
  if(uLightning>0.0){
    float fl=lightningAt(n,uTime,uLightning)*smoothstep(0.3,0.7,c);
    float night=1.0-smoothstep(-0.15,0.1,d);
    colr+=vec3(0.8,0.85,1.0)*fl*(0.3+1.4*night)*uLightning;
    a=max(a,fl*0.8);
  }
  gl_FragColor=vec4(colr,a*0.92);
  #include <colorspace_fragment>
}`;

const RING_VERT = /* glsl */`
varying vec3 vLocal;varying vec3 vWorld;
void main(){
  vLocal=position;
  vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const RING_FRAG = /* glsl */`
uniform float uInner;uniform float uOuter;uniform float uOpacity;uniform vec3 uColorA;uniform vec3 uColorB;
uniform float uFreq;uniform float uG[6];uniform vec3 uLightDir;uniform vec3 uLightColor;uniform vec3 uCenter;uniform float uRadius;uniform vec3 uNormalW;
varying vec3 vLocal;varying vec3 vWorld;
float h1(float x){return fract(sin(x*127.1)*43758.5453);}
float vn(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(h1(i),h1(i+1.0),f);}
void main(){
  float r=length(vLocal.xy);
  float t=(r-uInner)/(uOuter-uInner);
  if(t<0.0||t>1.0)discard;
  float d=vn(t*uFreq+uG[0]*50.0)*0.6+vn(t*uFreq*3.1+uG[1]*50.0)*0.3+vn(t*uFreq*9.0)*0.1;
  float gaps=1.0;
  gaps*=1.0-0.85*smoothstep(0.012,0.0,abs(t-(0.25+uG[2]*0.5)));
  gaps*=1.0-0.7*smoothstep(0.02,0.0,abs(t-(0.15+uG[3]*0.7)));
  gaps*=1.0-0.5*smoothstep(0.008,0.0,abs(t-(0.1+uG[4]*0.8)));
  float edge=smoothstep(0.0,0.06,t)*smoothstep(1.0,0.9,t);
  float a=clamp(d*1.3-0.15,0.0,1.0)*gaps*edge*uOpacity;
  vec3 c=mix(uColorB,uColorA,smoothstep(0.2,0.8,vn(t*uFreq*0.35+uG[5]*30.0)));
  vec3 L=normalize(uLightDir);
  vec3 oc=vWorld-uCenter;
  float b=dot(oc,L);float cc=dot(oc,oc)-uRadius*uRadius;float disc=b*b-cc;
  float shadow=(disc>0.0&&b<0.0)?smoothstep(0.0,uRadius*uRadius*0.08,disc):0.0;
  float lit=0.35+0.65*abs(dot(normalize(uNormalW),L));
  c*=lit*(1.0-0.85*shadow)*uLightColor;
  gl_FragColor=vec4(c,a);
  #include <colorspace_fragment>
}`;

/* ================================================================== */
/*  Construcción Three.js                                               */
/* ================================================================== */

const DETAIL = { alta: { seg: 128, oct: 7 }, media: { seg: 64, oct: 5 }, baja: { seg: 32, oct: 3 } };

function surfaceMaterial(v, shared, octaves) {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    uniforms: {
      uType: { value: v.type },
      uSeedOffset: { value: new THREE.Vector3(...v.seedOffset) },
      uFreq: { value: v.freq },
      uOctaves: { value: Math.max(2, Math.min(octaves, v.octaves + 1)) },
      uWarp: { value: v.warp },
      uSea: { value: v.sea },
      uColors: { value: v.colors.map((c) => new THREE.Color(c)) },
      uIce: { value: v.ice },
      uIceColor: { value: new THREE.Color(v.iceColor) },
      uEmissive: { value: new THREE.Color(v.emissive) },
      uLava: { value: v.lava },
      uDunes: { value: v.dunes ?? 0 },
      uIceCracks: { value: v.iceCracks ?? 0 },
      uCity: { value: 0 },
      uCityThr: { value: 0.6 },
      uCityColor: { value: new THREE.Color(0xffc477) },
      uBands: { value: v.bands },
      uBandWarp: { value: v.bandWarp },
      uSwirl: { value: v.swirl },
      uThermal: { value: v.thermal },
      uHaze: { value: v.haze },
      uSpot: { value: v.spot },
      uSpotDir: { value: new THREE.Vector3(...v.spotDir).normalize() },
      uBump: { value: v.bump },
      uSpec: { value: v.spec },
      uAmbient: { value: v.ambient },
      uAtmoColor: { value: new THREE.Color(v.atmoColor) },
      uAtmoStrength: { value: v.atmoStrength },
      uAurora: { value: v.aurora },
      uAuroraColor: { value: new THREE.Color(v.auroraColor) },
      uLightning: { value: v.lightning },
      uLightDir: { value: shared.lightDir },
      uLightColor: { value: shared.lightColor },
      uTime: shared.time,
      uRingOn: { value: 0 },
      uRingCenter: { value: new THREE.Vector3() },
      uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
      uRingInner: { value: 1 },
      uRingOuter: { value: 2 },
      uRingOpacity: { value: 0 },
    },
  });
}

/**
 * Genera un planeta completo a partir de una semilla.
 * opts: { radius=1, detail='alta'|'media'|'baja', lightDirection, lightColor, moons=true,
 *         tipo, zona, temperatura, lunas, acopladoMarea, contexto, civilizacion }
 */
export function generatePlanet(seedIn, opts = {}) {
  const seed = normalizeSeed(seedIn);
  const tipo = resolveTipo(seed, opts);
  if (OWNER[tipo]) {
    const h = OWNER[tipo].generatePlanet(seed, { ...opts, tipo });
    // Compatibilidad: garantizamos los campos mínimos aunque el módulo externo no los tenga
    if (!h.lightColor) h.lightColor = new THREE.Color(1, 1, 1);
    if (!h.setLightColor) h.setLightColor = (c) => h.lightColor.set(c);
    return h;
  }

  const { meta, visual } = planetSpec(seed, { ...opts, tipo });
  const detail = DETAIL[opts.detail] || DETAIL.alta;
  const radius = opts.radius ?? 1;
  const shared = {
    lightDir: (opts.lightDirection ? opts.lightDirection.clone() : new THREE.Vector3(1, 0.3, 0.3)).normalize(),
    lightColor: new THREE.Color(opts.lightColor ?? 0xffffff),
    time: { value: 0 },
  };
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  const group = new THREE.Group();
  group.name = `planeta:${meta.seed}`;
  group.scale.setScalar(radius);
  group.userData.meta = meta;

  const tilt = new THREE.Group();
  tilt.rotation.z = visual.tilt;
  group.add(tilt);

  // Cuerpo
  const bodyGeo = track(new THREE.SphereGeometry(1, detail.seg, Math.round(detail.seg / 2)));
  const bodyMat = track(surfaceMaterial(visual, shared, detail.oct));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'superficie';
  body.rotation.y = makeRng(meta.seed, 'rot')() * Math.PI * 2;
  tilt.add(body);

  // Nubes
  let clouds = null;
  if (visual.clouds > 0) {
    const cGeo = track(new THREE.SphereGeometry(1.012, detail.seg, Math.round(detail.seg / 2)));
    const cMat = track(new THREE.ShaderMaterial({
      vertexShader: SURFACE_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uSeedOffset: { value: new THREE.Vector3(...visual.seedOffset) }, uCover: { value: visual.clouds },
        uCloudColor: { value: new THREE.Color(visual.cloudColor) }, uLightDir: { value: shared.lightDir }, uLightColor: { value: shared.lightColor },
        uTime: shared.time, uScale: { value: visual.cloudScale }, uLightning: { value: visual.lightning },
      },
    }));
    clouds = new THREE.Mesh(cGeo, cMat);
    clouds.name = 'nubes';
    clouds.renderOrder = 1;
    tilt.add(clouds);
  }

  // Atmósfera
  const shell = visual.type === 6 ? 1.08 : 1.12;
  const aGeo = track(new THREE.SphereGeometry(shell, 64, 32));
  const aMat = track(new THREE.ShaderMaterial({
    vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uAtmoColor: { value: new THREE.Color(visual.atmoColor) }, uAtmoStrength: { value: visual.atmoStrength * 1.4 },
      uLightDir: { value: shared.lightDir }, uLightColor: { value: shared.lightColor }, uLimb: { value: Math.sqrt(1 - 1 / (shell * shell)) },
      uAurora: { value: visual.aurora }, uAuroraColor: { value: new THREE.Color(visual.auroraColor) }, uTime: shared.time,
    },
  }));
  const atmo = new THREE.Mesh(aGeo, aMat);
  atmo.name = 'atmosfera';
  tilt.add(atmo);

  // Anillos
  let rings = null, ringMat = null;
  if (visual.rings) {
    const R = visual.rings;
    const rGeo = track(new THREE.RingGeometry(R.inner, R.outer, 192, 1));
    ringMat = track(new THREE.ShaderMaterial({
      vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uInner: { value: R.inner }, uOuter: { value: R.outer }, uOpacity: { value: R.opacity },
        uColorA: { value: new THREE.Color(R.colorA) }, uColorB: { value: new THREE.Color(R.colorB) },
        uFreq: { value: R.freq }, uG: { value: R.g }, uLightDir: { value: shared.lightDir }, uLightColor: { value: shared.lightColor },
        uCenter: { value: new THREE.Vector3() }, uRadius: { value: radius }, uNormalW: { value: new THREE.Vector3(0, 1, 0) },
      },
    }));
    rings = new THREE.Mesh(rGeo, ringMat);
    rings.name = 'anillos';
    rings.rotation.x = -Math.PI / 2 + R.tilt;
    rings.renderOrder = 2;
    tilt.add(rings);
    bodyMat.uniforms.uRingOn.value = 1;
    bodyMat.uniforms.uRingOpacity.value = R.opacity;
  }

  // Lunas
  const moons = [];
  if (opts.moons !== false) {
    for (const m of visual.moons) {
      const pivot = new THREE.Group();
      pivot.rotation.z = m.inclinacion + visual.tilt * 0.5;
      const orbit = new THREE.Group();
      orbit.rotation.y = m.fase;
      pivot.add(orbit);
      const seg = Math.max(24, detail.seg / 2);
      const mGeo = track(new THREE.SphereGeometry(m.radio, seg, Math.max(12, seg / 2)));
      const mMat = track(surfaceMaterial(m.visual, shared, Math.min(detail.oct, 4)));
      const mesh = new THREE.Mesh(mGeo, mMat);
      mesh.name = `luna:${m.nombre}`;
      mesh.position.x = m.distancia;
      orbit.add(mesh);
      group.add(pivot);
      moons.push({ orbit, mesh, speed: (Math.PI * 2) / m.periodo });
    }
  }

  let sunPosition = null;
  const tmpC = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function setLightDirection(dir) { shared.lightDir.copy(dir).normalize(); }
  function setSunPosition(pos) { sunPosition = pos ? pos.clone() : null; }
  function setLightColor(c) { shared.lightColor.set(c); }

  function update(dt = 1 / 60) {
    shared.time.value += dt;
    body.rotation.y += visual.spin * dt;
    if (clouds) clouds.rotation.y += (visual.spin * 1.25 + 0.004) * dt;
    for (const m of moons) { m.orbit.rotation.y += m.speed * dt; m.mesh.rotation.y += dt * 0.05; }
    group.getWorldPosition(tmpC);
    if (sunPosition) shared.lightDir.copy(sunPosition).sub(tmpC).normalize();
    if (ringMat) {
      group.getWorldScale(tmpS);
      rings.getWorldQuaternion(tmpQ);
      tmpN.set(0, 0, 1).applyQuaternion(tmpQ);
      ringMat.uniforms.uCenter.value.copy(tmpC);
      ringMat.uniforms.uRadius.value = tmpS.x;
      ringMat.uniforms.uNormalW.value.copy(tmpN);
      const u = bodyMat.uniforms;
      u.uRingCenter.value.copy(tmpC);
      u.uRingNormal.value.copy(tmpN);
      u.uRingInner.value = visual.rings.inner * tmpS.x;
      u.uRingOuter.value = visual.rings.outer * tmpS.x;
    }
  }
  update(0);

  function dispose() {
    group.removeFromParent();
    for (const d of disposables) d.dispose();
    disposables.length = 0;
  }

  return {
    group, mesh: body, meta, visual, uniforms: bodyMat.uniforms,
    update, setLightDirection, setSunPosition, setLightColor,
    lightDirection: shared.lightDir, lightColor: shared.lightColor, dispose,
  };
}
