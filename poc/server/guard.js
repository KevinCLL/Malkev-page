// Protecciones sencillas y sin dependencias: cabeceras de seguridad, rechazo de peticiones que cambian
// cosas y vienen de otro sitio (CSRF), límites de intentos por dirección y tokens firmados para los
// comentarios.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { httpError, serverSecret } from './auth.js'

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
}

// Las peticiones que cambian cosas solo se aceptan desde esta misma web. La cookie de sesión ya es
// SameSite, pero así ni siquiera llegan a mirarse.
export function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const origin = req.headers.origin
  if (origin && origin !== 'null') {
    let host = ''
    try { host = new URL(origin).host } catch {}
    if (host !== req.headers.host) return next(httpError(403, 'Petición rechazada: viene de otro sitio.'))
  }
  next()
}

/* ---------- Límites por dirección ---------- */

const buckets = new Map()

function prune() {
  if (buckets.size < 5000) return
  const now = Date.now()
  for (const [k, v] of buckets) if (v.until < now && v.hits.every((t) => t < now - 3600000)) buckets.delete(k)
}

// Cuenta un intento y dice si ya son demasiados en la ventana indicada.
export function tooMany(key, max, windowMs) {
  prune()
  const now = Date.now()
  const b = buckets.get(key) || { hits: [], until: 0 }
  b.hits = b.hits.filter((t) => t > now - windowMs)
  if (b.hits.length >= max) {
    buckets.set(key, b)
    return true
  }
  b.hits.push(now)
  buckets.set(key, b)
  return false
}

// Intentos de inicio de sesión: a partir del quinto fallo hay que esperar, cada vez más.
export function loginGate(key) {
  const b = buckets.get(key)
  if (b && b.until > Date.now()) {
    throw httpError(429, `Demasiados intentos. Espera ${Math.ceil((b.until - Date.now()) / 1000)} segundos.`)
  }
}
export function loginFailed(key) {
  const b = buckets.get(key) || { hits: [], until: 0 }
  b.fails = (b.fails || 0) + 1
  if (b.fails >= 5) b.until = Date.now() + Math.min(15 * 60, 30 * 2 ** (b.fails - 5)) * 1000
  buckets.set(key, b)
}
export function loginOk(key) {
  buckets.delete(key)
}

/* ---------- Tokens de los comentarios ---------- */

// El formulario pide un token al cargar la entrada y lo manda con el comentario. Un bot que dispare
// directamente contra la API no lo tiene, y el token obliga a que pasen unos segundos entre pedirlo y
// usarlo. Caduca a las 24 horas: entonces basta con recargar la página.
const MIN_AGE_MS = 3000
const MAX_AGE_MS = 24 * 3600 * 1000

const sign = (slug, ts) => createHmac('sha256', serverSecret()).update(`${slug}|${ts}`).digest('hex').slice(0, 40)

export function commentToken(slug) {
  const ts = Date.now()
  return `${ts}.${sign(slug, ts)}`
}

export function checkCommentToken(slug, token) {
  const [tsText, mac] = String(token || '').split('.')
  const ts = Number(tsText)
  const expected = sign(slug, ts)
  const valid = Number.isFinite(ts) && typeof mac === 'string' && mac.length === expected.length
    && timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  if (!valid || Date.now() - ts > MAX_AGE_MS) {
    throw httpError(400, 'La página llevaba demasiado tiempo abierta: recárgala y vuelve a enviar el comentario.')
  }
  if (Date.now() - ts < MIN_AGE_MS) throw httpError(400, 'Demasiado rápido. Espera un momento y vuelve a enviarlo.')
}

// Un comentario con enlaces se queda pendiente de moderar (en una bitácora personal son raros).
export const looksSpammy = (body) => /https?:\/\/|www\./i.test(body) || /\[url=|\[link=/i.test(body)
