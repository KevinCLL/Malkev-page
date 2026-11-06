// planetas.js · Generador de planetas procedurales de La Malkevnia
// Módulo ES autocontenido. Depende solo de 'three' (probado con three@0.160.0
// vía importmap). Todo es determinista: la misma semilla da siempre el mismo
// planeta, con el mismo nombre, lore, colores, lunas y anillos.
//
// API pública (ver README.md):
//   planetSpec(seed)              -> { meta, visual }   datos puros, sin Three.js
//   generatePlanet(seed, opts)    -> { group, mesh, meta, update, setLightDirection, setSunPosition, dispose }
//   randomSeed()                  -> semilla nueva (string base36)
//   normalizeSeed(seed)           -> semilla saneada (a-z, 0-9, guiones)
//   PLANET_TYPES                  -> catálogo de tipos

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Aleatoriedad determinista                                          */
/* ------------------------------------------------------------------ */

function hashString(str) {
  // cyrb53 reducido a 32 bits
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

function makeRng(seed, salt = '') {
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
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'malkevnia';
}

export function randomSeed() {
  let s = '';
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(7);
  (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = Math.random() * 2 ** 32)));
  for (const v of buf) s += chars[v % chars.length];
  return s;
}

/* ------------------------------------------------------------------ */
/*  Catálogo de tipos                                                   */
/* ------------------------------------------------------------------ */

export const PLANET_TYPES = {
  rocoso:    { id: 0, nombre: 'Mundo rocoso',      peso: 16 },
  desertico: { id: 1, nombre: 'Mundo desértico',   peso: 13 },
  oceanico:  { id: 2, nombre: 'Mundo oceánico',    peso: 12 },
  vergel:    { id: 3, nombre: 'Vergel templado',   peso: 12 },
  volcanico: { id: 4, nombre: 'Mundo volcánico',   peso: 12 },
  helado:    { id: 5, nombre: 'Mundo helado',      peso: 13 },
  gaseoso:   { id: 6, nombre: 'Gigante gaseoso',   peso: 18 },
};

/* ------------------------------------------------------------------ */
/*  Nombres                                                             */
/* ------------------------------------------------------------------ */

const ONSETS = ['k', 'v', 'th', 'z', 's', 'm', 'n', 'l', 'r', 'd', 't', 'g', 'br', 'kr', 'dr', 'x', 'y', 'f', 'h', 'qu', 'sh', 'c', 'b', 'p', 'tr', 'vr', 'ss', 'ç'];
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'o', 'ae', 'ia', 'io', 'ei', 'au', 'y'];
const CODAS = ['', '', '', '', 'n', 'r', 's', 'l', 'th', 'x', 'm', 'nd', 'rn', 'sk', 'z'];
const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'IX'];

