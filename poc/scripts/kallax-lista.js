// Escribe la lista cubo a cubo de las dos Kallax (scripts/kallax-real.js) en Markdown, para revisarla.
// Uso: node scripts/kallax-lista.js [fichero de salida]   (sin fichero, la saca por pantalla)
import { writeFileSync } from 'node:fs'
import { furniture } from './kallax-real.js'
import { eachPlaced } from '../src/kallax.js'

const doubts = []
const postits = []
const dots = []

function item(it) {
  let s = it.title
  if (it.doubt) {
    doubts.push(it)
    s += ` ❓ (${doubts.length})`
  }
  if (it.note) postits.push(it)
  if (it.dot) dots.push(it)
  if (it.note) s += ` · 📝 «${it.note}»`
  if (it.dot) s += ` · ● ${it.dot}`
  return s
}
const lying = (it) => (it.kind === 'rpg' ? 'Tumbado' : 'Tumbada')
const deco = (d) => (d.label ? `_${d.label}_` : null)
const thing = (x) => (x.deco ? deco(x) : item(x))

function group(g, indent = '') {
  const lines = []
  const list = (xs) => xs.map(thing).filter(Boolean)
  if (g.type === 'stack') {
    const xs = list(g.items)
    const first = g.items[0]
    if (xs.length === 1) lines.push(`${indent}- ${first.upright ? 'De pie' : first.face ? 'De frente' : lying(first)}: ${xs[0]}`)
    else if (xs.length) lines.push(`${indent}- Pila, de abajo arriba:`, ...xs.map((x, i) => `${indent}  ${i + 1}. ${x}`))
    if (g.above?.length) {
      lines.push(`${indent}  - Encima de la pila, de izquierda a derecha:`)
      for (const a of g.above) lines.push(...group(a, `${indent}    `))
    }
  } else if (g.type === 'row') {
    const xs = list(g.items)
    lines.push(`${indent}- De pie, de izquierda a derecha:`, ...xs.map((x, i) => `${indent}  ${i + 1}. ${x}`))
    for (const o of g.on || []) lines.push(`${indent}  - ${lying(o)} encima: ${thing(o)}`)
  } else if (g.type === 'bridge') {
    for (const p of g.groups) lines.push(...group(p, indent))
    for (const o of g.on || []) lines.push(`${indent}- ${lying(o)} por encima de todo lo anterior: ${thing(o)}`)
  } else if (g.type === 'face') {
    lines.push(`${indent}- De frente: ${thing(g.items[0])}`)
  } else if (g.type === 'deco' && g.items[0].label) {
    lines.push(`${indent}- ${deco(g.items[0])}`)
  }
  return lines
}

const range = (from, n) => (n === 1 ? `${from}` : n === 2 ? `${from} y ${from + 1}` : `${from} a ${from + n - 1}`)

const out = []
let games = 0
let rpg = 0
for (const f of furniture) eachPlaced(f, (it) => (it.kind === 'rpg' ? rpg++ : games++))

out.push(
  '# Las dos Kallax, cubo a cubo',
  '',
  `Leído de tus fotos del 8 de octubre: **${games} cajas** y **${rpg} libros de rol**.`,
  'Las filas se cuentan de arriba abajo y las columnas de izquierda a derecha, mirando la Kallax de frente.',
  'Las pilas van de abajo arriba y lo que está de pie, de izquierda a derecha.',
  '',
  '- ❓ con un número: no lo leí bien. Al final están todas las dudas numeradas para que me contestes por número.',
  '- 📝 «…»: lo que pone el pósit pegado a la caja.',
  '- ● y un número: la pegatina de color (¿son los jugadores ideales?).',
  '- _En cursiva_: lo que no es un juego (la tele, peluches, estuches…).',
  '',
)

for (const f of furniture) {
  out.push(`## ${f.name}`, '', '### Encima', '')
  for (const g of f.top) out.push(...group(g))
  out.push('')
  for (const c of f.cubes) {
    const where = `${c.rows > 1 ? 'Filas' : 'Fila'} ${range(c.row, c.rows)}, ${c.cols > 1 ? 'columnas' : 'columna'} ${range(c.col, c.cols)}`
    const extras = []
    if (c.rows > 1 || c.cols > 1) extras.push(`hueco unido${c.rods.length ? ' con barra de apoyo' : ''}`)
    if (c.organizer) extras.push('con organizador')
    out.push(`### ${where}${extras.length ? ` (${extras.join(', ')})` : ''}`, '')
    const groups = c.tiers.flat()
    if (!groups.length) out.push('_Vacío._')
    c.tiers.forEach((tier, t) => {
      if (c.tiers.length > 1) out.push(`- Balda ${t + 1} del organizador${t === 0 ? ' (la de arriba)' : ''}:`)
      for (const g of tier) out.push(...group(g, c.tiers.length > 1 ? '  ' : ''))
    })
    if (c.aside) {
      out.push('- Al lado del organizador:')
      out.push(...group(c.aside, '  '))
    }
    out.push('')
  }
}

const locate = new Map()
for (const f of furniture) eachPlaced(f, (it, where) => locate.set(it, where))

out.push('## Dudas', '', 'Contéstame con el número y lo que es; con las que sepas ya me vale.', '')
doubts.forEach((it, i) => out.push(`${i + 1}. **${it.title}** (${locate.get(it)}). ${it.doubt}`))
out.push('', '## Pósits', '')
for (const it of postits) out.push(`- **${it.title}**: «${it.note}»`)
out.push('', '## Pegatinas de colores', '', 'Leí estos números; no sé si son los jugadores ideales o algo tuyo.', '')
for (const it of dots) out.push(`- **${it.title}**: ${it.dot}`)
out.push('')

const text = out.join('\n')
if (process.argv[2]) writeFileSync(process.argv[2], text)
else process.stdout.write(text)
