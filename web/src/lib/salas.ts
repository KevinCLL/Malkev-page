/**
 * Registro de las salas de La Malkevnia.
 *
 * Cada sala tiene su ruta y, opcionalmente, el nombre del módulo que la llena.
 * Un módulo es una carpeta en `modulos/<nombre>/` con un `index.html` autocontenido
 * (la nave 3D, la Kallax 3D, la sala de cine…). Si el módulo existe, la sala lo monta
 * a pantalla completa; si no, enseña un marcador con lo que va a haber ahí.
 *
 * Para enchufar un módulo nuevo: `npm run modulos:sync` (copia /mnt/project-files/modulos/*)
 * y, si el nombre de la carpeta no coincide, cambia `modulo` aquí abajo.
 */
export interface Sala {
  slug: string;
  ruta: string;
  nombre: string;
  cubierta: string; // "cubierta" de la nave, para el plano
  resumen: string;
  modulo?: string;
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
    modulo: 'bitacora',
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
    slug: 'sala-recreativa',
    ruta: '/sala-recreativa',
    nombre: 'Sala recreativa',
    cubierta: 'Cubierta 2',
    resumen: 'El catálogo de videojuegos, con su ficha y su nota.',
    modulo: 'sala-recreativa',
    icono: '◉',
  },
  {
    slug: 'sala-de-proyeccion',
    ruta: '/sala-de-proyeccion',
    nombre: 'Sala de proyección',
    cubierta: 'Cubierta 2',
    resumen: 'La filmoteca: pantalla, butacas y cartelera.',
    modulo: 'sala-de-cine',
    icono: '▶',
  },
  {
    slug: 'biblioteca',
    ruta: '/biblioteca',
    nombre: 'Biblioteca',
    cubierta: 'Cubierta 3',
    resumen: 'Libros y mangas con sus lomos de verdad.',
    modulo: 'libreria',
    icono: '▤',
  },
  {
    slug: 'ordenador',
    ruta: '/ordenador',
    nombre: 'Ordenador de a bordo',
    cubierta: 'Cubierta 1',
    resumen: 'Terminal de comandos: ir a una sala, buscar, leer la bitácora.',
    modulo: 'ordenador',
    icono: '⌨',
  },
  {
    slug: 'plano',
    ruta: '/plano',
    nombre: 'Plano de la nave',
    cubierta: 'Todas',
    resumen: 'Dónde estás y a dónde puedes teletransportarte.',
    modulo: 'plano-nave',
    icono: '⌗',
  },
  {
    slug: 'rumbo',
    ruta: '/rumbo',
    nombre: 'Trazar rumbo',
    cubierta: 'Exterior',
    resumen: 'Pilota La Malkevnia por el universo y aterriza en planetas.',
    modulo: 'vuelo-libre',
    icono: '✦',
  },
  {
    slug: 'sala-de-maquinas',
    ruta: '/sala-de-maquinas',
    nombre: 'Sala de máquinas',
    cubierta: 'Cubierta 4',
    resumen: 'Estado del reactor: rendimiento, calidad gráfica y diagnóstico.',
    modulo: 'sala-de-maquinas',
    icono: '⚙',
  },
  {
    slug: 'consola',
    ruta: '/consola',
    nombre: 'Consola del capitán',
    cubierta: 'Cubierta 1',
    resumen: 'Panel de administración para escribir en la bitácora y gestionar las colecciones.',
    modulo: 'consola',
    icono: '⎈',
  },
];

export function sala(slug: string): Sala {
  const s = salas.find((x) => x.slug === slug);
  if (!s) throw new Error(`Sala desconocida: ${slug}`);
  return s;
}