function makeWord(rng, minSyl = 2, maxSyl = 3) {
  const n = rng.int(minSyl, maxSyl);
  let w = '';
  for (let i = 0; i < n; i++) {
    const onset = i === 0 ? (rng.chance(0.85) ? rng.pick(ONSETS) : '') : rng.pick(ONSETS.filter(o => o !== 'ç'));
    const coda = i === n - 1 ? rng.pick(CODAS) : (rng.chance(0.3) ? rng.pick(['n', 'r', 'l', 's']) : '');
    w += onset + rng.pick(VOWELS) + coda;
  }
  w = w.replace(/(.)\1\1+/g, '$1$1').replace(/^ç/, 's');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function makePlanetName(rng) {
  const base = makeWord(rng, 2, 3);
  const suf = rng.weighted([['', 40], [' Prime', 10], ['roman', 18], [' Menor', 8], [' Mayor', 8], ['guion', 10], [' de los Vientos', 2], [' Silente', 2], [' Lejano', 2]]);
  if (suf === 'roman') return `${base} ${rng.pick(ROMAN)}`;
  if (suf === 'guion') return `${base}-${makeWord(rng, 1, 1)}`;
  return base + suf;
}

/* ------------------------------------------------------------------ */
/*  Lore                                                                */
/* ------------------------------------------------------------------ */

const SONDAS = ['Lirio', 'Paciencia', 'Farolillo', 'Vigía-3', 'Marea Lenta', 'Cometa Azul', 'Grulla', 'Errante'];
const ORIGEN = [
  'Catalogado por primera vez en el ciclo {ciclo} por la sonda {sonda}.',
  'Las cartas estelares de La Malkevnia lo marcan con un círculo y una nota a lápiz: «volver con calma».',
  'Apareció en el radar un martes cualquiera, mientras sonaba algo tranquilo en el puente.',
  'Nadie recuerda quién le puso nombre, pero el ordenador de a bordo se niega a cambiarlo.',
  'Su señal llegó antes que su luz: un pulso suave cada {pulso} segundos.',
  'Figura en un mapa antiguo encontrado dentro de una caja de juego de segunda mano.',
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
  vergel: [
    'Bosques templados, ríos anchos y un clima que invita a quedarse una temporada.',
    'Continentes verdes y mares tranquilos; de noche se ven luces que nadie ha explicado.',
    'Huele a lluvia incluso desde la órbita, o eso dice siempre la tripulación.',
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
};

const LEYENDAS = [
  'Se dice que, al pasar cerca, la radio de la nave capta una canción de cuna en un idioma desconocido.',
  'Un faro abandonado en {lugar} sigue emitiendo tres notas y un silencio.',
  'Los viejos registros hablan de una biblioteca enterrada en {lugar}, con libros que nadie ha abierto.',
  'Hay quien jura haber visto una sala de recreativas encendida en {lugar}, sin nadie dentro.',
  'Cuenta la bitácora que alguien dejó aquí una partida a medias, y que la ficha sigue en la casilla.',
  'Las lecturas muestran estructuras geométricas en {lugar}; el ordenador las clasifica como «probablemente nada».',
  'Su órbita es tan regular que la tripulación la usa para poner en hora los relojes.',
  'Aquí se proyectó una película al aire libre hace siglos; la pantalla, gigantesca, aún sigue en pie en {lugar}.',
  'Nadie ha aterrizado todavía. Quizá sea mejor así.',
];

const LUGARES = {
  rocoso: ['el fondo de un cañón', 'la cara oculta', 'un cráter polar'],
  desertico: ['las dunas del ecuador', 'un oasis de cristal', 'una meseta solitaria'],
  oceanico: ['la isla más pequeña', 'una fosa abisal', 'un arrecife luminoso'],
  vergel: ['un bosque de copas violetas', 'la desembocadura del gran río', 'un valle con niebla'],
  volcanico: ['la ladera del volcán mayor', 'una isla de roca fría', 'una cueva de obsidiana'],
  helado: ['el casquete norte', 'una grieta azul', 'un lago bajo el hielo'],
  gaseoso: ['la gran tormenta', 'la banda ecuatorial', 'una de sus lunas'],
};

const CONSEJOS = [
  'Recomendación del capitán: bajar despacio y con música.',
  'Recomendación del capitán: mirar el amanecer desde órbita al menos una vez.',
  'Recomendación del capitán: no tocar nada que brille.',
  'Recomendación del capitán: traer termo y manta.',
  'Recomendación del capitán: apuntar las coordenadas y volver otro día.',
  'Recomendación del capitán: ideal para una partida larga en la sala de juegos mientras orbitamos.',
];

function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }

/* ------------------------------------------------------------------ */
/*  Especificación pura (meta + parámetros visuales)                   */
/* ------------------------------------------------------------------ */

const ATMOS = {
  rocoso: ['tenue de dióxido de carbono', 'casi inexistente', 'fina de argón'],
  desertico: ['seca de nitrógeno y polvo', 'de dióxido de carbono con tormentas de arena', 'fina y anaranjada'],
  oceanico: ['húmeda de nitrógeno y oxígeno', 'densa y nubosa', 'de vapor de agua y nitrógeno'],
  vergel: ['de nitrógeno y oxígeno, respirable', 'templada y húmeda, casi respirable', 'rica en oxígeno'],
  volcanico: ['de azufre y ceniza', 'tóxica de dióxido de azufre', 'densa y ardiente'],
  helado: ['tenue de nitrógeno', 'de metano helado', 'casi inexistente'],
  gaseoso: ['de hidrógeno y helio', 'de hidrógeno, helio y metano', 'de hidrógeno con nubes de amoníaco'],
};

const TEMP = {
  rocoso: [-80, 120], desertico: [20, 90], oceanico: [5, 35], vergel: [8, 28],
  volcanico: [180, 520], helado: [-220, -60], gaseoso: [-180, -90],
};

const col = (h, s, l) => new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.min(1, Math.max(0, s)), Math.min(1, Math.max(0, l))).getHex();

