// Geometría de las Kallax: lo comparten la sala de juegos, la importación y el script de revisión.
// Todas las medidas van en "cubos": 1 es el hueco interior de un cubo (33 cm).

export const BOARD = 0.05 // tabique interior (1,6 cm)
export const FRAME = 0.12 // marco exterior (3,9 cm)
export const PLANK = 0.03 // baldas de los organizadores

export const GAP = 0.02 // separación mínima entre grupos de un mismo hueco

export function span(n) {
  return n + (n - 1) * BOARD
}

export function furnitureWidth(f) {
  return span(f.cols) + 2 * FRAME
}

// Lo que ocupa un grupo de cajas (ancho y alto) en cubos.
export function groupSize(g, sizeOf = (it) => it) {
  const sum = (list, key) => list.reduce((s, x) => s + key(x), 0)
  const max = (list, key) => list.reduce((m, x) => Math.max(m, key(x)), 0)
  const items = g.items || []
  if (g.type === 'stack') {
    const above = (g.above || []).map((a) => groupSize(a, sizeOf))
    return {
      w: Math.max(max(items, (it) => sizeOf(it).w), sum(above, (a) => a.w) + GAP * Math.max(0, above.length - 1)),
      h: sum(items, (it) => sizeOf(it).h) + max(above, (a) => a.h),
    }
  }
  if (g.type === 'row') {
    const on = g.on || []
    return {
      w: Math.max(sum(items, (it) => sizeOf(it).w), max(on, (it) => sizeOf(it).w)),
      h: max(items, (it) => sizeOf(it).h) + sum(on, (it) => sizeOf(it).h),
    }
  }
  if (g.type === 'bridge') {
    const parts = g.groups.map((p) => groupSize(p, sizeOf))
    const on = g.on || []
    return {
      w: Math.max(sum(parts, (p) => p.w) + GAP * (parts.length - 1), max(on, (it) => sizeOf(it).w)),
      h: max(parts, (p) => p.h) + sum(on, (it) => sizeOf(it).h),
    }
  }
  const it = sizeOf(items[0])
  return { w: it.w, h: it.h }
}

// Alturas de las baldas de un hueco (de arriba abajo), descontando las baldas del organizador.
export function tierHeights(c) {
  const total = span(c.rows)
  const n = c.tiers.length
  if (n === 1) return [total]
  const free = total - (n - 1) * PLANK
  const sizes = c.tierSizes || new Array(n).fill(1 / n)
  const sumSizes = sizes.reduce((a, b) => a + b, 0)
  return sizes.map((s) => (free * s) / sumSizes)
}

const ORD = (n) => `${n}ª`

function cellLabel(c) {
  const list = (from, n) => {
    if (n === 1) return String(from)
    if (n === 2) return `${from} y ${from + 1}`
    return `${from} a ${from + n - 1}`
  }
  const rows = c.rows > 1 ? `filas ${list(c.row, c.rows)}` : `fila ${c.row}`
  const cols = c.cols > 1 ? `columnas ${list(c.col, c.cols)}` : `columna ${c.col}`
  return `${rows}, ${cols}`
}

// Las cajas son femeninas y los libros de rol masculinos: "tumbada, la 2ª" / "tumbado, el 2º".
const fem = (it) => it.kind !== 'rpg'
const nth = (it, i) => (fem(it) ? `la ${i + 1}ª` : `el ${i + 1}º`)
const lying = (it) => (fem(it) ? 'tumbada' : 'tumbado')

// Recorre todas las cajas y libros de una Kallax (no la decoración), con una descripción de dónde están.
export function eachPlaced(f, fn) {
  const real = (list) => (list || []).filter((it) => !it.deco)
  const visit = (groups, where) => {
    for (const g of groups) {
      if (g.type === 'stack') {
        const items = real(g.items)
        const how = (it) => (it.face ? 'de frente' : it.upright ? 'de pie' : lying(it))
        items.forEach((it, i) => fn(it, `${where} · ${how(it)}${items.length > 1 ? `, ${nth(it, i)} empezando por abajo` : ''}`))
        if (g.above) visit(g.above, `${where} · encima de una pila`)
      } else if (g.type === 'row') {
        const items = real(g.items)
        items.forEach((it, i) => fn(it, `${where} · de pie${items.length > 1 ? `, ${nth(it, i)} por la izquierda` : ''}`))
        real(g.on).forEach((it) => fn(it, `${where} · ${lying(it)} encima de ${fem(items[0] || it) ? 'las cajas' : 'los libros'} de pie`))
      } else if (g.type === 'bridge') {
        visit(g.groups, where)
        real(g.on).forEach((it) => fn(it, `${where} · ${lying(it)} por encima de todo`))
      } else if (g.type === 'face') {
        real(g.items).forEach((it) => fn(it, `${where} · de frente`))
      }
    }
  }
  visit(f.top || [], `${f.name.split(' · ')[0]} · encima`)
  for (const c of f.cubes) {
    const base = `${f.name.split(' · ')[0]} · ${cellLabel(c)}`
    c.tiers.forEach((tier, t) => visit(tier, c.tiers.length > 1 ? `${base} · ${ORD(t + 1)} balda del organizador` : base))
    if (c.aside) visit([c.aside], `${base} · al lado del organizador`)
  }
}

// Lo que está delante de todo (un peluche delante de las cajas) no ocupa sitio en la balda.
export const inFront = (g) => g.type === 'deco' && !!g.items[0]?.front

// Ancho que ocupan los grupos de una balda, sumando una separación mínima.
export function tierWidth(groups, sizeOf) {
  const flow = groups.filter((g) => !inFront(g))
  return flow.reduce((s, g) => s + groupSize(g, sizeOf).w, 0) + GAP * Math.max(0, flow.length - 1)
}

// Ancho libre para las baldas de un hueco (lo que no ocupa la columna de al lado del organizador).
export function tiersWidth(c, sizeOf) {
  return span(c.cols) - (c.aside ? groupSize(c.aside, sizeOf).w + GAP : 0)
}
