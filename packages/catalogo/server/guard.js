// Protecciones sencillas: cabeceras, CORS de solo lectura, CSRF por origen, límites por IP y tokens
// firmados para los comentarios.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { one, query } from './db.js'
import { httpError } from './lib/http.js'

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  next()
}

// CORS para usar la API pública desde otras webs (Astro en desarrollo, la nave 3D…). Nunca con cookies.
export function cors(origins) {
  const allowed = new Set(origins)
  return (req, res, next) => {
    const origin = req.headers.origin
    if (origin && (allowed.has('*') || allowed.has(origin))) {
      res.setHeader('Access-Control-Allow-Origin', allowed.has('*') ? '*' : origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  }
}

// Lo que cambia cosas en el panel solo se acepta desde el mismo origen.
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.headers.origin
  if (origin && origin !== 'null') {
    let host = ''
    try { host = new URL(origin).host } catch {}
    if (host !== req.headers.host) return next(httpError(403, 'Petición rechazada: viene de otro sitio.'))
  }
  next()
}

const buckets = new Map()
// Cuenta un intento y dice si ya van demasiados en la ventana.
export function tooMany(key, max, windowMs) {
  const now = Date.now()
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.every((t) => t < now - windowMs)) buckets.delete(k)
  const hits = (buckets.get(key) || []).filter((t) => t > now - windowMs)
  const blocked = hits.length >= max
  if (!blocked) hits.push(now)
  buckets.set(key, hits)
  return blocked
}

let secret = null
async function serverSecret() {
  if (secret) return secret
  secret = process.env.APP_SECRET || (await one("SELECT value FROM settings WHERE key = 'secret'"))?.value
  if (!secret) {
    await query("INSERT INTO settings (key, value) VALUES ('secret', $1) ON CONFLICT (key) DO NOTHING", [randomBytes(32).toString('hex')])
    secret = (await one("SELECT value FROM settings WHERE key = 'secret'")).value
  }
  return secret
}

export const ipHash = async (ip) => createHash('sha256').update(`${await serverSecret()}|${ip}`).digest('hex').slice(0, 32)

// El formulario pide un token al abrir la entrada y lo devuelve con el comentario: un bot que dispare
// directo contra la API no lo tiene, y obliga a esperar unos segundos. Caduca a las 24 horas.
const MIN_AGE_MS = Number(process.env.COMMENT_MIN_AGE_MS ?? 3000)
const MAX_AGE_MS = 24 * 3600 * 1000
const sign = async (slug, ts) => createHmac('sha256', await serverSecret()).update(`${slug}|${ts}`).digest('hex').slice(0, 40)

export async function commentToken(slug) {
  const ts = Date.now()
  return `${ts}.${await sign(slug, ts)}`
}

export async function checkCommentToken(slug, token) {
  const [tsText, mac] = String(token || '').split('.')
  const ts = Number(tsText)
  const expected = await sign(slug, ts)
  const valid = Number.isFinite(ts) && typeof mac === 'string' && mac.length === expected.length
    && timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  if (!valid || Date.now() - ts > MAX_AGE_MS) throw httpError(400, 'La página llevaba demasiado tiempo abierta: recárgala y vuelve a enviarlo.')
  if (Date.now() - ts < MIN_AGE_MS) throw httpError(400, 'Demasiado rápido. Espera un momento y vuelve a enviarlo.')
}

// En una bitácora personal un comentario con enlaces es casi siempre spam: se queda como tal para revisar.
export const looksSpammy = (body) => /https?:\/\/|www\.|\[url=/i.test(body)