function visualFor(tipo, rng, meta) {
  // Rampa: [0 agua profunda, 1 agua somera, 2 tierra baja, 3 media, 4 alta, 5 cumbre]
  const exotic = rng.chance(0.22); // tonos púrpura/raros de vez en cuando
  const hShift = exotic ? rng.range(0.55, 0.85) : 0;
  const v = {
    type: PLANET_TYPES[tipo].id,
    seedOffset: [rng.range(-100, 100), rng.range(-100, 100), rng.range(-100, 100)],
    freq: rng.range(1.2, 2.4), octaves: 6, warp: rng.range(0.15, 0.6), sea: -1,
    colors: [], ice: 0, iceColor: col(0.58, 0.25, 0.92), emissive: 0x000000, lava: 0,
    city: 0, cityColor: col(0.1, 0.9, 0.65), bands: 0, bandWarp: 0, spot: 0, spotDir: [0, 1, 0],
    bump: rng.range(0.6, 1.4), spec: 0.6,
    atmoColor: 0x8899ff, atmoStrength: 0.6, clouds: 0, cloudColor: 0xffffff, cloudScale: 2.5,
    rings: null, spin: rng.range(0.03, 0.12), tilt: rng.range(-0.45, 0.45),
  };
  const H = (h) => h + hShift;
  switch (tipo) {
    case 'rocoso': {
      const h = H(rng.range(0.02, 0.12));
      v.colors = [col(h, 0.2, 0.15), col(h, 0.2, 0.25), col(h, rng.range(0.1, 0.3), 0.28), col(h + 0.02, 0.18, 0.4), col(h, 0.12, 0.55), col(h, 0.06, 0.72)];
      v.ice = rng.chance(0.4) ? rng.range(0.05, 0.15) : 0; v.atmoColor = col(H(0.6), 0.3, 0.7); v.atmoStrength = rng.range(0.15, 0.45);
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
      break;
    }
    case 'oceanico': {
      const w = H(rng.range(0.53, 0.62)), l = H(rng.range(0.08, 0.35));
      v.sea = rng.range(0.62, 0.74);
      v.colors = [col(w, 0.7, 0.14), col(w - 0.03, 0.65, 0.36), col(l, 0.35, 0.55), col(l, 0.45, 0.35), col(l, 0.3, 0.45), col(l, 0.1, 0.85)];
      v.ice = rng.range(0.08, 0.2); v.atmoColor = col(w, 0.7, 0.65); v.atmoStrength = rng.range(0.8, 1.2);
      v.clouds = rng.range(0.35, 0.6); v.spec = 1;
      break;
    }
    case 'vergel': {
      const w = H(rng.range(0.55, 0.63)), g = H(rng.range(0.22, 0.38));
      v.sea = rng.range(0.42, 0.56);
      v.colors = [col(w, 0.65, 0.16), col(w - 0.04, 0.55, 0.38), col(g - 0.1, 0.45, 0.6), col(g, 0.5, 0.3), col(g + 0.03, 0.35, 0.22), col(0.08, 0.15, 0.5)];
      v.ice = rng.range(0.06, 0.16); v.atmoColor = col(w, 0.7, 0.68); v.atmoStrength = rng.range(0.8, 1.1);
      v.clouds = rng.range(0.4, 0.6); v.spec = 0.9; v.city = rng.chance(0.55) ? rng.range(0.6, 1.2) : 0;
      if (rng.chance(0.25)) { v.colors[3] = col(0.78, 0.4, 0.35); v.colors[4] = col(0.8, 0.35, 0.25); } // bosques violetas
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
      v.ice = rng.range(0.2, 0.4); v.iceColor = col(h, 0.15, 0.95); v.atmoColor = col(h, 0.5, 0.75); v.atmoStrength = rng.range(0.3, 0.7);
      v.spec = 0.5; v.bump = rng.range(0.5, 1.0);
      break;
    }
    case 'gaseoso': {
      const h = exotic ? rng.range(0.68, 0.88) : rng.pick([rng.range(0.03, 0.12), rng.range(0.52, 0.64), rng.range(0.08, 0.14)]);
      const s = rng.range(0.3, 0.65);
      v.colors = [col(h - 0.04, s + 0.2, 0.35), col(h, s, 0.3), col(h + 0.03, s * 0.8, 0.5), col(h - 0.02, s * 0.6, 0.72), col(h + 0.06, s, 0.42), col(h, s * 0.4, 0.85)];
      v.bands = rng.range(10, 26); v.bandWarp = rng.range(0.05, 0.22);
      if (rng.chance(0.6)) {
        v.spot = rng.range(0.12, 0.28);
        const lat = rng.range(-0.5, 0.5), lon = rng.range(0, Math.PI * 2), c = Math.cos(lat);
        v.spotDir = [c * Math.cos(lon), Math.sin(lat), c * Math.sin(lon)];
      }
      v.atmoColor = col(h, s, 0.7); v.atmoStrength = rng.range(0.6, 1.0); v.spec = 0; v.bump = 0;
      v.spin = rng.range(0.08, 0.2); v.freq = rng.range(1.5, 2.5);
      break;
    }
  }
  // Anillos
  const ringChance = tipo === 'gaseoso' ? 0.6 : tipo === 'helado' ? 0.2 : 0.1;
  if (rng.chance(ringChance)) {
    const rh = rng.chance(0.3) ? rng.range(0.7, 0.85) : rng.range(0.05, 0.14);
    v.rings = {
      inner: rng.range(1.3, 1.6), outer: rng.range(1.9, 2.6), opacity: rng.range(0.55, 0.9),
      colorA: col(rh, rng.range(0.15, 0.4), rng.range(0.55, 0.75)), colorB: col(rh + 0.04, rng.range(0.1, 0.3), rng.range(0.3, 0.45)),
      freq: rng.range(30, 90), gaps: rng.int(1, 4), tilt: rng.range(-0.15, 0.15),
      g: [rng(), rng(), rng(), rng(), rng(), rng()],
    };
  }
  meta.anillos = !!v.rings;
  return v;
}

