export function httpError(status, message, details) {
  const err = new Error(message)
  err.status = status
  if (details) err.details = details
  return err
}

// Paginación común: ?limit=&offset= con topes razonables.
export function page(q, { def = 24, max = 200 } = {}) {
  const limit = Math.min(max, Math.max(1, Number.parseInt(q.limit, 10) || def))
  const offset = Math.max(0, Number.parseInt(q.offset, 10) || 0)
  return { limit, offset }
}

export const list = (v) => (v == null || v === '' ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean))
export const bool = (v) => (v === undefined || v === '' ? undefined : ['1', 'true', 'si', 'sí', 'yes'].includes(String(v).toLowerCase()))

// Traduce errores de PostgreSQL a mensajes en castellano para el panel.
export function pgMessage(err) {
  switch (err.code) {
    case '23505': return [409, `Ya existe algo igual (${err.detail || err.constraint || 'valor repetido'}).`]
    case '23503': return [400, 'Hace referencia a algo que no existe.']
    case '23514': return [400, `Algún dato no es válido (${err.constraint || 'restricción'}).`]
    case '22P02': return [400, `Valor no válido: ${err.message}`]
    case '22001': return [400, 'Algún texto es demasiado largo.']
    case '22003': return [400, 'Algún número se sale de rango.']
    default: return null
  }
}
