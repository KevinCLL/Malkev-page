// Utilidades de texto: normalizar para comparar, slugs, CSV y HTML.

// Minúsculas, sin acentos ni signos: «El Señor de los Anillos: La Comunidad» → «el senor de los anillos la comunidad».
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// El mismo slug que usa el catálogo (packages/catalogo): NFD, sin diacríticos, minúsculas,
// [^a-z0-9]+ → '-', sin guiones en los extremos, 80 caracteres como mucho.
export function slugify(text, max = 80) {
  return norm(text).replace(/ /g, '-').slice(0, max).replace(/-+$/g, '') || 'sin-titulo'
}

// Parecido entre dos títulos de 0 a 1 (Dice sobre bigramas), tolerante a subtítulos y artículos.
export function similar(a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const bigrams = (s) => {
    const m = new Map()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) || 0) + 1)
    }
    return m
  }
  const bx = bigrams(x)
  const by = bigrams(y)
  let hits = 0
  for (const [g, n] of bx) hits += Math.min(n, by.get(g) || 0)
  const dice = (2 * hits) / (x.length - 1 + y.length - 1)
  // Si uno contiene al otro entero («Alien» y «Alien, el octavo pasajero»), cuenta casi como igual.
  const contains = x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x)) ? 0.9 : 0
  return Math.max(dice, contains)
}

// CSV con comillas, comas o punto y coma, y saltos de línea dentro de los campos.
export function parseCsv(text, { delimiter } = {}) {
  text = String(text).replace(/^﻿/, '')
  const sep = delimiter || (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',')
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f !== '')) rows.push(row) }
  const [header = [], ...body] = rows
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .trim()
}

export const decode = (s) => stripHtml(s).replace(/\s+/g, ' ').trim()

export const num = (v) => (v !== null && v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null)