function moonSpec(rng, planetName, i, tipoPlaneta) {
  const tipo = rng.weighted([['rocoso', 6], ['helado', tipoPlaneta === 'gaseoso' ? 5 : 2], ['volcanico', 1], ['desertico', 1]]);
  const r = rng.range(0.08, tipoPlaneta === 'gaseoso' ? 0.26 : 0.18);
  const nombre = rng.chance(0.5) ? makeWord(rng, 2, 2) : `${planetName.split(' ')[0]} ${String.fromCharCode(98 + i)}`;
  return {
    nombre, tipo, radio: r,
    distancia: 0, periodo: 0, inclinacion: rng.range(-0.35, 0.35), fase: rng.range(0, Math.PI * 2),
    seed: Math.floor(rng() * 1e9).toString(36),
  };
}

export function planetSpec(seedIn) {
  const seed = normalizeSeed(seedIn);
  const rng = makeRng(seed, 'meta');
  const tipo = rng.weighted(Object.entries(PLANET_TYPES).map(([k, t]) => [k, t.peso]));
  const nombre = makePlanetName(rng);
  const designacion = `MKV-${rng.int(1000, 9999)}${rng.pick(['b', 'c', 'd', 'e', 'f'])}`;
  const sector = `${makeWord(rng, 2, 2)}-${rng.int(1, 12)}`;
  const gas = tipo === 'gaseoso';
  const radioKm = Math.round(gas ? rng.range(24000, 85000) : rng.range(1800, 11000));
  const gravedad = +(gas ? rng.range(1.2, 3.2) : (radioKm / 6371) * rng.range(0.7, 1.15)).toFixed(2);
  const [tmin, tmax] = TEMP[tipo];
  const temperatura = Math.round(rng.range(tmin, tmax));
  const dia = +(gas ? rng.range(8, 16) : rng.range(9, 70)).toFixed(1);
  const nLunas = rng.weighted(gas ? [[0, 1], [1, 2], [2, 3], [3, 3]] : [[0, 5], [1, 4], [2, 2], [3, 1]]);
  const habitabilidad = gas ? rng.int(0, 2) : Math.max(0, Math.min(99, Math.round(
    { vergel: 80, oceanico: 55, desertico: 25, rocoso: 10, helado: 8, volcanico: 2, gaseoso: 0 }[tipo] + rng.range(-12, 15))));
  const estado = rng.pick(['Sin explorar', 'Sin explorar', 'Observado desde órbita', 'Sondeado', 'Visitado una vez']);
  const atmosfera = rng.pick(ATMOS[tipo]);

  const lunas = [];
  for (let i = 0; i < nLunas; i++) lunas.push(moonSpec(rng, nombre, i, tipo));

  const lunasTxt = nLunas === 0 ? 'nada que se vea' : nLunas === 1 ? 'su única luna' : `sus ${['', '', 'dos', 'tres'][nLunas]} lunas`;
  const vars = { ciclo: rng.int(212, 989), sonda: rng.pick(SONDAS), pulso: rng.int(3, 41), lugar: rng.pick(LUGARES[tipo]), lunasTxt };
  const lore = [fill(rng.pick(ORIGEN), vars), fill(rng.pick(DESCR[tipo]), vars), fill(rng.pick(LEYENDAS), vars)];
  if (rng.chance(0.6)) lore.push(rng.pick(CONSEJOS));

  const meta = {
    seed, nombre, designacion, sector, tipo, tipoNombre: PLANET_TYPES[tipo].nombre,
    radioKm, gravedad, temperatura, duracionDia: dia, atmosfera, habitabilidad, estado,
    lunas: [], anillos: false, lore: lore.join(' '), loreFrases: lore,
  };

  const vrng = makeRng(seed, 'visual');
  const visual = visualFor(tipo, vrng, meta);

  // Lunas: órbitas en unidades del radio del planeta (planeta = 1)
  let dist = visual.rings ? visual.rings.outer + 0.5 : 1.9;
  visual.moons = lunas.map((m, i) => {
    dist += vrng.range(0.5, 1.1) + m.radio * 2;
    m.distancia = +dist.toFixed(2);
    m.periodo = +(Math.pow(dist, 1.5) * vrng.range(5, 8)).toFixed(1); // segundos de animación por vuelta
    const mv = visualFor(m.tipo, makeRng(m.seed, 'visual'), {});
    mv.rings = null; mv.clouds = 0; mv.city = 0; mv.atmoStrength *= 0.3; mv.octaves = 3; mv.bump *= 0.5; mv.freq *= 0.7;
    meta.lunas.push({ nombre: m.nombre, tipo: m.tipo, tipoNombre: PLANET_TYPES[m.tipo].nombre, radioKm: Math.round(radioKm * m.radio), periodoDias: +(m.periodo * 1.7).toFixed(1) });
    return { ...m, visual: mv };
  });
  return { meta, visual };
}

