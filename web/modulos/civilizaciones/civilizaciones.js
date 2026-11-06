// civilizaciones.js · Civilizaciones procedurales visibles para La Malkevnia
// Módulo ES autocontenido. Depende solo de 'three' (probado con three@0.160.0).
// Pensado para colgarse de un planeta de planetas.js (generatePlanet), pero
// funciona con cualquier { group, mesh } cuya superficie sea una esfera de radio 1
// en coordenadas locales.
//
// Todo es determinista: la misma semilla + el mismo planeta dan siempre la misma
// especie, cultura, nombre, colores de luces, estaciones, ascensores y megaestructuras.
//
// API pública (ver README.md):
//   civilizationSpec(seed, planetMeta?, { nivel?, estado? }) -> meta (datos puros, sin GPU)
//   createCivilization(seed | meta, planetMeta?, opts?)      -> { meta, attach, setNivel, setEstado, setResolution, update, dispose }
//   generateCivilization = createCivilization (alias)
//   eraPara(nivel) / rasgosPara(nivel, estado, meta) / ERAS / FEATURES

import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Aleatoriedad determinista (misma familia que planetas.js)          */
/* ------------------------------------------------------------------ */

function hashString(str) {
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
function normalizeSeed(seed) {
  const s = String(seed ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'malkevnia';
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ramp = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function fill(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ''); }

/* ------------------------------------------------------------------ */
/*  Catálogos                                                          */
/* ------------------------------------------------------------------ */

/** Eras por nivel de Kardashev (0 = nada, 3 = galáctica). */
export const ERAS = [
  { desde: 0.00, id: 'silencio', nombre: 'Silencio', resumen: 'Ninguna luz artificial. Solo el planeta.' },
  { desde: 0.05, id: 'hogueras', nombre: 'Edad de las Hogueras', resumen: 'Puntos de fuego en las costas, visibles solo de noche y de cerca.', alcance: 'a encender sus primeras hogueras' },
  { desde: 0.25, id: 'agraria', nombre: 'Era Agraria', resumen: 'Campos de cultivo en mosaico y aldeas que brillan débilmente.', alcance: 'a cultivar sus campos' },
  { desde: 0.45, id: 'ciudades', nombre: 'Era de las Ciudades-Estado', resumen: 'Las primeras ciudades grandes se encienden en la cara nocturna.', alcance: 'a levantar sus primeras ciudades' },
  { desde: 0.60, id: 'industrial', nombre: 'Era Industrial', resumen: 'Bruma de humo sobre los continentes y caminos de luz entre ciudades.', alcance: 'a la era industrial' },
  { desde: 0.80, id: 'red', nombre: 'Era de la Red', resumen: 'Redes continentales de luz y los primeros satélites.', alcance: 'a conectar todo su planeta' },
  { desde: 1.00, id: 'tipo1', nombre: 'Tipo I · Civilización planetaria', resumen: 'Dominan toda la energía de su planeta. El cielo se llena de satélites.', alcance: 'a ser una civilización planetaria' },
  { desde: 1.30, id: 'orbital', nombre: 'Era Orbital', resumen: 'Estaciones, rutas de tráfico y ascensores espaciales.', alcance: 'a vivir en órbita' },
  { desde: 1.60, id: 'ecumenopolis', nombre: 'Era de la Ecumenópolis', resumen: 'Un anillo orbital ciñe el ecuador y la ciudad cubre los continentes.', alcance: 'a cubrir su mundo de ciudad' },
  { desde: 2.00, id: 'tipo2', nombre: 'Tipo II · Civilización estelar', resumen: 'Un enjambre de Dyson cosecha la luz de su estrella.', alcance: 'a ser una civilización estelar' },
  { desde: 2.35, id: 'mega', nombre: 'Era de las Megaestructuras', resumen: 'Celosías, mundos-anillo y faros del tamaño de lunas.', alcance: 'a construir megaestructuras' },
  { desde: 2.80, id: 'tipo3', nombre: 'Tipo III · Civilización galáctica', resumen: 'Una puerta abierta a otras estrellas y haces de luz que cruzan la galaxia.', alcance: 'a ser una civilización galáctica' },
];

/** Rasgos visibles, en orden de aparición. Útil para leyendas y chips. */
export const FEATURES = [
  { id: 'hogueras', nombre: 'Hogueras' },
  { id: 'campos', nombre: 'Campos de cultivo' },
  { id: 'ciudades', nombre: 'Luces de ciudades' },
  { id: 'carreteras', nombre: 'Redes de carreteras' },
  { id: 'contaminacion', nombre: 'Bruma industrial' },
  { id: 'satelites', nombre: 'Enjambre de satélites' },
  { id: 'trafico', nombre: 'Rutas de tráfico' },
  { id: 'estaciones', nombre: 'Estaciones orbitales' },
  { id: 'colonias', nombre: 'Colonias lunares' },
  { id: 'ascensores', nombre: 'Ascensores espaciales' },
  { id: 'anillo', nombre: 'Anillo orbital' },
  { id: 'ecumenopolis', nombre: 'Ecumenópolis' },
  { id: 'dyson', nombre: 'Enjambre de Dyson' },
  { id: 'mega', nombre: 'Megaestructuras' },
  { id: 'puerta', nombre: 'Puerta estelar' },
  { id: 'haces', nombre: 'Haces intergalácticos' },
  { id: 'ruinas', nombre: 'Ruinas' },
];

// Tipos de planetas.js sin superficie sólida (las ciudades flotan)
const GAS_TYPES = ['gaseoso', 'jupiter_caliente', 'gigante_helado', 'mini_neptuno'];

const PALETAS = {
  sodio: { nombre: 'sodio', a: 0xffa24a, b: 0xffd27a, acento: 0xff7a3c },
  hielo: { nombre: 'blanco frío', a: 0xdfe9ff, b: 0x9fc4ff, acento: 0x7fb2ff },
  cian: { nombre: 'cian', a: 0x5ff1ff, b: 0xa8fff4, acento: 0x3fb8ff },
  violeta: { nombre: 'violeta', a: 0xc28cff, b: 0xf0b8ff, acento: 0x9b6bff },
  esmeralda: { nombre: 'verde esmeralda', a: 0x7dffae, b: 0xd7ff8a, acento: 0x3fe0a0 },
  coral: { nombre: 'coral', a: 0xff8fb3, b: 0xffc2a6, acento: 0xff6fa0 },
  oro: { nombre: 'oro viejo', a: 0xffcf6a, b: 0xfff0b8, acento: 0xffb03a },
  magenta: { nombre: 'magenta', a: 0xff6ae6, b: 0xb79bff, acento: 0xd06bff },
};

const FORMAS = [
  { id: 'cefalopodos', txt: 'cefalópodos de mares tibios que aprendieron a respirar fuera del agua', plural: 'cefalópodos anfibios', paletas: ['cian', 'violeta', 'esmeralda'], acuatica: true },
  { id: 'aves', txt: 'aves de huesos huecos que construyen ciudades verticales para no tocar el suelo', plural: 'aves constructoras', paletas: ['oro', 'sodio', 'coral'] },
  { id: 'liquenes', txt: 'colonias de líquenes que piensan despacio, una idea por estación', plural: 'líquenes pensantes', paletas: ['esmeralda', 'oro'], lenta: true },
  { id: 'cristales', txt: 'cristales que crecen en cuevas profundas y se comunican cantando en frecuencias que no oímos', plural: 'cristales cantores', paletas: ['violeta', 'hielo', 'magenta'], estacion: 'cristal' },
  { id: 'insectos', txt: 'insectos con mente de colmena: millones de cuerpos, una sola voluntad', plural: 'insectos colmena', paletas: ['oro', 'sodio', 'esmeralda'], estacion: 'colmena' },
  { id: 'mamiferos', txt: 'mamíferos pequeños y curiosos que bajaron de árboles enormes', plural: 'mamíferos arborícolas', paletas: ['sodio', 'hielo', 'oro'] },
  { id: 'maquinas', txt: 'máquinas que heredaron el planeta de unos creadores que nadie recuerda', plural: 'máquinas herederas', paletas: ['hielo', 'cian', 'magenta'], sinContaminacion: true },
  { id: 'hongos', txt: 'redes de hongos bajo tierra que despertaron cuando se tocaron todas a la vez', plural: 'micelios conscientes', paletas: ['esmeralda', 'violeta', 'coral'], estacion: 'colmena' },
  { id: 'gigantes', txt: 'gigantes lentos de piel de piedra que viven milenios', plural: 'gigantes de piedra', paletas: ['oro', 'sodio'], lenta: true },
  { id: 'medusas', txt: 'medusas que flotan en la atmósfera y nunca han tocado el suelo', plural: 'medusas del aire', paletas: ['coral', 'magenta', 'cian'], flotante: true },
  { id: 'reptiles', txt: 'reptiles de sangre caliente con una memoria familiar que pasa de padres a hijos', plural: 'reptiles memoriosos', paletas: ['sodio', 'oro', 'coral'] },
  { id: 'luz', txt: 'seres de plasma que nacieron en las auroras y se alimentan de campos magnéticos', plural: 'criaturas de plasma', paletas: ['magenta', 'violeta', 'cian'], flotante: true, estacion: 'cristal' },
  { id: 'arboles', txt: 'árboles que caminan de noche y deciden las cosas en asambleas de siglos', plural: 'árboles caminantes', paletas: ['esmeralda', 'oro'], lenta: true },
  { id: 'humanoides', txt: 'humanoides de cuatro brazos que llevan escribiendo su historia desde que hablan', plural: 'humanoides cuadrúmanos', paletas: ['sodio', 'hielo', 'violeta'] },
  { id: 'enjambre', txt: 'nubes de nanomáquinas que un día se preguntaron quiénes eran', plural: 'enjambres sintéticos', paletas: ['cian', 'hielo', 'magenta'], sinContaminacion: true, estacion: 'colmena' },
  { id: 'cetaceos', txt: 'cetáceos cantores que construyeron ciudades flotantes con espuma endurecida', plural: 'cetáceos cantores', paletas: ['cian', 'violeta', 'hielo'], acuatica: true },
];

const CULTURAS = [
  { id: 'contemplativa', nombre: 'contemplativa', txt: 'contemplativa: miden el tiempo por las veces que han mirado el cielo en silencio', contaminacion: 0.4, mega: ['faros', 'celosia'], ecu: 0.6 },
  { id: 'mercantil', nombre: 'mercantil', txt: 'mercantil: todo se intercambia, hasta los recuerdos, y sus rutas no duermen nunca', contaminacion: 1.0, trafico: 1.7, estaciones: 1.4, mega: ['cilindros', 'anilloMundo'], ecu: 1 },
  { id: 'ecologista', nombre: 'jardinera', txt: 'jardinera: cuidan el planeta como un invernadero y viven en órbita para no pisarlo', contaminacion: 0.25, ecu: 0.15, mega: ['cilindros', 'anilloMundo'], estaciones: 1.3 },
  { id: 'industrial', nombre: 'forjadora', txt: 'forjadora: celebran cada máquina nueva con una fiesta que dura un año', contaminacion: 1.9, mega: ['celosia', 'cilindros'], ecu: 1.1 },
  { id: 'teocratica', nombre: 'devota', txt: 'devota: creen que su estrella les habla y construyen para que les escuche mejor', contaminacion: 0.9, mega: ['faros', 'celosia'], ecu: 0.9 },
  { id: 'artistica', nombre: 'artística', txt: 'artística: sus ciudades se iluminan en colores distintos según el humor de quienes las habitan', contaminacion: 0.7, mega: ['anilloMundo', 'faros'], ecu: 0.8, multicolor: true },
  { id: 'colmena', nombre: 'colectiva', txt: 'colectiva: no tienen palabra para "yo"; deciden todo a la vez', contaminacion: 1.2, mega: ['celosia', 'cilindros'], ecu: 1.3 },
  { id: 'nomada', nombre: 'nómada', txt: 'nómada: nadie vive dos ciclos en el mismo sitio y sus rutas brillan más que sus ciudades', contaminacion: 0.6, trafico: 2.0, mega: ['cilindros', 'anilloMundo'], ecu: 0.5 },
  { id: 'cientifica', nombre: 'científica', txt: 'científica: cada pregunta respondida es un día festivo y cada pregunta nueva, dos', contaminacion: 0.8, mega: ['celosia', 'anilloMundo'], ecu: 1, ascensores: 1.5 },
  { id: 'archivista', nombre: 'archivista', txt: 'archivista: guardan copia de todo lo que existe, por si el universo se olvida de algo', contaminacion: 0.6, mega: ['celosia', 'faros'], ecu: 1 },
  { id: 'festiva', nombre: 'festiva', txt: 'festiva: celebran algo cada noche y desde órbita se nota, porque nunca apagan las luces', contaminacion: 1.0, mega: ['faros', 'anilloMundo'], ecu: 1.1, brillo: 1.4 },
  { id: 'silenciosa', nombre: 'silenciosa', txt: 'silenciosa: hablan solo cuando es imprescindible y sus ciudades se apagan pronto', contaminacion: 0.5, mega: ['celosia', 'cilindros'], ecu: 0.7, brillo: 0.6 },
];

const TITULOS = ['Concordia de {x}', 'Mancomunidad de {x}', 'Coro de {x}', 'Hegemonía Tranquila de {x}', 'Ecumene de {x}', 'Archivo Vivo de {x}',
  'Federación de {x}', 'Jardín de {x}', 'Consejo de las Mareas de {x}', 'Linaje de {x}', 'Asamblea de {x}', 'Colmena de {x}', 'República Lenta de {x}',
  'Armonía de {x}', 'Dominio Sereno de {x}', 'Cofradía de {x}'];

const SILABAS = ['ka', 'vo', 'ri', 'sha', 'um', 'tel', 'ix', 'or', 'na', 'zu', 'qe', 'lu', 'mi', 'dra', 'sel', 'va', 'ek', 'tho', 'ai', 'ren', 'ol', 'sy', 'mae', 'kor', 'ith', 'yl', 'ze', 'ba', 'nu', 'gha'];
const SUFIJOS = ['i', 'ari', 'ones', 'eos', 'ith', 'ar', 'ini', 'otes', 'anos', 'enses'];

function word(rng, a = 2, b = 3) {
  const n = rng.int(a, b);
  let s = '';
  for (let i = 0; i < n; i++) s += rng.pick(SILABAS);
  return s.replace(/(.)\1\1+/g, '$1$1');
}

const CAUSAS = ['una plaga que solo atacaba a quienes soñaban', 'un invierno que duró tres generaciones', 'una guerra por una pregunta que nadie recuerda',
  'una decisión colectiva de marcharse a otra parte', 'la llegada de algo desde fuera del sistema', 'su propia estrella, que tosió una sola vez',
  'una máquina que hizo exactamente lo que le pidieron', 'el silencio: un día dejaron de contestarse entre ellos'];

const CONTACTO = [
  'Responden a nuestras balizas con una secuencia de números primos y nada más.',
  'Nunca han contestado, pero han movido un satélite para que pase justo delante de nuestra ventana.',
  'Nos invitaron a atracar. El capitán todavía se lo está pensando.',
  'No saben que existimos. Probablemente mejor así.',
  'Su frecuencia oficial emite música las veinticuatro horas. Malkev la tiene en favoritos.',
  'Mandaron un mensaje de bienvenida en un idioma que el ordenador de a bordo tardó un ciclo en traducir: "Pasa, pero limpia los pies".',
  'Piden a las naves de paso que no hagan ruido por la noche.',
  'Intercambiamos una receta de té por un mapa estelar. Salimos ganando.',
];

const ERA_FRASES = {
  silencio: ['Si alguna vez hubo alguien aquí, no dejó luces encendidas.'],
  hogueras: ['Desde órbita solo se ven brasas en las costas, como si alguien hubiera olvidado apagarlas.', 'Sus primeras palabras fueron para nombrar el fuego.'],
  agraria: ['Los campos dibujan un mosaico paciente que cambia de color con las estaciones.', 'Sus aldeas brillan tan poco que hay que mirar de reojo para verlas.'],
  ciudades: ['Las ciudades se encienden una a una al caer la noche, cada una a su ritmo.', 'Cada ciudad tiene su propio calendario y ninguno coincide.'],
  industrial: ['Una bruma ocre cubre los continentes; dicen que es el precio de aprender deprisa.', 'Los caminos de luz unen las ciudades como hilos de una telaraña.'],
  red: ['Toda la cara nocturna está cosida con luz. Los primeros satélites ya parpadean.', 'Sus emisiones de radio llegan hasta aquí: anuncios, canciones y debates eternos.'],
  tipo1: ['Controlan el clima, las mareas y hasta la forma de las nubes.', 'Ya no queda rincón del planeta sin una luz, pero han aprendido a apagarlas a tiempo.'],
  orbital: ['Las estaciones giran como norias y los ascensores suben y bajan sin descanso.', 'El tráfico orbital forma ríos de luz con sus propias normas de cortesía.'],
  ecumenopolis: ['La ciudad cubre los continentes y un anillo de acero ciñe el ecuador.', 'Desde el anillo orbital se ve amanecer seis veces al día.'],
  tipo2: ['Un enjambre de espejos rodea su estrella y le roba la luz con mucha educación.', 'Su sol parece un poco más tenue cada siglo.'],
  mega: ['Han construido cosas del tamaño de lunas solo porque podían.', 'Sus megaestructuras se ven desde sistemas vecinos y no lo esconden.'],
  tipo3: ['Una puerta junto al planeta lleva a otras estrellas. A veces sale alguien.', 'Sus haces de luz cruzan la galaxia; alguno pasó cerca de La Malkevnia una vez.'],
};

// Lo que queda, según hasta dónde llegaron antes de extinguirse
const RUINAS_FRASES = [
  [0.0, ['Quedan muros cubiertos de musgo y caminos que ya no llevan a ninguna parte.', 'Sus hogueras se apagaron; desde órbita solo se adivinan los círculos de piedra.']],
  [0.6, ['Las ciudades siguen en pie, a oscuras, y sus carreteras se ven desde órbita como cicatrices.', 'Hay cráteres vitrificados donde antes había capitales.']],
  [1.0, ['Miles de satélites muertos siguen dando vueltas: un cementerio que nadie limpia.', 'De noche apenas parpadean un par de luces de emergencia que nadie ha apagado.']],
  [1.3, ['En órbita giran estaciones vacías y el anillo se cae a trozos, muy despacio.', 'Los ascensores espaciales siguen anclados, pero ya no sube nadie.']],
  [2.0, ['El enjambre de su estrella sigue girando sin nadie que recoja la energía.', 'Sus megaestructuras, rotas, todavía brillan cuando les da el sol.']],
  [2.8, ['La puerta sigue ahí, apagada. Nadie sabe adónde llevaba ni si alguien la cerró desde el otro lado.']],
];

const ORIGENES = [
  '{civ} nació en {planeta} hace {antig} ciclos: {forma}.',
  'Los {especie} ({forma}) fundaron {civ} hace {antig} ciclos.',
  'Hace {antig} ciclos, {forma} empezaron a llamarse a sí mismos {especie}. Así nació {civ}.',
];
const ORIGENES_COLONIA = [
  '{civ} no nació aquí: los {especie}, {forma}, llegaron a {planeta} hace {antig} ciclos y se quedaron.',
  'Los {especie} colonizaron {planeta} hace {antig} ciclos. Eran {forma} y venían huyendo de algo.',
];

/* ------------------------------------------------------------------ */
/*  Spec (datos puros)                                                 */
/* ------------------------------------------------------------------ */

/** Era que corresponde a un nivel (0..3). */
export function eraPara(nivel) {
  let e = ERAS[0];
  for (const x of ERAS) if (nivel >= x.desde) e = x;
  return e;
}

function poblacionTxt(nivel, rng01) {
  // Población aproximada, crece en órdenes de magnitud con el nivel
  if (nivel < 0.05) return '—';
  const exp = nivel < 1 ? 4 + nivel * 6 : nivel < 2 ? 10 + (nivel - 1) * 3.5 : 13.5 + (nivel - 2) * 6;
  const v = Math.pow(10, exp + (rng01 - 0.5) * 0.6);
  return formatoGrande(v, '');
}
function formatoGrande(v, unidad) {
  const nombres = [[1e18, 'trillones'], [1e15, 'mil billones'], [1e12, 'billones'], [1e9, 'mil millones'], [1e6, 'millones'], [1e3, 'mil']];
  for (const [n, s] of nombres) if (v >= n) return `${(v / n).toLocaleString('es-ES', { maximumFractionDigits: v / n < 10 ? 1 : 0 })} ${s}${unidad}`;
  return `${Math.round(v).toLocaleString('es-ES')}${unidad}`;
}
function potenciaTxt(nivel) {
  // Fórmula de Sagan: K = (log10(P) - 6) / 10  ->  P = 10^(10K + 6) W
  if (nivel < 0.05) return '—';
  const exp = 10 * nivel + 6;
  const e = Math.floor(exp), m = Math.pow(10, exp - e);
  const sup = String(e).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');
  return `${m.toLocaleString('es-ES', { maximumFractionDigits: 1 })}·10${sup} W`;
}

/**
 * Intensidad 0..1 de cada rasgo visible para un nivel y estado.
 * Es lo que usa el render; sirve también para pintar leyendas.
 */
export function rasgosPara(nivel, estado = 'viva', meta = null) {
  const c = meta?.cultura || {};
  const flot = meta?.superficie === 'flotante';
  const r = {
    hogueras: ramp(0.04, 0.2, nivel) * (1 - ramp(0.55, 0.85, nivel)),
    campos: ramp(0.15, 0.4, nivel) * (1 - ramp(1.55, 1.95, nivel)),
    ciudades: ramp(0.35, 1.0, nivel),
    carreteras: ramp(0.55, 1.0, nivel),
    contaminacion: ramp(0.55, 0.85, nivel) * (1 - ramp(1.05, 1.5, nivel)) * Math.min(1, (c.contaminacion ?? 1) * (meta?.forma?.sinContaminacion ? 0.3 : 1)),
    satelites: ramp(0.78, 1.5, nivel),
    trafico: ramp(0.95, 2.1, nivel),
    estaciones: ramp(1.0, 1.9, nivel),
    colonias: ramp(1.15, 1.7, nivel),
    ascensores: ramp(1.3, 1.6, nivel),
    anillo: ramp(1.5, 1.95, nivel),
    ecumenopolis: ramp(1.65, 2.3, nivel) * Math.min(1, c.ecu ?? 1),
    dyson: ramp(1.9, 2.65, nivel),
    mega: ramp(2.3, 2.8, nivel),
    puerta: ramp(2.75, 3.0, nivel),
    haces: ramp(2.85, 3.0, nivel),
    ruinas: 0,
  };
  if (flot) { r.campos = 0; r.carreteras *= 0.0; r.hogueras = 0; }
  if (estado === 'extinta') {
    r.ruinas = ramp(0.2, 0.7, nivel);
    r.hogueras = 0; r.campos = 0; r.contaminacion = 0; r.trafico = 0;
  }
  if (estado === 'ninguna' || nivel <= 0) for (const k in r) r[k] = 0;
  return r;
}

/**
 * Datos de la civilización, sin tocar la GPU. Barato.
 * @param {string|number} seedIn  Semilla (normalmente la del planeta).
 * @param {object} [planetMeta]   meta de planetas.js (nombre, tipo, habitabilidad…). Opcional.
 * @param {{nivel?:number, estado?:'viva'|'extinta'|'ninguna'}} [opts] Fuerza nivel/estado (p. ej. un deslizador).
 */
export function civilizationSpec(seedIn, planetMeta = {}, opts = {}) {
  const seed = normalizeSeed(seedIn ?? planetMeta?.seed);
  const rng = makeRng(seed, 'civ');
  const tipo = planetMeta?.tipo || 'vergel';
  const hab = planetMeta?.habitabilidad ?? 50;
  const planeta = planetMeta?.nombre || cap(word(rng, 2, 3));
  const gas = GAS_TYPES.includes(tipo) || planetMeta?.gaseoso === true;

  // ¿Hay alguien? Más probable cuanto más habitable.
  const pExiste = gas ? 0.35 : 0.2 + clamp01(hab / 100) * 0.65;
  const existe = rng() < pExiste;
  // Nivel natural: sesgado hacia abajo, con cola larga hasta III
  const u = rng();
  let nivelNatural = existe ? +(Math.pow(u, 1.6) * 3).toFixed(2) : 0;
  if (existe && nivelNatural < 0.08) nivelNatural = 0.08;
  const extinta = existe && rng() < 0.24;

  const origen = hab < 25 || gas ? rng.weighted([['colonia', 3], ['nativa', 1], ['maquinas', 1.2]]) : rng.weighted([['nativa', 6], ['colonia', 1], ['maquinas', 0.6]]);
  let forma = rng.pick(FORMAS);
  const formaPorId = (id) => FORMAS.find((f) => f.id === id);
  if (origen === 'maquinas') forma = formaPorId(rng.chance(0.5) ? 'maquinas' : 'enjambre');
  if (gas && !forma.flotante && rng.chance(0.75)) forma = formaPorId(rng.chance(0.5) ? 'medusas' : 'luz');
  const cultura = rng.pick(CULTURAS);
  const paletaId = rng.pick(forma.paletas);
  const paleta = PALETAS[paletaId];
  const paleta2 = PALETAS[cultura.multicolor ? rng.pick(Object.keys(PALETAS).filter((k) => k !== paletaId)) : paletaId];

  const raiz = cap(word(rng, 2, 3));
  const especie = raiz.replace(/[aeiou]$/, '') + rng.pick(SUFIJOS);
  const nombreCiv = fill(rng.pick(TITULOS), { x: rng.chance(0.55) ? planeta : raiz });
  const antig = rng.int(3, 900) * 10;
  const megaPref = cultura.mega.slice();
  const mega = [megaPref[0], rng.chance(0.5) ? megaPref[1] : rng.pick(['celosia', 'anilloMundo', 'cilindros', 'faros'].filter((m) => m !== megaPref[0]))];

  const nivel = clamp01((opts.nivel ?? nivelNatural) / 3) * 3;
  const estado = opts.estado ?? (existe ? (extinta ? 'extinta' : 'viva') : 'ninguna');
  const estadoEfectivo = estado === 'ninguna' && opts.nivel > 0 ? 'viva' : estado;

  // Cantidades (máximos; el nivel decide cuántos se ven)
  const q = makeRng(seed, 'civ-q');
  const cantidades = {
    satelites: Math.round(q.range(1400, 3200)),
    naves: Math.round(q.range(220, 420) * (cultura.trafico ?? 1)),
    estaciones: Math.min(10, Math.round(q.int(4, 7) * (cultura.estaciones ?? 1))),
    ascensores: Math.min(6, Math.round(q.int(1, 4) * (cultura.ascensores ?? 1))),
    dyson: Math.round(q.range(3500, 6500)),
    flotantes: gas ? q.int(140, 320) : 0,
    haces: q.int(3, 6),
  };

  const meta = {
    seed, version: 1,
    planeta, tipoPlaneta: tipo,
    existe, nivelNatural, extintaNatural: extinta,
    nivel, estado: estadoEfectivo,
    origen, origenNombre: { nativa: 'Nativa', colonia: 'Colonia', maquinas: 'Sintética' }[origen],
    superficie: gas ? 'flotante' : 'terrestre',
    especie, especiePlural: forma.plural, forma: { id: forma.id, txt: forma.txt, sinContaminacion: !!forma.sinContaminacion, acuatica: !!forma.acuatica },
    nombre: nombreCiv,
    cultura: { id: cultura.id, nombre: cultura.nombre, txt: cultura.txt, contaminacion: cultura.contaminacion, ecu: cultura.ecu, brillo: cultura.brillo ?? 1, trafico: cultura.trafico ?? 1 },
    antiguedad: antig,
    paleta: { id: paletaId, nombre: paleta.nombre, luz: paleta.a, luz2: paleta2.b, acento: paleta2.acento },
    estacionTipo: forma.estacion || null,
    mega, cantidades,
    contacto: rng.pick(CONTACTO), causa: rng.pick(CAUSAS), hace: rng.int(2, 400) * 10,
  };
  return describir(meta, nivel, estadoEfectivo);
}

/** Recalcula los campos que dependen del nivel/estado (era, población, lore…). */
function describir(meta, nivel, estado) {
  const era = eraPara(nivel);
  const r = makeRng(meta.seed, 'civ-lore');
  const r01 = r();
  meta.nivel = +nivel.toFixed(2);
  meta.estado = estado;
  meta.kardashev = `K ${meta.nivel.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  meta.tipoKardashev = nivel >= 2.8 ? 'III' : nivel >= 2 ? 'II' : nivel >= 1 ? 'I' : nivel >= 0.05 ? '0' : '—';
  meta.era = era.id; meta.eraNombre = era.nombre; meta.eraResumen = era.resumen;
  meta.poblacion = estado === 'extinta' ? 'ninguna (extinta)' : poblacionTxt(nivel, r01);
  meta.potencia = estado === 'extinta' ? '—' : potenciaTxt(nivel);
  meta.rasgos = rasgosPara(nivel, estado, meta);
  meta.rasgosVisibles = FEATURES.filter((f) => meta.rasgos[f.id] > 0.05).map((f) => f.id);

  const vars = { civ: meta.nombre, planeta: meta.planeta, antig: meta.antiguedad.toLocaleString('es-ES'), forma: meta.forma.txt, especie: meta.especie };
  const frases = [];
  if (estado === 'ninguna' || nivel < 0.05) {
    frases.push(meta.existe
      ? `En ${meta.planeta} todavía no hay nadie mirando al cielo. Quizá dentro de unos millones de años.`
      : `${meta.planeta} está en silencio: ni luces, ni señales, ni ruinas. Solo viento.`);
  } else {
    const plantillas = meta.origen === 'colonia' ? ORIGENES_COLONIA : ORIGENES;
    frases.push(fill(r.pick(plantillas), vars));
    frases.push(`Su cultura es ${meta.cultura.txt}.`);
    if (estado === 'extinta') {
      let banda = RUINAS_FRASES[0][1];
      for (const [desde, fr] of RUINAS_FRASES) if (nivel >= desde) banda = fr;
      frases.push(`Llegaron ${era.alcance || 'lejos'}, pero se extinguieron hace ${meta.hace.toLocaleString('es-ES')} ciclos por ${meta.causa}.`);
      frases.push(r.pick(banda));
    } else {
      frases.push(r.pick(ERA_FRASES[era.id] || ERA_FRASES.silencio));
      frases.push(meta.contacto);
    }
  }
  meta.loreFrases = frases;
  meta.lore = frases.join(' ');
  return meta;
}

/* ------------------------------------------------------------------ */
/*  GLSL compartido                                                    */
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
float hash13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
vec3 hash33(vec3 p){p=fract(p*vec3(0.1031,0.1030,0.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
// Worley 3D: x = F1, y = F2, z = id aleatorio de la celda más cercana
vec3 worley(vec3 p){
  vec3 i=floor(p),f=fract(p);
  float F1=8.0,F2=8.0,id=0.0;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 g=vec3(float(x),float(y),float(z));
    vec3 o=hash33(i+g);
    vec3 r=g+o-f;
    float d=dot(r,r);
    if(d<F1){F2=F1;F1=d;id=hash13(i+g+0.37);}else if(d<F2){F2=d;}
  }
  return vec3(sqrt(F1),sqrt(F2),id);
}
`;

// Sombra del planeta (esfera de radio uPlanetR en uPlanetC) sobre un punto del mundo
const SHADOW_GLSL = /* glsl */`
uniform vec3 uPlanetC;uniform float uPlanetR;
float planetShadow(vec3 wp,vec3 L){
  vec3 p=(wp-uPlanetC)/uPlanetR;
  float t=dot(p,L);
  float d=length(p-t*L);
  return (1.0-smoothstep(0.96,1.04,d))*(1.0-smoothstep(-0.05,0.05,t));
}
`;

const POINT_SIZE_GLSL = /* glsl */`
uniform float uViewH;
float pxSize(float worldSize,vec4 mv){
  return worldSize*projectionMatrix[1][1]*uViewH*0.5/max(-mv.z,0.0001);
}
`;

/* ---------- Capa de superficie: luces, carreteras, bruma, ruinas ---------- */

const OVERLAY_VERT = /* glsl */`
varying vec3 vObj;varying vec3 vNormalV;
void main(){
  vObj=normalize(position);
  vNormalV=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

const OVERLAY_FRAG = /* glsl */`
uniform float uHasTerrain;uniform vec3 uSeedOffset;uniform float uFreq;uniform float uWarp;uniform float uSea;uniform int uOctaves;
uniform vec3 uCivOff;uniform vec3 uLightW;uniform float uTime;
uniform float uFire,uCity,uRoad,uFarm,uHaze,uEcu,uRuin,uBright,uMulti;
uniform vec3 uCol1,uCol2,uHazeCol,uUrbanCol;
varying vec3 vObj;varying vec3 vNormalV;
${NOISE_GLSL}
float heightAt(vec3 n,int oct){
  vec3 p=n*uFreq+uSeedOffset;
  vec3 wv=vec3(snoise(p+vec3(1.7)),snoise(p+vec3(8.3)),snoise(p+vec3(3.1)));
  float h=fbm(p+wv*uWarp,oct)*0.5+0.5;
  return clamp((h-0.5)*1.6+0.5,0.0,1.0);
}
// Línea antialiasada de semiancho w a partir de una distancia d (las líneas más finas que un píxel se atenúan)
float lineAA(float d,float w){
  float fw=fwidth(d);
  float a=1.0-smoothstep(w,w+fw*1.5,d);
  return a*clamp(w/(fw+1e-5)*1.5,0.15,1.0);
}
// Worley con los puntos proyectados sobre la esfera (radio K). Devuelve F1, F2, id del más cercano y la
// distancia al tramo que une los dos puntos más cercanos: así salen carreteras que van de ciudad a ciudad.
vec4 worleyR(vec3 n,float K,vec3 off,out float id2){
  vec3 p=n*K;vec3 q=p+off;vec3 i=floor(q);
  float F1=1e9,F2=1e9,i1=0.0,i2=0.0;vec3 c1=p,c2=p;
  for(int z=-1;z<=1;z++)for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec3 g=i+vec3(float(x),float(y),float(z));
    vec3 fp=normalize(g+hash33(g)-off)*K;
    vec3 r=fp-p;float d=dot(r,r);
    float h=hash13(g+0.37);
    if(d<F1){F2=F1;c2=c1;i2=i1;F1=d;c1=fp;i1=h;}
    else if(d<F2){F2=d;c2=fp;i2=h;}
  }
  vec3 e=c2-c1;float t=clamp(dot(p-c1,e)/max(dot(e,e),1e-6),0.0,1.0);
  id2=i2;
  return vec4(sqrt(F1),sqrt(F2),i1,length(p-c1-e*t));
}
void main(){
  if(uFire+uCity+uRoad+uFarm+uHaze+uEcu+uRuin<0.001)discard;
  vec3 n=normalize(vObj);
  float land=1.0,coast=0.0,elev=0.3;
  if(uHasTerrain>0.5){
    float h=heightAt(n,uOctaves);
    if(uSea>0.0){land=smoothstep(uSea,uSea+0.006,h);elev=h-uSea;coast=1.0-smoothstep(0.0,0.12,elev);}
    else{elev=h;}
  }else if(uHasTerrain<-0.5){
    // Terreno desconocido: continentes propios a partir de ruido
    float h=fbm(n*1.8+uCivOff*0.7,4)*0.5+0.5;
    land=smoothstep(0.47,0.49,h);elev=h-0.48;coast=1.0-smoothstep(0.0,0.1,elev);
  }
  vec3 L=normalize((viewMatrix*vec4(uLightW,0.0)).xyz);
  vec3 N=normalize(vNormalV);
  float ndl=dot(N,L);
  float night=1.0-smoothstep(-0.1,0.16,ndl);
  float day=smoothstep(-0.12,0.25,ndl);
  float lit=0.25+0.85*max(ndl,0.0);

  // Densidad de población: costas y llanuras, nunca cumbres
  float dn=fbm(n*2.3+uCivOff,3)*0.5+0.5;
  float dens=smoothstep(0.36,0.7,dn+coast*0.22-max(elev-0.4,0.0)*0.9)*land;
  dens=max(dens,uEcu*land*0.85);

  float grain=smoothstep(-0.35,0.75,snoise(n*96.0+uCivOff));
  float grain2=smoothstep(-0.2,0.8,snoise(n*260.0+uCivOff.yzx));

  // Grandes ciudades y autopistas entre ellas
  float idB;vec4 W1=worleyR(n,5.5,uCivOff,idB);
  float on1=step(0.22,W1.z)*smoothstep(0.08,0.35,dens);
  float rBig=mix(0.05,0.3,W1.z*W1.z)*(0.4+0.6*dens);
  float big=on1*exp(-W1.x/rBig*2.0)*smoothstep(rBig*2.0,0.0,W1.x);
  float hw=lineAA(W1.w,0.010)*on1*step(0.22,idB)*smoothstep(0.12,0.45,dens);
  // Pueblos y carreteras locales
  float idT;vec4 W2=worleyR(n,17.0,uCivOff.zxy,idT);
  float on2=step(0.45,W2.z)*smoothstep(0.25,0.6,dens);
  float rTown=mix(0.05,0.14,W2.z)*(0.5+0.5*dens);
  float town=on2*smoothstep(rTown,0.0,W2.x);
  float lr=lineAA(W2.w,0.022)*on2*step(0.45,idT)*smoothstep(0.4,0.85,dens);
  float cityM=clamp(big*1.5+town*0.8,0.0,1.6)*land;
  float roads=(hw*(0.5+0.5*grain2)+lr*0.6*grain2)*land;

  // Aldeas, hogueras, calles de la ecumenópolis y arcologías en el mar (solo si hacen falta)
  vec3 w3=vec3(1.0,1.0,0.5);
  if(uFire>0.0||uEcu>0.0||uFarm>0.0)w3=worley(n*42.0+uCivOff.yzx);
  float fire=smoothstep(0.1,0.0,w3.x)*step(0.58,w3.z)*smoothstep(0.25,0.65,dn+coast*0.35)*land;
  fire*=0.55+0.45*sin(uTime*(2.5+w3.z*6.0)+w3.z*60.0);
  float streets=lineAA(w3.y-w3.x,0.03);
  float ecu=land*(0.06+0.7*grain*grain2)+land*streets*0.45+lr*land*0.6+hw*land+big*0.8;
  ecu+=(1.0-land)*smoothstep(0.12,0.0,w3.x)*step(0.72,w3.z)*(uHasTerrain!=0.0?1.2:0.0);

  // Color de cada ciudad (las culturas artísticas pintan cada ciudad de un color)
  vec3 cA=mix(uCol1,uCol2,uMulti*step(0.5,fract(W1.z*7.3)));
  vec3 lights=vec3(0.0);
  lights+=vec3(1.0,0.5,0.18)*fire*uFire*0.9;
  lights+=cA*cityM*(0.2+1.25*grain*(0.45+0.55*grain2))*uCity;
  lights+=mix(uCol2,uCol1,0.4)*roads*uRoad*0.85;
  lights+=mix(uCol1,uCol2,0.35)*ecu*uEcu*0.7;
  lights+=cA*(big*0.18+smoothstep(0.35,0.95,dens)*0.025)*(uCity+uEcu); // resplandor del cielo
  lights*=uBright;

  // Día: campos, manchas urbanas, ruinas, bruma (composición "over" premultiplicada)
  vec4 acc=vec4(0.0);
  float fieldMask=uFarm*0.26*smoothstep(0.2,0.6,dn+coast*0.2)*land*(1.0-clamp(cityM,0.0,1.0))*day;
  vec3 fieldCol=mix(vec3(0.62,0.55,0.24),vec3(0.3,0.46,0.18),w3.z);
  fieldCol=mix(fieldCol,vec3(0.55,0.38,0.2),step(0.75,hash13(floor(n*120.0))));
  acc=vec4(fieldCol*lit*fieldMask,fieldMask)+acc*(1.0-fieldMask);
  float urban=clamp((cityM*0.55+roads*0.3)*uCity+uEcu*land*(0.5+0.3*streets),0.0,0.9)*day;
  vec3 urbanCol=uUrbanCol*(0.75+0.5*grain)*lit;
  acc=vec4(urbanCol*urban,urban)+acc*(1.0-urban);
  if(uRuin>0.0){
    // cicatrices donde hubo ciudades, cráteres vitrificados y brasas que todavía parpadean
    float scar=clamp(cityM*0.9+roads*0.6+uRuin*land*0.12,0.0,1.0)*uRuin*0.85;
    acc=vec4(vec3(0.05,0.04,0.035)*lit*scar,scar)+acc*(1.0-scar);
    float crater=smoothstep(0.022,0.0,abs(W1.x-0.08-0.1*fract(W1.z*13.7)))*step(0.86,W1.z)*on1*land*uRuin;
    vec3 glass=vec3(0.35,0.85,0.8)*(0.35+lit);
    acc=vec4(glass*crater*0.75,crater*0.75)+acc*(1.0-crater*0.75);
    float hc=hash13(floor(n*70.0));
    float ember=clamp(cityM,0.0,1.0)*step(0.9,hc)*(0.4+0.6*sin(uTime*1.7+hc*40.0));
    lights+=vec3(1.0,0.35,0.12)*ember*uRuin*0.9+vec3(0.3,0.9,0.85)*crater*0.08;
  }
  float haze=uHaze*(0.12+0.3*dens+0.15*smoothstep(0.3,0.9,dn))*day;
  acc=vec4(uHazeCol*lit*haze,haze)+acc*(1.0-haze);

  vec3 add=lights*night*(1.0-haze*0.5);
  gl_FragColor=vec4(acc.rgb+add,acc.a);
  #include <colorspace_fragment>
}`;

// Halo de bruma en el limbo (contaminación)
const HAZE_VERT = /* glsl */`
varying vec3 vNormalV;varying vec3 vViewPos;
void main(){vNormalV=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vViewPos=mv.xyz;gl_Position=projectionMatrix*mv;}`;
const HAZE_FRAG = /* glsl */`
uniform vec3 uColor;uniform float uStrength;uniform vec3 uLightW;
varying vec3 vNormalV;varying vec3 vViewPos;
void main(){
  vec3 N=normalize(vNormalV);vec3 V=normalize(-vViewPos);
  vec3 L=normalize((viewMatrix*vec4(uLightW,0.0)).xyz);
  float rim=pow(1.0-abs(dot(N,V)),2.5);
  float sun=smoothstep(-0.3,0.6,dot(N,L));
  gl_FragColor=vec4(uColor*rim*sun*uStrength,1.0);
  #include <colorspace_fragment>
}`;

/* ---------- Puntos genéricos: satélites, tráfico, escaladores, ciudades flotantes ---------- */

const SAT_VERT = /* glsl */`
attribute vec4 aOrb;   // radio, inclinación, nodo, fase
attribute vec4 aMisc;  // velocidad, tamaño, rango (0..1), color (0..1)
uniform float uTime,uFrac,uDead,uScale;uniform vec3 uLightW;
varying vec3 vCol;varying float vAlpha;
${SHADOW_GLSL}
${POINT_SIZE_GLSL}
uniform vec3 uColA,uColB;
void main(){
  if(aMisc.z>uFrac){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vAlpha=0.0;return;}
  float sp=aMisc.x*(uDead>0.5?0.35:1.0);
  float r=aOrb.x*(uDead>0.5?(1.0+0.15*sin(aOrb.w*13.0)):1.0);
  float a=aOrb.w+uTime*sp;
  vec3 p=vec3(cos(a)*r,0.0,sin(a)*r);
  float ci=cos(aOrb.y),si=sin(aOrb.y);p=vec3(p.x,p.y*ci-p.z*si,p.y*si+p.z*ci);
  float cn=cos(aOrb.z),sn=sin(aOrb.z);p=vec3(p.x*cn+p.z*sn,p.y,-p.x*sn+p.z*cn);
  vec4 w=modelMatrix*vec4(p,1.0);
  vec3 L=normalize(uLightW);
  float sh=planetShadow(w.xyz,L);
  vec4 mv=viewMatrix*w;
  gl_Position=projectionMatrix*mv;
  float glint=0.55+0.45*sin(uTime*(1.0+aMisc.x*7.0)+aOrb.w*30.0);
  vec3 lit=mix(uColA,uColB,aMisc.w)*glint;
  float blink=step(0.93,fract(uTime*0.6+aOrb.w*2.7));
  vec3 dark=vec3(1.0,0.25,0.3)*blink*0.9;
  vCol=mix(lit,dark,sh);
  vAlpha=mix(1.0,blink*0.9,sh);
  if(uDead>0.5){vCol=vec3(0.55,0.5,0.48)*(1.0-sh*0.85);vAlpha=0.75*(1.0-sh*0.8);}
  float s=pxSize(aMisc.y*uScale,mv);
  vAlpha*=clamp(s/1.5,0.25,1.0);
  gl_PointSize=clamp(s,1.5,24.0);
}`;

const POINT_FRAG = /* glsl */`
varying vec3 vCol;varying float vAlpha;
void main(){
  vec2 c=gl_PointCoord-0.5;float d=length(c);
  float a=smoothstep(0.5,0.0,d);a=a*a;
  if(a*vAlpha<0.01)discard;
  gl_FragColor=vec4(vCol*a*vAlpha,a*vAlpha);
  #include <colorspace_fragment>
}`;

// Tráfico: 0 órbita, 1 ascenso en espiral, 2 salida al espacio, 3 hacia la puerta estelar
const TRAFFIC_VERT = /* glsl */`
attribute vec4 aLane;  // tipo, p1, p2, p3
attribute vec4 aShip;  // fase, velocidad, tamaño, rango
attribute float aTrail;// 0 = cabeza, 1 = cola
uniform float uTime,uFrac,uScale,uGateOn;uniform vec3 uGate;uniform vec3 uColA,uColB,uColC;
varying vec3 vCol;varying float vAlpha;
${POINT_SIZE_GLSL}
vec3 rotIN(vec3 p,float inc,float node){
  float ci=cos(inc),si=sin(inc);p=vec3(p.x,p.y*ci-p.z*si,p.y*si+p.z*ci);
  float cn=cos(node),sn=sin(node);return vec3(p.x*cn+p.z*sn,p.y,-p.x*sn+p.z*cn);
}
void main(){
  float type=aLane.x;
  if(aShip.w>uFrac||(type>2.5&&uGateOn<0.5)){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vAlpha=0.0;return;}
  float lag=aTrail*0.012;
  float t=fract(aShip.x+uTime*aShip.y-lag);
  vec3 p;vec3 col=uColA;float alpha=1.0;
  if(type<0.5){
    float a=t*6.2831853;
    p=rotIN(vec3(cos(a),0.0,sin(a))*aLane.y,aLane.z,aLane.w);
  }else if(type<1.5){
    float s=smoothstep(0.0,1.0,t);
    float r=mix(1.015,aLane.y,s);
    float a=aLane.w+s*5.0;
    p=rotIN(vec3(cos(a),0.0,sin(a))*r,aLane.z*s,0.0);
    col=uColB;alpha=smoothstep(0.0,0.08,t)*(1.0-smoothstep(0.9,1.0,t));
  }else if(type<2.5){
    vec3 dir=normalize(rotIN(vec3(1.0,0.0,0.0),aLane.z,aLane.w));
    float d=aLane.y+t*t*28.0;
    p=dir*d;col=uColC;alpha=1.0-smoothstep(0.55,1.0,t);
  }else{
    vec3 a0=rotIN(vec3(cos(aLane.w),0.0,sin(aLane.w))*aLane.y,aLane.z,0.0);
    float s=t*t*(3.0-2.0*t);
    p=mix(a0,uGate,s)+vec3(0.0,sin(s*3.1416)*0.4,0.0);
    col=mix(uColC,vec3(1.0),s*0.5);alpha=smoothstep(0.0,0.05,t)*(1.0-smoothstep(0.93,1.0,t));
  }
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  float s=pxSize(aShip.z*uScale*(1.0-aTrail*0.7),mv);
  vCol=col*(1.0-aTrail*0.6);
  vAlpha=alpha*(1.0-aTrail*0.75)*clamp(s/1.4,0.3,1.0);
  gl_PointSize=clamp(s,1.2,18.0);
}`;

// Puntos fijos sobre una esfera (ciudades flotantes, colonias lunares), brillan de noche
const SURFPTS_VERT = /* glsl */`
attribute vec2 aInfo; // rango, tamaño
uniform float uFrac,uTime,uScale;uniform vec3 uLightW;uniform vec3 uCol;
varying vec3 vCol;varying float vAlpha;
${POINT_SIZE_GLSL}
void main(){
  if(aInfo.x>uFrac){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vAlpha=0.0;return;}
  vec4 w=modelMatrix*vec4(position,1.0);
  vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
  float ndl=dot(normalize(w.xyz-c),normalize(uLightW));
  float night=1.0-smoothstep(-0.15,0.2,ndl);
  vec4 mv=viewMatrix*w;
  gl_Position=projectionMatrix*mv;
  float s=pxSize(aInfo.y*uScale,mv);
  vCol=uCol*(0.6+0.4*sin(uTime*0.8+aInfo.x*90.0));
  vAlpha=(0.2+0.8*night)*clamp(s/1.5,0.3,1.0);
  gl_PointSize=clamp(s,1.2,20.0);
}`;

// Escaladores de los ascensores espaciales (en el marco de la superficie)
const CLIMBER_VERT = /* glsl */`
attribute vec4 aC; // longitud, fase, velocidad, rango (ascensor)
uniform float uTime,uFrac,uTop,uScale,uDead;uniform vec3 uCol;
varying vec3 vCol;varying float vAlpha;
${POINT_SIZE_GLSL}
void main(){
  if(aC.w>uFrac||uDead>0.5){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vAlpha=0.0;return;}
  float t=fract(aC.y+uTime*aC.z);
  float u=t<0.5?t*2.0:2.0-t*2.0;
  u=u*u*(3.0-2.0*u);
  float r=mix(1.01,uTop,u);
  vec3 p=vec3(cos(aC.x),0.0,-sin(aC.x))*r;
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  float s=pxSize(0.012*uScale,mv);
  vCol=uCol;vAlpha=clamp(s/1.4,0.4,1.0);
  gl_PointSize=clamp(s,1.6,14.0);
}`;

/* ---------- Casco de estaciones y megaestructuras ---------- */

const HULL_VERT = /* glsl */`
attribute float aTint; // 0 casco, 1 panel solar, 2 luz pura
varying vec3 vN;varying vec3 vW;varying vec3 vLocal;varying float vTint;
void main(){
  vec4 lp=vec4(position,1.0);vec3 ln=normal;
  #ifdef USE_INSTANCING
  lp=instanceMatrix*lp;ln=mat3(instanceMatrix)*ln;
  #endif
  vec4 w=modelMatrix*lp;
  vW=w.xyz;vN=normalize(mat3(modelMatrix)*ln);vLocal=position;vTint=aTint;
  gl_Position=projectionMatrix*viewMatrix*w;
}`;
const HULL_FRAG = /* glsl */`
uniform vec3 uLightW,uHull,uPanel,uWin;uniform float uAlive,uTime,uWinScale;
varying vec3 vN;varying vec3 vW;varying vec3 vLocal;varying float vTint;
${SHADOW_GLSL}
float h13(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
void main(){
  vec3 L=normalize(uLightW);
  vec3 N=normalize(vN);
  if(!gl_FrontFacing)N=-N;
  float sh=planetShadow(vW,L);
  float d=max(dot(N,L),0.0)*(1.0-sh);
  vec3 V=normalize(cameraPosition-vW);
  vec3 base=vTint>0.5?uPanel:uHull;
  if(uAlive<0.5)base*=vec3(0.55,0.5,0.47);
  vec3 c=base*(0.035+d*1.15);
  float spec=pow(max(dot(reflect(-L,N),V),0.0),vTint>0.5?60.0:24.0)*(1.0-sh);
  c+=vec3(1.0,0.95,0.88)*spec*(vTint>0.5?0.9:0.35);
  vec3 g=floor(vLocal*uWinScale);
  float h=h13(g);
  float win=step(0.6,h)*step(vTint,0.5)*uAlive*(0.65+0.35*sin(uTime*0.4+h*40.0));
  c+=uWin*win*(0.25+0.75*(1.0-d));
  if(vTint>1.5)c=uWin*(uAlive>0.5?1.6:0.05);
  gl_FragColor=vec4(c,1.0);
  #include <colorspace_fragment>
}`;

// Anillo orbital: banda con paneles, ventanas, frente de construcción y huecos si está en ruinas
const RING_VERT = /* glsl */`
varying vec3 vW;varying vec3 vLocal;varying vec3 vN;
void main(){vLocal=position;vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const RING_FRAG = /* glsl */`
uniform vec3 uLightW,uHull,uWin,uGlow;uniform float uBuild,uDead,uTime,uHalfH;
varying vec3 vW;varying vec3 vLocal;varying vec3 vN;
${SHADOW_GLSL}
float h11(float x){return fract(sin(x*127.1)*43758.5453);}
void main(){
  float ang=atan(vLocal.z,vLocal.x)/6.2831853+0.5;
  if(ang>uBuild)discard;
  float seg=floor(ang*180.0);
  if(uDead>0.5&&h11(seg+3.0)<0.32)discard;
  vec3 L=normalize(uLightW);
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;
  float sh=planetShadow(vW,L);
  float d=max(dot(N,L),0.0)*(1.0-sh);
  float v=vLocal.y/uHalfH*0.5+0.5;
  float panel=step(0.04,fract(ang*720.0))*step(0.08,v)*step(v,0.92);
  vec3 c=uHull*(0.05+d*1.1)*(0.75+0.25*panel);
  float rows=step(0.5,fract(v*6.0));
  float win=step(0.55,h11(seg*7.0+floor(ang*2400.0)*0.37+floor(v*6.0)))*rows*panel*(1.0-uDead);
  c+=uWin*win*(0.2+0.9*(1.0-d))*0.9;
  float edge=1.0-smoothstep(0.0,0.06,min(v,1.0-v));
  c+=uGlow*edge*(1.0-uDead)*0.5;
  float front=smoothstep(0.012,0.0,uBuild-ang)*step(uBuild,0.999);
  c+=vec3(1.0,0.85,0.6)*front*(1.5+sin(uTime*12.0));
  gl_FragColor=vec4(c,1.0);
  #include <colorspace_fragment>
}`;

// Líneas brillantes (ascensores, celosía, haces, carriles): alpha por segmento y pulso
const GLOWLINE_VERT = /* glsl */`
attribute float aRnd;attribute float aU;
varying float vRnd;varying float vU;
void main(){vRnd=aRnd;vU=aU;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const GLOWLINE_FRAG = /* glsl */`
uniform vec3 uCol;uniform float uOpacity,uBuild,uTime,uPulse,uDead;
varying float vRnd;varying float vU;
void main(){
  if(vRnd>uBuild)discard;
  if(uDead>0.5&&fract(vRnd*91.7)<0.45)discard;
  float p=uPulse>0.0?(0.35+0.65*pow(0.5+0.5*sin(vU*30.0-uTime*uPulse),6.0)):1.0;
  vec3 c=uCol*uOpacity*p*(uDead>0.5?0.08:1.0);
  gl_FragColor=vec4(c,1.0);
  #include <colorspace_fragment>
}`;

// Puerta estelar: vórtice
const PORTAL_VERT = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const PORTAL_FRAG = /* glsl */`
uniform float uTime,uOn;uniform vec3 uColA,uColB;varying vec2 vUv;
void main(){
  vec2 c=vUv-0.5;float r=length(c)*2.0;if(r>1.0)discard;
  float a=atan(c.y,c.x);
  float sw=sin(a*5.0+r*14.0-uTime*2.2)*0.5+0.5;
  float sw2=sin(a*3.0-r*9.0+uTime*1.3)*0.5+0.5;
  vec3 col=mix(uColA,uColB,sw*0.7+sw2*0.3);
  float core=smoothstep(0.55,0.0,r);
  float edge=smoothstep(0.75,1.0,r)*(1.0-smoothstep(0.97,1.0,r));
  float a1=(0.25+0.6*sw*sw2+core*0.8+edge)*uOn*(1.0-smoothstep(0.92,1.0,r)*0.5);
  gl_FragColor=vec4(col*a1+vec3(1.0)*core*0.5*uOn,1.0);
  #include <colorspace_fragment>
}`;

// Mundo-anillo: cara interior con paisaje, exterior casco
const WORLDRING_FRAG = /* glsl */`
uniform vec3 uLightW,uHull,uWin;uniform float uBuild,uDead,uTime,uHalfH;uniform vec3 uLand,uSea;
varying vec3 vW;varying vec3 vLocal;varying vec3 vN;
${SHADOW_GLSL}
float h11(float x){return fract(sin(x*127.1)*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  float a=h11(i.x+i.y*57.0),b=h11(i.x+1.0+i.y*57.0),c=h11(i.x+(i.y+1.0)*57.0),d=h11(i.x+1.0+(i.y+1.0)*57.0);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
void main(){
  float ang=atan(vLocal.z,vLocal.x)/6.2831853+0.5;
  if(ang>uBuild)discard;
  if(uDead>0.5&&h11(floor(ang*60.0))<0.3)discard;
  vec3 L=normalize(uLightW);
  vec3 N=normalize(vN);bool inner=!gl_FrontFacing;if(inner)N=-N;
  float sh=planetShadow(vW,L);
  float d=max(dot(N,L),0.0)*(1.0-sh);
  float v=vLocal.y/uHalfH*0.5+0.5;
  vec3 c;
  if(inner&&v>0.06&&v<0.94){
    vec2 q=vec2(ang*700.0,v*9.0);
    float n=vn(q)*0.55+vn(q*2.7+3.1)*0.3+vn(q*7.1+1.7)*0.15;
    vec3 ground=mix(uSea,mix(uLand,uLand*1.35,n),smoothstep(0.47,0.53,n));
    if(uDead>0.5)ground=mix(vec3(0.25,0.22,0.2),vec3(0.15),n);
    c=ground*(0.08+d*1.1);
    float city=smoothstep(0.68,0.8,vn(q*4.3))*smoothstep(0.5,0.55,n)*(1.0-uDead);
    c+=uWin*city*(1.0-d)*0.8;
  }else{
    c=uHull*(0.05+d*1.0);
    float wall=1.0-smoothstep(0.0,0.06,min(v,1.0-v));
    c+=uWin*wall*0.4*(1.0-uDead);
  }
  float front=smoothstep(0.01,0.0,uBuild-ang)*step(uBuild,0.999);
  c+=vec3(1.0,0.85,0.6)*front*(1.5+sin(uTime*12.0));
  gl_FragColor=vec4(c,1.0);
  #include <colorspace_fragment>
}`;

// Enjambre de Dyson alrededor de la estrella
const DYSON_VERT = /* glsl */`
attribute vec4 aOrb;attribute vec2 aMisc; // velocidad, rango
uniform float uTime,uFrac,uScale,uDead;uniform vec3 uColA,uColB;
varying vec3 vCol;varying float vAlpha;
${POINT_SIZE_GLSL}
void main(){
  if(aMisc.y>uFrac){gl_Position=vec4(2.0,2.0,2.0,1.0);gl_PointSize=0.0;vAlpha=0.0;return;}
  float a=aOrb.w+uTime*aMisc.x*(uDead>0.5?0.2:1.0);
  vec3 p=vec3(cos(a),0.0,sin(a))*aOrb.x;
  float ci=cos(aOrb.y),si=sin(aOrb.y);p=vec3(p.x,p.y*ci-p.z*si,p.y*si+p.z*ci);
  float cn=cos(aOrb.z),sn=sin(aOrb.z);p=vec3(p.x*cn+p.z*sn,p.y,-p.x*sn+p.z*cn);
  vec4 w=modelMatrix*vec4(p,1.0);
  vec3 star=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
  vec3 toStar=normalize(star-w.xyz),toCam=normalize(cameraPosition-w.xyz);
  float face=dot(toStar,toCam);
  float glint=pow(max(face,0.0),2.0);
  vec4 mv=viewMatrix*w;
  gl_Position=projectionMatrix*mv;
  vCol=mix(uColA*0.08,mix(uColA,uColB,fract(aOrb.w*3.1)),glint)*(uDead>0.5?0.15:1.0);
  vAlpha=mix(0.85,1.0,glint);
  float s=pxSize(0.06*uScale,mv);
  gl_PointSize=clamp(s,1.4,10.0);
}`;
const DYSON_FRAG = /* glsl */`
varying vec3 vCol;varying float vAlpha;
void main(){
  vec2 c=abs(gl_PointCoord-0.5);
  float hex=max(c.x*0.866+c.y*0.5,c.y);
  if(hex>0.45||vAlpha<0.01)discard;
  gl_FragColor=vec4(vCol,vAlpha);
  #include <colorspace_fragment>
}`;

/* ------------------------------------------------------------------ */
/*  Geometría procedural                                               */
/* ------------------------------------------------------------------ */

// Une geometrías (no indexadas) con un atributo aTint por pieza. Sin dependencias de addons.
function mergeParts(parts) {
  let count = 0;
  const flat = parts.map(({ geo, tint, m }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    count += g.attributes.position.count;
    return { g, tint };
  });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), tin = new Float32Array(count);
  let o = 0;
  for (const { g, tint } of flat) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    tin.fill(tint, o, o + n);
    o += n;
    g.dispose();
  }
  for (const p of parts) p.geo.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('aTint', new THREE.BufferAttribute(tin, 1));
  out.computeBoundingSphere();
  return out;
}
const M = () => new THREE.Matrix4();
const mT = (x, y, z) => M().makeTranslation(x, y, z);
const mRX = (a) => M().makeRotationX(a);
const mRZ = (a) => M().makeRotationZ(a);
const mRY = (a) => M().makeRotationY(a);
const mul = (...ms) => ms.reduce((acc, m) => acc.multiply(m), M());

// Estación de tamaño ~1 (se escala después). Varios arquetipos.
function stationGeometry(kind, rng) {
  const P = [];
  const add = (geo, tint = 0, m = null) => P.push({ geo, tint, m });
  switch (kind) {
    case 'rueda': {
      add(new THREE.TorusGeometry(0.85, 0.09, 10, 48));
      add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16), 0, mRX(Math.PI / 2));
      for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), 0, mul(mRZ(i * Math.PI / 2), mT(0, 0.45, 0)));
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), 0, mRX(Math.PI / 2));
      add(new THREE.BoxGeometry(0.9, 0.02, 0.3), 1, mT(0, 0, 0.85));
      add(new THREE.BoxGeometry(0.9, 0.02, 0.3), 1, mT(0, 0, -0.85));
      add(new THREE.SphereGeometry(0.03, 6, 4), 2, mT(0, 0, 0.72));
      break;
    }
    case 'aguja': {
      add(new THREE.CylinderGeometry(0.08, 0.08, 2.0, 12));
      const n = rng.int(3, 6);
      for (let i = 0; i < n; i++) {
        const y = -0.8 + (1.6 * i) / (n - 1);
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.14, 16), 0, mT(0, y, 0));
        add(new THREE.BoxGeometry(1.4, 0.015, 0.22), 1, mT(0, y + 0.1, 0));
      }
      add(new THREE.SphereGeometry(0.035, 6, 4), 2, mT(0, 1.02, 0));
      add(new THREE.ConeGeometry(0.12, 0.25, 12), 0, mT(0, -1.1, 0));
      break;
    }
    case 'doble': {
      add(new THREE.TorusGeometry(0.75, 0.06, 8, 40));
      add(new THREE.TorusGeometry(0.75, 0.06, 8, 40), 0, mRY(Math.PI / 2));
      add(new THREE.IcosahedronGeometry(0.28, 1));
      add(new THREE.BoxGeometry(0.03, 1.5, 0.03));
      add(new THREE.BoxGeometry(1.2, 0.015, 0.35), 1, mT(0, 0.8, 0));
      add(new THREE.SphereGeometry(0.03, 6, 4), 2, mT(0, 0.78, 0));
      break;
    }
    case 'colmena': {
      const n = rng.int(9, 15);
      for (let i = 0; i < n; i++) {
        const r = rng.range(0.12, 0.3);
        const d = rng.range(0, 0.55);
        const th = rng.range(0, Math.PI * 2), ph = rng.range(-1, 1);
        add(new THREE.IcosahedronGeometry(r, 1), 0, mT(Math.cos(th) * d * Math.sqrt(1 - ph * ph), ph * d, Math.sin(th) * d * Math.sqrt(1 - ph * ph)));
      }
      add(new THREE.SphereGeometry(0.035, 6, 4), 2, mT(0, 0.75, 0));
      break;
    }
    case 'cristal': {
      const n = rng.int(5, 9);
      for (let i = 0; i < n; i++) {
        const h = rng.range(0.5, 1.4);
        add(new THREE.OctahedronGeometry(1, 0), i % 3 === 0 ? 1 : 0,
          mul(mRZ(rng.range(-1, 1)), mRX(rng.range(-1, 1)), M().makeScale(0.12, h * 0.6, 0.12)));
      }
      add(new THREE.SphereGeometry(0.04, 6, 4), 2);
      break;
    }
    default: { // 'esfera'
      add(new THREE.IcosahedronGeometry(0.45, 2));
      add(new THREE.TorusGeometry(0.7, 0.04, 6, 40), 0, mRX(Math.PI / 2));
      add(new THREE.BoxGeometry(1.8, 0.015, 0.25), 1);
      add(new THREE.SphereGeometry(0.03, 6, 4), 2, mT(0, 0.5, 0));
    }
  }
  return mergeParts(P);
}

function glowLineGeometry(segments) {
  // segments: [[x1,y1,z1,x2,y2,z2,rnd,u1,u2], ...]
  const pos = new Float32Array(segments.length * 6), rnd = new Float32Array(segments.length * 2), uu = new Float32Array(segments.length * 2);
  segments.forEach((s, i) => {
    pos.set(s.slice(0, 6), i * 6);
    rnd[i * 2] = rnd[i * 2 + 1] = s[6];
    uu[i * 2] = s[7] ?? 0; uu[i * 2 + 1] = s[8] ?? 0;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
  g.setAttribute('aU', new THREE.BufferAttribute(uu, 1));
  return g;
}

function circleSegments(r, inc, node, n, rnd = 0) {
  const segs = [];
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  const e = new THREE.Euler(inc, node, 0, 'YXZ');
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    v.set(Math.cos(a0) * r, 0, Math.sin(a0) * r).applyEuler(e);
    w.set(Math.cos(a1) * r, 0, Math.sin(a1) * r).applyEuler(e);
    segs.push([v.x, v.y, v.z, w.x, w.y, w.z, rnd, i / n, (i + 1) / n]);
  }
  return segs;
}

/* ------------------------------------------------------------------ */
/*  Render                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_LIGHT = new THREE.Vector3(1, 0.3, 0.3).normalize();

/**
 * Crea una civilización renderizable.
 * @param {string|number|object} seedOrMeta  Semilla (normalmente la del planeta) o un meta de civilizationSpec.
 * @param {object} [planetMeta] meta del planeta (de planetas.js).
 * @param {{nivel?:number, estado?:string, star?:false|{position:THREE.Vector3, radius:number}, detalle?:'alta'|'media'|'baja', viewHeight?:number}} [opts]
 */
export function createCivilization(seedOrMeta, planetMeta = {}, opts = {}) {
  const meta = typeof seedOrMeta === 'object' && seedOrMeta?.version
    ? seedOrMeta
    : civilizationSpec(seedOrMeta, planetMeta, opts);
  if (opts.nivel != null) describir(meta, opts.nivel, opts.estado ?? (meta.estado === 'ninguna' ? 'viva' : meta.estado));
  // Si la semilla dice "no hay nadie" pero se pide un nivel, aparece igualmente (útil para el deslizador)
  let estado = meta.estado === 'ninguna' ? 'viva' : meta.estado;
  let nivel = meta.nivel;
  describir(meta, nivel, estado);
  const detalle = opts.detalle || 'alta';
  const lowDetail = detalle === 'baja';
  const qMul = detalle === 'alta' ? 1 : detalle === 'media' ? 0.6 : 0.3;

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const timeU = [];
  const scaleU = [];   // uniforms uScale (tamaño de mundo del planeta)
  const viewHU = [];   // uniforms uViewH
  const lightU = [];   // uniforms uLightW -> mismo Vector3 que el planeta
  const planetCU = []; const planetRU = [];
  const deadU = [];
  let viewH = opts.viewHeight || (typeof window !== 'undefined' ? window.innerHeight : 800);

  const C = (hex) => new THREE.Color(hex);
  const colA = C(meta.paleta.luz), colB = C(meta.paleta.luz2), colAcc = C(meta.paleta.acento);
  const rng = makeRng(meta.seed, 'civ-render');
  const civOff = new THREE.Vector3(rng.range(-50, 50), rng.range(-50, 50), rng.range(-50, 50));

  let attached = null; // { planet, surf, orbit, lightDir }
  let lightDir = DEFAULT_LIGHT.clone();
  const planetC = new THREE.Vector3(); let planetR = 1;
  const parts = {}; // referencias para setNivel
  let time = 0;

  function commonUniforms(extra = {}) {
    const u = {
      uTime: { value: 0 }, uViewH: { value: viewH }, uScale: { value: 1 }, uLightW: { value: lightDir },
      uPlanetC: { value: planetC }, uPlanetR: { value: 1 }, uDead: { value: 0 }, ...extra,
    };
    timeU.push(u.uTime); viewHU.push(u.uViewH); scaleU.push(u.uScale); lightU.push(u.uLightW); planetRU.push(u.uPlanetR); deadU.push(u.uDead);
    return u;
  }
  const pointsMat = (vert, uniforms, blending = THREE.AdditiveBlending) => track(new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: POINT_FRAG, uniforms, transparent: true, depthWrite: false, blending,
  }));
  const hullMat = (hull, panel, win, winScale = 26) => track(new THREE.ShaderMaterial({
    vertexShader: HULL_VERT, fragmentShader: HULL_FRAG,
    uniforms: commonUniforms({ uHull: { value: C(hull) }, uPanel: { value: C(panel) }, uWin: { value: win.clone() }, uAlive: { value: 1 }, uWinScale: { value: winScale } }),
  }));
  const glowMat = (col, opacity, pulse = 0) => track(new THREE.ShaderMaterial({
    vertexShader: GLOWLINE_VERT, fragmentShader: GLOWLINE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: commonUniforms({ uCol: { value: col.clone() }, uOpacity: { value: opacity }, uBuild: { value: 1 }, uPulse: { value: pulse } }),
  }));

  /* ---------- Construcción ---------- */

  function buildSurface(planet, surf) {
    const pu = planet.uniforms || planet.mesh?.material?.uniforms || {};
    const gas = meta.superficie === 'flotante' || pu.uType?.value === 6;
    const hasTerrain = gas ? 0 : (pu.uFreq && pu.uSeedOffset ? 1 : -1);
    const segW = Math.max(96, planet.mesh?.geometry?.parameters?.widthSegments || 128);
    const hazeHex = meta.cultura.id === 'industrial' ? 0x8a6a3c : meta.forma.sinContaminacion ? 0x7a7f99 : 0x9b8560;

    if (!gas) {
      const u = commonUniforms({
        uHasTerrain: { value: hasTerrain },
        uSeedOffset: { value: pu.uSeedOffset ? pu.uSeedOffset.value : new THREE.Vector3() },
        uFreq: { value: pu.uFreq ? pu.uFreq.value : 2 }, uWarp: { value: pu.uWarp ? pu.uWarp.value : 0.3 },
        uSea: { value: pu.uSea ? pu.uSea.value : -1 }, uOctaves: { value: Math.min(pu.uOctaves ? pu.uOctaves.value : 5, lowDetail ? 4 : detalle === 'media' ? 5 : 6) },
        uCivOff: { value: civOff },
        uFire: { value: 0 }, uCity: { value: 0 }, uRoad: { value: 0 }, uFarm: { value: 0 }, uHaze: { value: 0 }, uEcu: { value: 0 }, uRuin: { value: 0 },
        uBright: { value: meta.cultura.brillo }, uMulti: { value: meta.cultura.id === 'artistica' ? 1 : 0 },
        uCol1: { value: colA }, uCol2: { value: colB }, uHazeCol: { value: C(hazeHex) }, uUrbanCol: { value: C(0x6d6880) },
      });
      const geo = track(new THREE.SphereGeometry(1.0025, segW, Math.round(segW / 2)));
      const mat = track(new THREE.ShaderMaterial({
        vertexShader: OVERLAY_VERT, fragmentShader: OVERLAY_FRAG, uniforms: u,
        transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.NormalBlending,
      }));
      mat.extensions = { derivatives: true };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'civ:superficie';
      mesh.renderOrder = -1; // antes que las nubes del planeta: las luces quedan debajo
      surf.add(mesh);
      parts.overlay = { mesh, u };
    }

    // Halo de bruma (contaminación) en el limbo
    {
      const geo = track(new THREE.SphereGeometry(1.045, 48, 24));
      const mat = track(new THREE.ShaderMaterial({
        vertexShader: HAZE_VERT, fragmentShader: HAZE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: C(hazeHex) }, uStrength: { value: 0 }, uLightW: { value: lightDir } },
      }));
      lightU.push(mat.uniforms.uLightW);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'civ:bruma';
      surf.add(mesh);
      parts.haze = { mesh, u: mat.uniforms };
    }

    // Ciudades flotantes (gigantes gaseosos, o especies que flotan)
    if (gas || meta.cantidades.flotantes > 0) {
      const n = Math.max(meta.cantidades.flotantes, 160);
      const r2 = makeRng(meta.seed, 'flot');
      const pos = new Float32Array(n * 3), info = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const lat = Math.asin(r2.range(-0.85, 0.85)), lon = r2.range(0, Math.PI * 2), rr = r2.range(1.006, 1.03);
        pos.set([Math.cos(lat) * Math.cos(lon) * rr, Math.sin(lat) * rr, Math.cos(lat) * Math.sin(lon) * rr], i * 3);
        info[i * 2] = i / n; info[i * 2 + 1] = r2.range(0.01, 0.028) * (r2.chance(0.1) ? 2.2 : 1);
      }
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
      const u = commonUniforms({ uFrac: { value: 0 }, uCol: { value: colA } });
      const pts = new THREE.Points(g, pointsMat(SURFPTS_VERT, u));
      pts.name = 'civ:ciudades-flotantes';
      pts.frustumCulled = false;
      surf.add(pts);
      parts.floating = { pts, u };
    }
  }

  function buildOrbital(planet, orbit, surf) {
    const r = makeRng(meta.seed, 'civ-orbital');
    const Q = meta.cantidades;

    // --- Satélites ---
    {
      const n = Math.round(Q.satelites * qMul);
      const orb = new Float32Array(n * 4), misc = new Float32Array(n * 4);
      const shells = [[1.08, 1.2, 4], [1.25, 1.6, 2], [2.0, 2.15, 1], [1.12, 1.4, 1.5]];
      for (let i = 0; i < n; i++) {
        const sh = r.weighted(shells.map((s, k) => [k, s[2]]));
        const [a, b] = shells[sh];
        const rad = r.range(a, b);
        const inc = sh === 2 ? r.range(-0.04, 0.04) : r.chance(0.3) ? r.range(1.2, 1.7) : r.range(-0.9, 0.9);
        orb.set([rad, inc, r.range(0, Math.PI * 2), r.range(0, Math.PI * 2)], i * 4);
        const speed = 0.9 / Math.pow(rad, 1.5) * (r.chance(0.5) ? 1 : -1) * (sh === 2 ? 0.05 : 1);
        misc.set([speed, r.range(0.008, 0.016), r(), r()], i * 4);
      }
      // rango ordenado por "antigüedad": los primeros en aparecer son los de órbita baja
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4));
      g.setAttribute('aMisc', new THREE.BufferAttribute(misc, 4));
      const u = commonUniforms({ uFrac: { value: 0 }, uColA: { value: C(0xfff4dc) }, uColB: { value: colB } });
      const pts = new THREE.Points(g, pointsMat(SAT_VERT, u));
      pts.name = 'civ:satelites';
      pts.frustumCulled = false;
      orbit.add(pts);
      parts.sats = { pts, u };
    }

    // --- Estaciones ---
    {
      const kinds = meta.estacionTipo ? [meta.estacionTipo, meta.estacionTipo, 'rueda', 'esfera'] : ['rueda', 'aguja', 'doble', 'esfera', 'rueda', 'aguja'];
      const mat = hullMat(r.pick([0xb8b4c8, 0xc9c2b4, 0xa9b3c9, 0xd0c8d8]), r.pick([0x24305e, 0x3a2a66, 0x1e3f55]), colA);
      parts.hullMats = [mat];
      const list = [];
      for (let i = 0; i < Q.estaciones; i++) {
        const kind = kinds[i % kinds.length];
        const geo = track(stationGeometry(kind, makeRng(meta.seed, 'st' + i)));
        const mesh = new THREE.Mesh(geo, mat);
        const size = r.range(0.05, 0.09) * (i === 0 ? 1.7 : 1);
        mesh.scale.setScalar(size);
        mesh.rotation.set(r.range(0, 6), r.range(0, 6), r.range(0, 6));
        const pivot = new THREE.Group();
        pivot.rotation.set(r.range(-0.6, 0.6), r.range(0, Math.PI * 2), r.range(-0.3, 0.3));
        const arm = new THREE.Group();
        arm.rotation.y = r.range(0, Math.PI * 2);
        const rad = 1.3 + i * r.range(0.14, 0.28);
        mesh.position.x = rad;
        arm.add(mesh); pivot.add(arm); orbit.add(pivot);
        mesh.name = `civ:estacion:${kind}`;
        list.push({ pivot, arm, mesh, speed: 0.55 / Math.pow(rad, 1.5), spin: r.range(0.1, 0.5) * (r.chance(0.5) ? 1 : -1), tumble: new THREE.Vector3(r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(-0.4, 0.4)) });
      }
      parts.stations = list;
    }

    // --- Carriles de tráfico (líneas tenues) + naves ---
    {
      const lanes = [];
      const nOrb = 5 + r.int(0, 3);
      for (let i = 0; i < nOrb; i++) lanes.push({ type: 0, p1: r.range(1.12, 2.1), p2: r.range(-0.8, 0.8), p3: r.range(0, Math.PI * 2) });
      for (let i = 0; i < 4; i++) lanes.push({ type: 1, p1: r.range(1.3, 1.9), p2: r.range(-0.6, 0.6), p3: r.range(0, Math.PI * 2) });
      for (let i = 0; i < 3; i++) lanes.push({ type: 2, p1: r.range(1.6, 2.2), p2: r.range(-0.5, 0.5), p3: r.range(0, Math.PI * 2) });
      for (let i = 0; i < 2; i++) lanes.push({ type: 3, p1: r.range(1.3, 1.8), p2: r.range(-0.4, 0.4), p3: r.range(0, Math.PI * 2) });
      const nShips = Math.round(Q.naves * qMul);
      const TR = 5; // puntos por nave (cabeza + estela)
      const laneA = new Float32Array(nShips * TR * 4), shipA = new Float32Array(nShips * TR * 4), trailA = new Float32Array(nShips * TR);
      for (let i = 0; i < nShips; i++) {
        const lane = lanes[r.weighted(lanes.map((l, k) => [k, l.type === 0 ? 3 : l.type === 3 ? 1.2 : 1.5]))];
        const speed = lane.type === 0 ? r.range(0.02, 0.05) * (r.chance(0.5) ? 1 : -1) : lane.type === 1 ? r.range(0.04, 0.08) : lane.type === 2 ? r.range(0.025, 0.05) : r.range(0.03, 0.06);
        const phase = r(), size = r.range(0.01, 0.018) * (r.chance(0.08) ? 1.8 : 1), rank = r();
        for (let k = 0; k < TR; k++) {
          const j = i * TR + k;
          laneA.set([lane.type, lane.p1 + (lane.type === 0 ? r.range(-0.01, 0.01) : 0), lane.p2, lane.p3], j * 4);
          shipA.set([phase, speed, size, rank], j * 4);
          trailA[j] = k / (TR - 1);
        }
      }
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nShips * TR * 3), 3));
      g.setAttribute('aLane', new THREE.BufferAttribute(laneA, 4));
      g.setAttribute('aShip', new THREE.BufferAttribute(shipA, 4));
      g.setAttribute('aTrail', new THREE.BufferAttribute(trailA, 1));
      const gatePos = new THREE.Vector3();
      const u = commonUniforms({ uFrac: { value: 0 }, uGateOn: { value: 0 }, uGate: { value: gatePos }, uColA: { value: colA }, uColB: { value: C(0xffffff) }, uColC: { value: colAcc } });
      const pts = new THREE.Points(g, pointsMat(TRAFFIC_VERT, u));
      pts.name = 'civ:trafico';
      pts.frustumCulled = false;
      orbit.add(pts);
      // líneas de carril
      const segs = [];
      for (const l of lanes) if (l.type === 0) segs.push(...circleSegments(l.p1, l.p2, l.p3, 96, 0));
      const lg = track(glowLineGeometry(segs));
      const lm = glowMat(colA, 0.09, 0);
      const lines = new THREE.LineSegments(lg, lm);
      lines.name = 'civ:carriles';
      orbit.add(lines);
      parts.traffic = { pts, u, lines, lm, gatePos };
    }

    // --- Ascensores espaciales + anillo orbital (giran con la superficie) ---
    {
      const ringR = 1.24, top = 2.35;
      const n = Q.ascensores;
      const lons = [];
      const base = r.range(0, Math.PI * 2);
      for (let i = 0; i < n; i++) lons.push(base + (i / n) * Math.PI * 2 + r.range(-0.2, 0.2));
      const segs = [];
      lons.forEach((lon, i) => {
        const c = Math.cos(lon), s = -Math.sin(lon);
        const steps = 24;
        for (let k = 0; k < steps; k++) {
          const a = 1.0 + (top - 1.0) * (k / steps), b = 1.0 + (top - 1.0) * ((k + 1) / steps);
          segs.push([c * a, 0, s * a, c * b, 0, s * b, i / n + 0.001, k / steps, (k + 1) / steps]);
        }
      });
      const lg = track(glowLineGeometry(segs));
      const lm = glowMat(colB, 0.85, 4);
      const lines = new THREE.LineSegments(lg, lm);
      lines.name = 'civ:ascensores';
      surf.add(lines);
      // contrapesos y bases
      const cw = [];
      const mat = parts.hullMats[0];
      lons.forEach((lon, i) => {
        const g = track(stationGeometry('esfera', makeRng(meta.seed, 'cw' + i)));
        const m = new THREE.Mesh(g, mat);
        m.scale.setScalar(0.04);
        m.position.set(Math.cos(lon) * top, 0, -Math.sin(lon) * top);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m.position.clone().normalize());
        m.name = 'civ:contrapeso';
        surf.add(m);
        const b = new THREE.Mesh(track(new THREE.CylinderGeometry(0.018, 0.03, 0.02, 12)), mat);
        b.position.set(Math.cos(lon) * 1.0, 0, -Math.sin(lon) * 1.0);
        b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.position.clone().normalize());
        surf.add(b);
        cw.push(m, b);
      });
      // escaladores
      const per = 6;
      const cl = new Float32Array(n * per * 4);
      lons.forEach((lon, i) => { for (let k = 0; k < per; k++) cl.set([lon, r(), r.range(0.015, 0.03), i / n + 0.001], (i * per + k) * 4); });
      const cg = track(new THREE.BufferGeometry());
      cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * per * 3), 3));
      cg.setAttribute('aC', new THREE.BufferAttribute(cl, 4));
      const cu = commonUniforms({ uFrac: { value: 0 }, uTop: { value: top }, uCol: { value: C(0xffffff) } });
      const climbers = new THREE.Points(cg, pointsMat(CLIMBER_VERT, cu));
      climbers.frustumCulled = false;
      climbers.name = 'civ:escaladores';
      surf.add(climbers);
      parts.elevators = { lines, lm, cw, climbers, cu, n };

      // anillo orbital
      const halfH = 0.016;
      const rg = track(new THREE.CylinderGeometry(ringR, ringR, halfH * 2, 360, 1, true));
      const ru = commonUniforms({ uHull: { value: C(0xb9b3cc) }, uWin: { value: colA }, uGlow: { value: colB }, uBuild: { value: 0 }, uHalfH: { value: halfH } });
      const rm = track(new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: ru, side: THREE.DoubleSide }));
      const ring = new THREE.Mesh(rg, rm);
      ring.name = 'civ:anillo-orbital';
      surf.add(ring);
      parts.ring = { ring, u: ru };
    }

    // --- Colonias en las lunas ---
    {
      const moons = [];
      planet.group.traverse((o) => { if (o.isMesh && /^luna:/.test(o.name)) moons.push(o); });
      parts.colonies = [];
      moons.forEach((mm, k) => {
        const rr = mm.geometry?.parameters?.radius || 0.2;
        const n = 40;
        const r3 = makeRng(meta.seed, 'luna' + k);
        const pos = new Float32Array(n * 3), info = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
          const lat = Math.asin(r3.range(-0.9, 0.9)), lon = r3.range(0, Math.PI * 2);
          pos.set([Math.cos(lat) * Math.cos(lon) * rr * 1.01, Math.sin(lat) * rr * 1.01, Math.cos(lat) * Math.sin(lon) * rr * 1.01], i * 3);
          info[i * 2] = i / n; info[i * 2 + 1] = r3.range(0.006, 0.014);
        }
        const g = track(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
        const u = commonUniforms({ uFrac: { value: 0 }, uCol: { value: colA } });
        const pts = new THREE.Points(g, pointsMat(SURFPTS_VERT, u));
        pts.frustumCulled = false;
        pts.name = 'civ:colonia-lunar';
        mm.add(pts);
        parts.colonies.push({ pts, u });
      });
    }
  }

  function buildMega(planet, orbit, surf) {
    const r = makeRng(meta.seed, 'civ-mega');
    parts.mega = [];
    const has = (k) => meta.mega.includes(k);

    if (has('celosia')) {
      const ico = new THREE.IcosahedronGeometry(1.62, 2);
      const edges = new THREE.EdgesGeometry(ico, 1);
      ico.dispose();
      const p = edges.attributes.position.array;
      const segs = [];
      for (let i = 0; i < p.length; i += 6) {
        const mid = new THREE.Vector3(p[i] + p[i + 3], p[i + 1] + p[i + 4], p[i + 2] + p[i + 5]).normalize();
        // aparece desde el ecuador hacia los polos, con algo de azar
        const rnd = clamp01(Math.abs(mid.y) * 0.75 + r() * 0.25);
        segs.push([p[i], p[i + 1], p[i + 2], p[i + 3], p[i + 4], p[i + 5], rnd, mid.y * 2, mid.y * 2]);
      }
      edges.dispose();
      const g = track(glowLineGeometry(segs));
      const m = glowMat(colB, 0.32, 2);
      const lines = new THREE.LineSegments(g, m);
      lines.name = 'civ:celosia';
      orbit.add(lines);
      parts.mega.push({ id: 'celosia', obj: lines, u: m.uniforms, spin: 0.01 });
    }
    if (has('anilloMundo')) {
      const R = 2.45, halfH = 0.07;
      const g = track(new THREE.CylinderGeometry(R, R, halfH * 2, 512, 1, true));
      const u = commonUniforms({
        uHull: { value: C(0x8f8aa3) }, uWin: { value: colA }, uBuild: { value: 0 }, uHalfH: { value: halfH },
        uLand: { value: C(r.pick([0x4f8a4a, 0x6a5a9a, 0x7f9a5a])) }, uSea: { value: C(0x1d3e66) },
      });
      const m = track(new THREE.ShaderMaterial({ vertexShader: RING_VERT, fragmentShader: WORLDRING_FRAG, uniforms: u, side: THREE.DoubleSide }));
      const mesh = new THREE.Mesh(g, m);
      const holder = new THREE.Group();
      holder.rotation.set(r.range(0.25, 0.5), r.range(0, 6), r.range(-0.2, 0.2));
      holder.add(mesh);
      mesh.name = 'civ:mundo-anillo';
      orbit.add(holder);
      parts.mega.push({ id: 'anilloMundo', obj: holder, mesh, u, spin: 0.02 });
    }
    if (has('cilindros')) {
      const n = 14 + r.int(0, 10);
      const geo = track(mergeParts([
        { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.32, 16, 1, false), tint: 0 },
        { geo: new THREE.BoxGeometry(0.3, 0.004, 0.06), tint: 1, m: mul(mT(0, 0, 0.09)) },
        { geo: new THREE.BoxGeometry(0.3, 0.004, 0.06), tint: 1, m: mul(mT(0, 0, -0.09)) },
        { geo: new THREE.SphereGeometry(0.012, 6, 4), tint: 2, m: mT(0, 0.17, 0) },
      ]));
      const mat = hullMat(0xcfc8dc, 0x2d3f78, colA, 90);
      const inst = new THREE.InstancedMesh(geo, mat, n);
      const holder = new THREE.Group();
      const d = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r.range(-0.1, 0.1);
        const rad = r.range(2.55, 2.9);
        d.position.set(Math.cos(a) * rad, r.range(-0.08, 0.08), Math.sin(a) * rad);
        d.rotation.set(r.range(0, 6), r.range(0, 6), r.range(0, 6));
        d.scale.setScalar(r.range(0.7, 1.3));
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.frustumCulled = false;
      inst.name = 'civ:cilindros-oneill';
      holder.rotation.x = r.range(-0.3, 0.3);
      holder.add(inst);
      orbit.add(holder);
      parts.mega.push({ id: 'cilindros', obj: holder, inst, count: n, spin: 0.05, hull: mat });
      parts.hullMats.push(mat);
    }
    if (has('faros')) {
      const holder = new THREE.Group();
      const geo = track(new THREE.CylinderGeometry(0.004, 0.045, 1.1, 24, 1, true));
      const mat = track(new THREE.ShaderMaterial({
        vertexShader: PORTAL_VERT,
        fragmentShader: /* glsl */`uniform vec3 uCol;uniform float uTime,uOn;varying vec2 vUv;
          void main(){float f=pow(1.0-vUv.y,2.2)*(0.55+0.45*sin(vUv.y*40.0-uTime*6.0));
          gl_FragColor=vec4(uCol*f*uOn*0.55,1.0);
          #include <colorspace_fragment>
          }`,
        uniforms: { uCol: { value: colB.clone() }, uTime: { value: 0 }, uOn: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      timeU.push(mat.uniforms.uTime);
      // Base ancha (abajo, uv.y = 0) pegada al polo; la punta fina se aleja del planeta.
      const up = new THREE.Mesh(geo, mat); up.position.y = 1.0 + 0.55;
      const dn = new THREE.Mesh(geo, mat); dn.position.y = -1.0 - 0.55; dn.rotation.x = Math.PI;
      // anillos de anclaje en los polos
      const hm = parts.hullMats[0];
      const t1 = new THREE.Mesh(track(mergeParts([{ geo: new THREE.TorusGeometry(0.12, 0.015, 6, 32), tint: 0, m: mRX(Math.PI / 2) }, { geo: new THREE.SphereGeometry(0.02, 6, 4), tint: 2 }])), hm);
      t1.position.y = 1.03; const t2 = t1.clone(); t2.position.y = -1.03;
      holder.add(up, dn, t1, t2);
      holder.name = 'civ:faros-polares';
      surf.add(holder);
      parts.mega.push({ id: 'faros', obj: holder, u: mat.uniforms });
    }

    // --- Tipo III: puerta estelar ---
    {
      const holder = new THREE.Group();
      const R = 0.55;
      const hm = hullMat(0x9d97b5, 0x3a2a66, colB, 40);
      parts.hullMats.push(hm);
      const ringG = track(mergeParts([
        { geo: new THREE.TorusGeometry(R, 0.05, 12, 96), tint: 0 },
        ...Array.from({ length: 8 }, (_, i) => ({ geo: new THREE.BoxGeometry(0.09, 0.14, 0.12), tint: 0, m: mul(mRZ((i / 8) * Math.PI * 2), mT(R, 0, 0)) })),
        ...Array.from({ length: 8 }, (_, i) => ({ geo: new THREE.SphereGeometry(0.018, 6, 4), tint: 2, m: mul(mRZ((i / 8 + 1 / 16) * Math.PI * 2), mT(R + 0.05, 0, 0)) })),
      ]));
      const ring = new THREE.Mesh(ringG, hm);
      const pg = track(new THREE.PlaneGeometry(R * 2, R * 2));
      const pm = track(new THREE.ShaderMaterial({
        vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uColA: { value: colAcc.clone() }, uColB: { value: C(0xffffff) } },
      }));
      timeU.push(pm.uniforms.uTime);
      const portal = new THREE.Mesh(pg, pm);
      holder.add(ring, portal);
      const a = r.range(0, Math.PI * 2), dist = 4.6;
      holder.position.set(Math.cos(a) * dist, r.range(-0.6, 0.6), Math.sin(a) * dist);
      holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), holder.position.clone().normalize().negate());
      holder.name = 'civ:puerta-estelar';
      orbit.add(holder);
      parts.gate = { holder, pu: pm.uniforms, hm };
      parts.traffic.gatePos.copy(holder.position);
    }

    // --- Tipo III: haces que cruzan la galaxia ---
    {
      const segs = [];
      const n = meta.cantidades.haces;
      for (let i = 0; i < n; i++) {
        const d = new THREE.Vector3(r.range(-1, 1), r.range(-0.4, 0.4), r.range(-1, 1)).normalize();
        const steps = 40;
        for (let k = 0; k < steps; k++) {
          const a = 1.05 + Math.pow(k / steps, 1.6) * 60, b = 1.05 + Math.pow((k + 1) / steps, 1.6) * 60;
          segs.push([d.x * a, d.y * a, d.z * a, d.x * b, d.y * b, d.z * b, i / n * 0.999, k / steps * 3, (k + 1) / steps * 3]);
        }
      }
      const g = track(glowLineGeometry(segs));
      const m = glowMat(colB, 0.9, 7);
      const lines = new THREE.LineSegments(g, m);
      lines.frustumCulled = false;
      lines.name = 'civ:haces';
      surf.add(lines);
      parts.beams = { lines, u: m.uniforms };
    }
  }

  function buildDyson(scene) {
    const star = opts.star;
    if (star === false) return;
    const Q = meta.cantidades;
    const r = makeRng(meta.seed, 'civ-dyson');
    const n = Math.round(Q.dyson * qMul);
    const orb = new Float32Array(n * 4), misc = new Float32Array(n * 2);
    const bands = r.int(4, 9);
    const bandIncl = Array.from({ length: bands }, () => [r.range(-1.4, 1.4), r.range(0, Math.PI * 2)]);
    for (let i = 0; i < n; i++) {
      const b = i % bands;
      const [inc, node] = r.chance(0.8) ? bandIncl[b] : [r.range(-1.5, 1.5), r.range(0, 6.28)];
      orb.set([r.range(1.9, 2.6), inc + r.range(-0.05, 0.05), node + r.range(-0.05, 0.05), r.range(0, Math.PI * 2)], i * 4);
      misc.set([r.range(0.04, 0.09), r()], i * 2);
    }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4));
    g.setAttribute('aMisc', new THREE.BufferAttribute(misc, 2));
    const u = commonUniforms({ uFrac: { value: 0 }, uColA: { value: C(0xffd9a0) }, uColB: { value: C(0xffffff) } });
    const mat = track(new THREE.ShaderMaterial({ vertexShader: DYSON_VERT, fragmentShader: DYSON_FRAG, uniforms: u, transparent: true, depthWrite: false }));
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.name = 'civ:enjambre-dyson';
    const holder = new THREE.Group();
    holder.add(pts);
    scene.add(holder);
    parts.dyson = { holder, pts, u, auto: !star, star };
  }

  /* ---------- API ---------- */

  /**
   * Cuelga la civilización de un planeta de planetas.js (o de cualquier { group, mesh }).
   * La superficie se añade como hija de planet.mesh (gira con él) y lo orbital, del padre de mesh (inclinación axial).
   */
  function attach(planet, attachOpts = {}) {
    if (attached) detach();
    if (attachOpts.star !== undefined) opts.star = attachOpts.star;
    lightDir = planet.lightDirection || lightDir;
    for (const u of lightU) u.value = lightDir;
    const surf = new THREE.Group(); surf.name = 'civ:marco-superficie';
    const orbit = new THREE.Group(); orbit.name = 'civ:marco-orbital';
    (planet.mesh || planet.group).add(surf);
    (planet.mesh?.parent || planet.group).add(orbit);
    // apagamos las luces de ciudad del propio shader del planeta: ahora mandan las nuestras
    const pu = planet.uniforms || planet.mesh?.material?.uniforms;
    const prevCity = pu?.uCity ? pu.uCity.value : null;
    if (pu?.uCity) pu.uCity.value = 0;
    attached = { planet, surf, orbit, prevCity, pu };
    buildSurface(planet, surf);
    buildOrbital(planet, orbit, surf);
    buildMega(planet, orbit, surf);
    const scene = attachOpts.scene || findRoot(planet.group);
    buildDyson(scene);
    for (const u of lightU) u.value = lightDir;
    apply();
    update(0);
    return api;
  }

  function findRoot(o) { let p = o; while (p.parent) p = p.parent; return p; }

  function detach() {
    if (!attached) return;
    const { surf, orbit, prevCity, pu } = attached;
    surf.removeFromParent(); orbit.removeFromParent();
    if (parts.dyson) parts.dyson.holder.removeFromParent();
    for (const c of parts.colonies || []) c.pts.removeFromParent();
    if (pu?.uCity && prevCity != null) pu.uCity.value = prevCity;
    attached = null;
  }

  /** Aplica nivel/estado a todos los uniforms y visibilidades (sin crear nada). */
  function apply() {
    const R = rasgosPara(nivel, estado, meta);
    const dead = estado === 'extinta';
    for (const u of deadU) u.value = dead ? 1 : 0;
    // superficie
    if (parts.overlay) {
      const u = parts.overlay.u;
      u.uFire.value = R.hogueras; u.uFarm.value = R.campos;
      u.uCity.value = dead ? 0 : R.ciudades;
      u.uRoad.value = dead ? 0 : R.carreteras;
      u.uEcu.value = dead ? 0 : R.ecumenopolis;
      u.uHaze.value = R.contaminacion;
      u.uRuin.value = dead ? Math.max(R.ruinas, ramp(0.2, 0.6, nivel)) : 0;
      parts.overlay.mesh.visible = nivel > 0.01;
    }
    if (parts.haze) { parts.haze.u.uStrength.value = R.contaminacion * 0.9; parts.haze.mesh.visible = R.contaminacion > 0.01; }
    if (parts.floating) { parts.floating.u.uFrac.value = dead ? 0.15 * ramp(0.3, 1, nivel) : ramp(0.25, 1.4, nivel); parts.floating.pts.visible = nivel > 0.2; }
    // satélites (o chatarra si está extinta)
    if (parts.sats) { parts.sats.u.uFrac.value = R.satelites * (dead ? 0.8 : 1); parts.sats.pts.visible = R.satelites > 0.001; }
    // estaciones
    if (parts.stations) {
      const k = Math.round(R.estaciones * parts.stations.length);
      parts.stations.forEach((s, i) => { s.mesh.visible = i < k; });
    }
    for (const m of parts.hullMats || []) m.uniforms.uAlive.value = dead ? 0 : 1;
    // tráfico
    if (parts.traffic) {
      parts.traffic.u.uFrac.value = R.trafico;
      parts.traffic.pts.visible = R.trafico > 0.001;
      parts.traffic.lm.uniforms.uOpacity.value = 0.045 * R.trafico;
      parts.traffic.lines.visible = R.trafico > 0.05;
      parts.traffic.u.uGateOn.value = R.puerta > 0.5 && !dead ? 1 : 0;
    }
    if (parts.colonies) for (const c of parts.colonies) { c.u.uFrac.value = dead ? R.colonias * 0.1 : R.colonias; c.pts.visible = R.colonias > 0.01; }
    // ascensores y anillo
    if (parts.elevators) {
      const e = parts.elevators;
      const vis = R.ascensores > 0.001;
      e.lines.visible = vis; e.climbers.visible = vis && !dead;
      e.lm.uniforms.uBuild.value = R.ascensores * 1.0001;
      e.cu.uFrac.value = R.ascensores;
      const k = Math.ceil(R.ascensores * e.n);
      e.cw.forEach((m, i) => { m.visible = Math.floor(i / 2) < k; });
    }
    if (parts.ring) { parts.ring.u.uBuild.value = R.anillo; parts.ring.ring.visible = R.anillo > 0.001; }
    // megaestructuras
    for (const m of parts.mega || []) {
      const b = R.mega;
      m.obj.visible = b > 0.001;
      if (m.id === 'celosia') m.u.uBuild.value = b;
      if (m.id === 'anilloMundo') m.u.uBuild.value = b;
      if (m.id === 'cilindros') m.inst.count = Math.round(b * m.count);
      if (m.id === 'faros') m.u.uOn.value = dead ? 0 : b;
    }
    if (parts.gate) { parts.gate.holder.visible = R.puerta > 0.001; parts.gate.holder.scale.setScalar(Math.max(0.001, R.puerta)); parts.gate.pu.uOn.value = dead ? 0 : R.puerta; }
    if (parts.beams) { parts.beams.u.uBuild.value = R.haces; parts.beams.lines.visible = R.haces > 0.001 && !dead; }
    if (parts.dyson) { parts.dyson.u.uFrac.value = R.dyson; parts.dyson.pts.visible = R.dyson > 0.001; }
  }

  /** Cambia el nivel (0..3, decimal). Barato: no crea geometría. Devuelve el meta actualizado. */
  function setNivel(n) {
    nivel = Math.max(0, Math.min(3, +n || 0));
    describir(meta, nivel, estado);
    apply();
    return meta;
  }
  /** 'viva' | 'extinta'. */
  function setEstado(e) {
    estado = e === 'extinta' ? 'extinta' : 'viva';
    describir(meta, nivel, estado);
    apply();
    return meta;
  }
  /** Altura del lienzo en píxeles (para el tamaño de los puntos). Llamar al redimensionar. */
  function setResolution(height) { viewH = height; for (const u of viewHU) u.value = height; }

  const tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function update(dt = 1 / 60) {
    time += dt;
    for (const u of timeU) u.value = time;
    if (!attached) return;
    const { planet } = attached;
    planet.group.getWorldPosition(planetC);
    planet.group.getWorldScale(tmpS);
    planetR = tmpS.x;
    for (const u of planetRU) u.value = planetR;
    for (const u of scaleU) u.value = planetR;
    const dead = estado === 'extinta';
    if (parts.stations) for (const s of parts.stations) {
      if (!s.mesh.visible) continue;
      s.arm.rotation.y += s.speed * dt * (dead ? 0.6 : 1);
      if (dead) { s.mesh.rotation.x += s.tumble.x * dt; s.mesh.rotation.y += s.tumble.y * dt; s.mesh.rotation.z += s.tumble.z * dt; }
      else s.mesh.rotateY(s.spin * dt);
    }
    for (const m of parts.mega || []) if (m.spin && m.obj.visible) {
      if (m.id === 'anilloMundo') m.mesh.rotation.y += m.spin * dt * (dead ? 0.2 : 1);
      else m.obj.rotation.y += m.spin * dt * (dead ? 0.2 : 1);
    }
    if (parts.gate?.holder.visible) parts.gate.holder.rotateZ(dt * 0.05);
    if (parts.dyson) {
      const d = parts.dyson;
      if (d.star?.position) { d.holder.position.copy(d.star.position); d.holder.scale.setScalar(d.star.radius || 5); }
      else if (d.auto) {
        // Sin estrella declarada: la ponemos lejos en la dirección de la luz
        const dist = planetR * 70;
        d.holder.position.copy(planetC).addScaledVector(lightDir, dist);
        d.holder.scale.setScalar(planetR * 3.2);
      }
      for (const u of [d.u.uScale]) u.value = d.holder.scale.x * 1.0;
    }
  }

  function dispose() {
    detach();
    for (const d of disposables) d.dispose?.();
    disposables.length = 0;
  }

  const api = {
    meta,
    get nivel() { return nivel; },
    get estado() { return estado; },
    attach, detach, setNivel, setEstado, setResolution, update, dispose,
    parts,
  };
  return api;
}

/** Alias con el nombre que usa la integración. */
export const generateCivilization = createCivilization;
