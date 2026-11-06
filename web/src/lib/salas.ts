/**
 * Registro de las salas de La Malkevnia.
 *
 * Cada sala tiene su ruta y, opcionalmente, el nombre del módulo que la llena.
 * Un módulo es una carpeta en `modulos/<nombre>/` que hacen los demás hilos del proyecto
 * (la nave 3D, la Kallax 3D, la sala de cine…). Si su página de `entrada` existe, la sala
 * la monta a pantalla completa; si no, enseña un marcador con lo que va a haber ahí.
 * Cada carpeta trae un README que dice cuál es su página: ponla en `entrada`.
 *
 * Para traer módulos nuevos: `npm run modulos:sync` (copia /mnt/project-files/modulos/*,
 * nave-3d y universo-3d). Los módulos que son librerías (audio-nave, controles-moviles,
 * multijugador, rendimiento…) se integran dentro de nave-3d, no tienen sala propia.
 */
export interface Sala {
  slug: string;
  ruta: string;
  nombre: string;
  cubierta: string; // "cubierta" de la nave, para el plano
  resumen: string;
  /** Carpeta del módulo dentro de `modulos/`. */
  modulo?: string;
  /** Página del módulo que se monta (relativa a su carpeta). Por defecto `index.html`. */
  entrada?: string;
  icono: string;
}

export const salas: Sala[] = [
  {
    slug: 'puente',
    ruta: '/',
    nombre: 'Puente de mando',
    cubierta: 'Cubierta 1',
    resumen: 'Desde aquí se ve todo el espacio. El punto de partida de cada visita.',
    icono: '◈',
  },
  {
    slug: 'nave',
    ruta: '/nave',
    nombre: 'Paseo por la nave',
    cubierta: 'Toda la nave',
    resumen: 'La Malkevnia en 3D: camina por el pasillo central y entra en cada sala.',
    modulo: 'nave-3d',
    icono: '⬡',
  },
  {
    slug: 'bitacora',
    ruta: '/bitacora',
    nombre: 'Bitácora del capitán',
    cubierta: 'Cubierta 1',
    resumen: 'Notas, pensamientos y comentarios. El blog de siempre, ahora a bordo.',
    // Módulo de datos: lo usan las páginas Astro de /bitacora, no se monta tal cual.
    icono: '✎',
  },
  {
    slug: 'sala-de-juegos',
    ruta: '/sala-de-juegos',
    nombre: 'Sala de juegos',
    cubierta: 'Cubierta 2',
    resumen: 'Las Kallax con los juegos de mesa. Coge una caja y ábrela.',
    modulo: 'kallax-3d',
    icono: '▦',
  },
  {
    slug: 'sala-de-proyeccion',
    ruta: '/sala-de-proyeccion',
    nombre: 'Sala de proyección',
    cubierta: 'Cubierta 2',
    resumen: 'La filmoteca: pantalla, butacas y cartelera.',
    modulo: 'sala-cine',
    icono: '▶',
  },
  {
    slug: 'biblioteca',
    ruta: '/biblioteca',
    nombre: 'Biblioteca',
    cubierta: 'Cubierta 3',
    resumen: 'Libros y mangas con sus lomos de verdad.',
    modulo: 'libreria-3d',
    icono: '▤',
  },
  {
    slug: 'ordenador',
    ruta: '/ordenador',
    nombre: 'Ordenador de a bordo',
    cubierta: 'Cubierta 1',
    resumen: 'Terminal de comandos: ir a una sala, buscar, leer la bitácora.',
    modulo: 'ordenador-abordo',
    entrada: 'ordenador-de-a-bordo.html',
    icono: '⌨',
  },
  {
    slug: 'plano',
    ruta: '/plano',
    nombre: 'Plano de la nave',
    cubierta: 'Todas',
    resumen: 'Dónde estás y a dónde puedes teletransportarte.',
    modulo: 'mapa-nave',
    entrada: 'demo.html',
    icono: '⌗',
  },
  {
    slug: 'rumbo',
    ruta: '/rumbo',
    nombre: 'Trazar rumbo',
    cubierta: 'Exterior',
    resumen: 'Sal de la nave y recorre el universo de La Malkevnia.',
    modulo: 'universo-3d',
    icono: '✦',
  },
  {
    slug: 'vuelo-libre',
    ruta: '/vuelo-libre',
    nombre: 'Vuelo libre',
    cubierta: 'Exterior',
    resumen: 'Toma los mandos: pilota La Malkevnia y aterriza en planetas.',
    modulo: 'vuelo-libre',
    icono: '➶',
  },
  {
    slug: 'planetas',
    ruta: '/planetas',
    nombre: 'Planetas sin fin',
    cubierta: 'Exterior',
    resumen: 'Mundos generados al vuelo, cada uno con su nombre y su leyenda.',
    modulo: 'planetas-procedurales',
    entrada: 'demo.html',
    icono: '◍',
  },
  {
    slug: 'sala-de-maquinas',
    ruta: '/sala-de-maquinas',
    nombre: 'Sala de máquinas',
    cubierta: 'Cubierta 4',
    resumen: 'Estado del reactor: rendimiento, calidad gráfica y diagnóstico.',
    modulo: 'rendimiento',
    entrada: 'demo/index.html',
    icono: '⚙',
  },
  {
    slug: 'consola',
    ruta: '/consola',
    nombre: 'Consola del capitán',
    cubierta: 'Cubierta 1',
    resumen: 'Panel de administración para escribir en la bitácora y gestionar las colecciones. Llegará con la base de datos y el login.',
    icono: '⎈',
  },
];

export function sala(slug: string): Sala {
  const s = salas.find((x) => x.slug === slug);
  if (!s) throw new Error(`Sala desconocida: ${slug}`);
  return s;
}
