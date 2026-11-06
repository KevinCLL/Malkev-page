// Utilidades de texto compartidas por la API, el seed y los importadores.
// IMPORTANTE: el hilo de importadores genera slugs con esta misma regla para casar con ON CONFLICT (kind, slug).
export function slugify(text, max = 80) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '') || 'sin-titulo'
}

export function stripHtml(html) {
  return String(html ?? '')
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|figure|figcaption|hr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const wordCount = (html) => {
  const t = stripHtml(html)
  return t ? t.split(' ').length : 0
}

export function excerpt(html, max = 220) {
  const t = stripHtml(html)
  if (t.length <= max) return t
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…'
}
