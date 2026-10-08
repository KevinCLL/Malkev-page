// La travesía: la Malkevnia no está parada. Va de un mundo a otro, cada escala dura dos días y lo
// que se ve por el ventanal (y lo que marca el HUD) sale de la hora. Como todo depende del reloj, dos
// personas que entren a la vez ven la nave en el mismo sitio, y quien vuelva a los tres días la
// encontrará en otro.
//
// Cada destino lleva su paleta (del más oscuro al más claro, más un acento), el tipo de mundo
// (gas, roca o hielo), si tiene anillos y luna, el color de su atmósfera y la semilla del cielo que
// se ve detrás. Las distancias son las de un mapa inventado: nadie las ha medido.

export const KINDS = { gas: 0, rock: 1, ice: 2 }

const KIND_LABELS = { gas: 'gigante gaseoso', rock: 'mundo rocoso', ice: 'mundo helado' }

// Colores como los usa el shader: tres componentes de 0 a 1.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

export const DESTINATIONS = [
  {
    name: 'Izaro', kind: 'gas', palette: ['#302645', '#70619a', '#ccc5d6', '#87698a'], atmo: '#9e99ff',
    rings: null, moon: 1, seed: 9.7, legKm: 640,
    note: 'El gigante violeta donde empezó todo.',
  },
  {
    name: 'Thalassa', kind: 'rock', palette: ['#0f2d5c', '#2f7fa8', '#d9e6ea', '#6a8a3f'], atmo: '#8ecbff',
    rings: null, moon: 0.8, seed: 14.2, legKm: 410,
    note: 'Un océano entero con tres islas y mucha nube.',
  },
  {
    name: 'Nix Áurea', kind: 'gas', palette: ['#5a3c1a', '#b7843c', '#f1dfb0', '#c9a05c'], atmo: '#ffd9a0',
    rings: [1.35, 2.2, 0.28], moon: 0.6, seed: 21.5, legKm: 880,
    note: 'Bandas de miel y unos anillos que se ven desde cualquier parte.',
  },
  {
    name: 'Brasa Menor', kind: 'rock', palette: ['#2b0d0a', '#8a2f1c', '#f0a060', '#5c3a2c'], atmo: '#ff9a6a',
    rings: null, moon: 0, seed: 33.1, legKm: 290,
    note: 'Volcanes, ceniza y un rojo que no se apaga.',
  },
  {
    name: 'Gélida', kind: 'ice', palette: ['#3b4f7a', '#8aa5d6', '#eef3ff', '#b7c9ea'], atmo: '#cfe2ff',
    rings: [1.3, 1.75, 0.22], moon: 0.9, seed: 40.6, legKm: 720,
    note: 'Hielo hasta donde alcanza la vista y un anillo fino de escarcha.',
  },
  {
    name: 'Umbra', kind: 'rock', palette: ['#15101f', '#3b2f52', '#9a8fb5', '#5a4a7a'], atmo: '#8c7fb3',
    rings: null, moon: 0.5, seed: 52.3, legKm: 530,
    note: 'Casi no refleja luz: hay que fiarse de los instrumentos.',
  },
  {
    name: 'Verdanza', kind: 'gas', palette: ['#0f3a30', '#2f8a6c', '#cfeedd', '#7bbf9a'], atmo: '#9fe3b4',
    rings: null, moon: 1.1, seed: 61.9, legKm: 760,
    note: 'Un gigante verde con tormentas del tamaño de un continente.',
  },
  {
    name: 'Carmesí', kind: 'gas', palette: ['#3d0f2a', '#a3306e', '#f3c6dc', '#d4648f'], atmo: '#ff9ccf',
    rings: [1.4, 1.9, 0.34], moon: 0.7, seed: 73.4, legKm: 950,
    note: 'Nubes rosas y un anillo ancho: la escala más fotogénica.',
  },
  {
    name: 'Ceniza', kind: 'rock', palette: ['#2a2a2e', '#6d6d74', '#c9c9cf', '#8a8a92'], atmo: '#000000',
    rings: null, moon: 0, seed: 85.8, legKm: 350,
    note: 'Sin aire y a cráteres: una roca honesta.',
  },
  {
    name: 'Lumen', kind: 'ice', palette: ['#5a5470', '#a89fc4', '#fbf7ff', '#d9ccf2'], atmo: '#e8dcff',
    rings: [1.25, 1.55, 0.18], moon: 0.4, seed: 97.2, legKm: 600,
    note: 'Tan pálida que parece una luna; la última escala antes de volver.',
  },
].map((d) => ({
  ...d,
  cls: KIND_LABELS[d.kind],
  colors: d.palette.map(rgb),
  atmoRgb: rgb(d.atmo),
}))

export const LEG_HOURS = 48
const LEG_MS = LEG_HOURS * 3600e3
const EPOCH = Date.UTC(2026, 0, 1)
// A partir de este punto del tramo la nave ya está en órbita: el planeta se ve a tamaño completo.
export const ORBIT_AT = 0.86

// Para ver una escala concreta sin esperar a que llegue: ?destino=3 (y, si se quiere, &tramo=0.5).
function override() {
  if (typeof location === 'undefined') return null
  const params = new URLSearchParams(location.search)
  const dest = Number(params.get('destino'))
  if (!dest) return null
  const tramo = params.has('tramo') ? Number(params.get('tramo')) : null
  return { index: dest - 1, progress: Number.isFinite(tramo) ? Math.min(Math.max(tramo, 0), 0.999) : null }
}
const FORCED = override()

const ease = (t) => t * t * (3 - 2 * t)

export function voyage(now = Date.now()) {
  const t = +now
  const N = DESTINATIONS.length
  let leg = Math.floor((t - EPOCH) / LEG_MS)
  let progress = (((t - EPOCH) % LEG_MS) + LEG_MS) % LEG_MS / LEG_MS
  if (FORCED) {
    leg = FORCED.index
    if (FORCED.progress != null) progress = FORCED.progress
  }
  const index = ((leg % N) + N) % N
  const destination = DESTINATIONS[index]
  const next = DESTINATIONS[(index + 1) % N]
  const orbit = progress >= ORBIT_AT
  // Cuánto se ha acercado (de 0 a 1), con una curva suave: al principio apenas crece, al final se
  // viene encima.
  const approach = ease(Math.min(progress / ORBIT_AT, 1))
  const hoursLeft = (1 - progress) * LEG_HOURS
  const hoursToArrive = orbit ? 0 : (ORBIT_AT - progress) * LEG_HOURS
  return {
    index, leg, destination, next, progress, approach, orbit,
    distanceKm: destination.legKm * (1 - approach),
    hoursToArrive,
    hoursToDepart: hoursLeft,
  }
}

export function formatHours(h) {
  const total = Math.max(Math.round(h), 0)
  if (total < 1) return 'menos de una hora'
  if (total < 24) return `${total} h`
  const d = Math.floor(total / 24)
  const r = total % 24
  return r ? `${d} d ${r} h` : `${d} d`
}

export function formatDistance(km) {
  if (km < 0.5) return 'en órbita'
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} millones de km`
  return `${Math.round(km)} millones de km`
}