/* ------------------------------------------------------------------ */
/*  GLSL                                                                */
/* ------------------------------------------------------------------ */

const NOISE_GLSL = /* glsl */`
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

const SURFACE_VERT = /* glsl */`
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
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
  vec4 mv=modelViewMatrix*vec4(position,1.0);
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
uniform float uCity;
uniform vec3 uCityColor;
uniform float uBands;
uniform float uBandWarp;
uniform float uSpot;
uniform vec3 uSpotDir;
uniform float uBump;
uniform float uSpec;
uniform vec3 uAtmoColor;
uniform float uAtmoStrength;
uniform vec3 uLightDir;
uniform float uTime;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
varying vec3 vT1;
varying vec3 vT2;
${NOISE_GLSL}
float heightAt(vec3 n,int oct){
  vec3 p=n*uFreq+uSeedOffset;
  vec3 wv=vec3(snoise(p+vec3(1.7)),snoise(p+vec3(8.3)),snoise(p+vec3(3.1)));
  float h=fbm(p+wv*uWarp,oct)*0.5+0.5;
  return clamp((h-0.5)*1.6+0.5,0.0,1.0);
}
vec3 ramp4(vec3 a,vec3 b,vec3 c,vec3 d,float t){
  t=clamp(t,0.0,1.0);
  if(t<0.33)return mix(a,b,t/0.33);
  if(t<0.66)return mix(b,c,(t-0.33)/0.33);
  return mix(c,d,(t-0.66)/0.34);
}
void main(){
  vec3 n=normalize(vObj);
  vec3 p=n*uFreq+uSeedOffset;
  vec3 col;float h=0.0;float bumpH=0.0;float specMask=0.0;vec3 emis=vec3(0.0);float cap=0.0;float land=0.0;
  if(uType==6){
    float w=fbm(vec3(n.x*1.5,n.y*7.0,n.z*1.5)*uFreq+uSeedOffset+vec3(uTime*0.004,0.0,0.0),5);
    float lat=n.y+w*uBandWarp;
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
    h=t;bumpH=0.0;
  }else{
    vec3 wv=vec3(snoise(p+vec3(1.7)),snoise(p+vec3(8.3)),snoise(p+vec3(3.1)));
    h=heightAt(n,uOctaves);
    if(uSea>0.0&&h<uSea){
      float depth=(uSea-h)/uSea;
      col=mix(uColors[1],uColors[0],smoothstep(0.0,0.35,depth));
      specMask=1.0;bumpH=uSea;
    }else{
      float s0=max(uSea,0.0);
      float t=(h-s0)/(1.0-s0);
      col=ramp4(uColors[2],uColors[3],uColors[4],uColors[5],t);
      bumpH=h;land=1.0;
    }
    if(uType==1){
      float d=sin(dot(n,normalize(vec3(0.3,1.0,0.2)))*90.0+snoise(p*3.0)*4.0);
      col*=0.93+0.07*d;
    }
    if(uType==4){
      float r=pow(1.0-abs(snoise(p*1.8+wv*0.6)),9.0);
      float r2=pow(1.0-abs(snoise(p*4.5+vec3(5.0))),14.0);
      float c=clamp(max(r,r2*0.8)*smoothstep(0.75,0.35,h)*1.4,0.0,1.0);
      float pulse=0.85+0.15*sin(uTime*0.8+h*20.0);
      emis=uEmissive*c*uLava*pulse;
      col=mix(col,col*0.3,c);
      bumpH-=c*0.05;
    }
    if(uType==5){
      float r=pow(1.0-abs(snoise(p*3.0+wv)),14.0);
      col=mix(col,uColors[1],r*0.7);
      bumpH-=r*0.04;
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
  if(uBump>0.0){
    vec3 up=abs(n.y)>0.99?vec3(1.0,0.0,0.0):vec3(0.0,1.0,0.0);
    vec3 t1=normalize(cross(up,n));vec3 t2=cross(n,t1);
    int bo=max(uOctaves-1,2);
    float sl=max(uSea,0.0);
    float e=0.0025;
    float hb0=max(heightAt(n,bo),sl);
    float hb1=max(heightAt(normalize(n+t1*e),bo),sl);
    float hb2=max(heightAt(normalize(n+t2*e),bo),sl);
    vec2 g=vec2(hb1-hb0,hb2-hb0)/e;
    Nb=normalize(N-uBump*0.035*(g.x*normalize(vT1)+g.y*normalize(vT2)));
  }
  vec3 L=normalize((viewMatrix*vec4(uLightDir,0.0)).xyz);
  vec3 V=normalize(-vViewPos);
  float ndl=dot(N,L);
  float diff=max(dot(Nb,L),0.0);
  diff=diff*smoothstep(-0.05,0.2,ndl);
  vec3 lit=col*(diff*1.1+0.02);
  vec3 Hh=normalize(L+V);
  float sp=pow(max(dot(N,Hh),0.0),70.0)*specMask*uSpec*step(0.0,ndl);
  lit+=vec3(1.0,0.95,0.88)*sp*0.55;
  float night=1.0-smoothstep(-0.12,0.12,ndl);
  if(uCity>0.0){
    float cn=snoise(p*9.0)*0.5+0.5;
    float cn2=snoise(p*38.0)*0.5+0.5;
    float cm=smoothstep(0.6,0.78,cn)*smoothstep(0.5,0.75,cn2)*land*(1.0-cap)*smoothstep(0.0,0.08,h-max(uSea,0.0));
    lit+=uCityColor*cm*night*uCity;
  }
  lit+=emis*(0.45+0.75*night);
  float fres=pow(1.0-max(dot(N,V),0.0),3.0);
  lit+=uAtmoColor*fres*uAtmoStrength*smoothstep(-0.25,0.5,ndl);
  gl_FragColor=vec4(lit,1.0);
  #include <colorspace_fragment>
}`;

const ATMO_VERT = /* glsl */`
varying vec3 vNormalV;varying vec3 vViewPos;varying vec3 vWorldN;
void main(){
  vNormalV=normalize(normalMatrix*normal);
  vWorldN=normalize(mat3(modelMatrix)*normal);
  vec4 mv=modelViewMatrix*vec4(position,1.0);vViewPos=mv.xyz;
  gl_Position=projectionMatrix*mv;
}`;
const ATMO_FRAG = /* glsl */`
uniform vec3 uAtmoColor;uniform float uAtmoStrength;uniform vec3 uLightDir;uniform float uLimb;
varying vec3 vNormalV;varying vec3 vViewPos;varying vec3 vWorldN;
void main(){
  vec3 V=normalize(-vViewPos);
  float x=-dot(normalize(vNormalV),V);
  float i=pow(clamp(x/uLimb,0.0,1.0),2.2);
  i*=smoothstep(1.25,0.9,x/uLimb);
  float light=smoothstep(-0.35,0.55,dot(normalize(vWorldN),normalize(uLightDir)));
  gl_FragColor=vec4(uAtmoColor*i*light*uAtmoStrength,1.0);
  #include <colorspace_fragment>
}`;

const CLOUD_FRAG = /* glsl */`
uniform vec3 uSeedOffset;uniform float uCover;uniform vec3 uCloudColor;uniform vec3 uLightDir;uniform float uTime;uniform float uScale;
varying vec3 vObj;varying vec3 vNormalV;varying vec3 vViewPos;
${NOISE_GLSL}
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
  gl_FragColor=vec4(uCloudColor*lit,a*0.92);
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
uniform float uFreq;uniform float uG[6];uniform vec3 uLightDir;uniform vec3 uCenter;uniform float uRadius;uniform vec3 uNormalW;
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
  c*=lit*(1.0-0.85*shadow);
  gl_FragColor=vec4(c,a);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ */
/*  Construcción Three.js                                               */
/* ------------------------------------------------------------------ */

const DETAIL = { alta: { seg: 128, oct: 7 }, media: { seg: 64, oct: 5 }, baja: { seg: 32, oct: 3 } };

function surfaceMaterial(v, lightDir, octaves) {
  return new THREE.ShaderMaterial({
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
    uniforms: {
      uType: { value: v.type },
      uSeedOffset: { value: new THREE.Vector3(...v.seedOffset) },
      uFreq: { value: v.freq },
      uOctaves: { value: Math.min(octaves, v.octaves + 1) },
      uWarp: { value: v.warp },
      uSea: { value: v.sea },
      uColors: { value: v.colors.map(c => new THREE.Color(c)) },
      uIce: { value: v.ice },
      uIceColor: { value: new THREE.Color(v.iceColor) },
      uEmissive: { value: new THREE.Color(v.emissive) },
      uLava: { value: v.lava },
      uCity: { value: v.city },
      uCityColor: { value: new THREE.Color(v.cityColor) },
      uBands: { value: v.bands },
      uBandWarp: { value: v.bandWarp },
      uSpot: { value: v.spot },
      uSpotDir: { value: new THREE.Vector3(...v.spotDir).normalize() },
      uBump: { value: v.bump },
      uSpec: { value: v.spec },
      uAtmoColor: { value: new THREE.Color(v.atmoColor) },
      uAtmoStrength: { value: v.atmoStrength },
      uLightDir: { value: lightDir },
      uTime: { value: 0 },
    },
  });
}

/**
 * Genera un planeta completo a partir de una semilla.
 * @param {string|number} seed
 * @param {{radius?:number, detail?:'alta'|'media'|'baja', lightDirection?:THREE.Vector3, moons?:boolean}} [opts]
 */
export function generatePlanet(seed, opts = {}) {
  const { meta, visual } = planetSpec(seed);
  const detail = DETAIL[opts.detail] || DETAIL.alta;
  const radius = opts.radius ?? 1;
  const lightDir = (opts.lightDirection ? opts.lightDirection.clone() : new THREE.Vector3(1, 0.3, 0.3)).normalize();
  const disposables = [];
  const timeUniforms = [];
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
  const bodyMat = track(surfaceMaterial(visual, lightDir, detail.oct));
  timeUniforms.push(bodyMat.uniforms.uTime);
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
        uCloudColor: { value: new THREE.Color(visual.cloudColor) }, uLightDir: { value: lightDir }, uTime: { value: 0 },
        uScale: { value: visual.cloudScale },
      },
    }));
    timeUniforms.push(cMat.uniforms.uTime);
    clouds = new THREE.Mesh(cGeo, cMat);
    clouds.name = 'nubes';
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
      uLightDir: { value: lightDir }, uLimb: { value: Math.sqrt(1 - 1 / (shell * shell)) },
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
        uFreq: { value: R.freq }, uG: { value: R.g }, uLightDir: { value: lightDir },
        uCenter: { value: new THREE.Vector3() }, uRadius: { value: radius }, uNormalW: { value: new THREE.Vector3(0, 1, 0) },
      },
    }));
    rings = new THREE.Mesh(rGeo, ringMat);
    rings.name = 'anillos';
    rings.rotation.x = -Math.PI / 2 + R.tilt;
    rings.renderOrder = 2;
    tilt.add(rings);
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
      const mGeo = track(new THREE.SphereGeometry(m.radio, Math.max(24, detail.seg / 2), Math.max(12, detail.seg / 4)));
      const mMat = track(surfaceMaterial(m.visual, lightDir, Math.min(detail.oct, 4)));
      timeUniforms.push(mMat.uniforms.uTime);
      const mesh = new THREE.Mesh(mGeo, mMat);
      mesh.name = `luna:${m.nombre}`;
      mesh.position.x = m.distancia;
      orbit.add(mesh);
      group.add(pivot);
      moons.push({ orbit, mesh, speed: (Math.PI * 2) / m.periodo });
    }
  }

  let time = 0;
  let sunPosition = null;
  const tmpC = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function setLightDirection(dir) { lightDir.copy(dir).normalize(); }
  function setSunPosition(pos) { sunPosition = pos ? pos.clone() : null; }

  function update(dt = 1 / 60) {
    time += dt;
    for (const u of timeUniforms) u.value = time;
    body.rotation.y += visual.spin * dt;
    if (clouds) clouds.rotation.y += visual.spin * 1.25 * dt;
    for (const m of moons) { m.orbit.rotation.y += m.speed * dt; m.mesh.rotation.y += dt * 0.05; }
    group.getWorldPosition(tmpC);
    if (sunPosition) lightDir.copy(sunPosition).sub(tmpC).normalize();
    if (ringMat) {
      group.getWorldScale(tmpS);
      ringMat.uniforms.uCenter.value.copy(tmpC);
      ringMat.uniforms.uRadius.value = tmpS.x;
      rings.getWorldQuaternion(tmpQ);
      ringMat.uniforms.uNormalW.value.copy(tmpN.set(0, 0, 1).applyQuaternion(tmpQ));
    }
  }
  update(0);

  function dispose() {
    group.removeFromParent();
    for (const d of disposables) d.dispose();
    disposables.length = 0;
  }

  return { group, mesh: body, meta, update, setLightDirection, setSunPosition, dispose, lightDirection: lightDir };
}
