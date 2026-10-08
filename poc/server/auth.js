// Inicio de sesión de la consola: una sola persona (el capitán) con una contraseña, sesiones guardadas
// en la base de datos y una cookie HttpOnly. Sin dependencias: scrypt y aleatoriedad de node:crypto.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { db } from './db.js'

export const COOKIE = 'malkevnia_sesion'
const SESSION_DAYS = 30
const MAX_SESSIONS = 20
const SCRYPT = { N: 16384, r: 8, p: 1 }

export function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

export const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
export const setSetting = (key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)

// Secreto del servidor (firma los tokens de los comentarios); se genera la primera vez y se queda.
export function serverSecret() {
  let secret = getSetting('secret')
  if (!secret) {
    secret = randomBytes(32).toString('hex')
    setSetting('secret', secret)
  }
  return secret
}

/* ---------- Contraseña ---------- */

export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, SCRYPT)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored || '').split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 64, SCRYPT)
  const expected = Buffer.from(hashHex, 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}

export const isConfigured = () => !!getSetting('password')

export function setPassword(password) {
  password = String(password || '')
  if (password.length < 8) throw httpError(400, 'La contraseña necesita al menos 8 caracteres.')
  if (password.length > 200) throw httpError(400, 'La contraseña es demasiado larga.')
  setSetting('password', hashPassword(password))
}

export const checkPassword = (password) => isConfigured() && verifyPassword(String(password || ''), getSetting('password'))

/* ---------- Sesiones ---------- */

const tokenId = (token) => createHash('sha256').update(token).digest('hex')

export function createSession(userAgent = '') {
  const token = randomBytes(32).toString('hex')
  db.prepare("INSERT INTO sessions (id, expires_at, user_agent) VALUES (?, datetime('now', ?), ?)")
    .run(tokenId(token), `+${SESSION_DAYS} days`, String(userAgent).slice(0, 200))
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run()
  db.prepare('DELETE FROM sessions WHERE id NOT IN (SELECT id FROM sessions ORDER BY created_at DESC, id LIMIT ?)').run(MAX_SESSIONS)
  return token
}

function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()) } catch {}
  }
  return out
}

const tokenOf = (req) => {
  const token = parseCookies(req.headers.cookie)[COOKIE]
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export function sessionOf(req) {
  const token = tokenOf(req)
  if (!token) return null
  return db.prepare("SELECT id, created_at FROM sessions WHERE id = ? AND expires_at > datetime('now')").get(tokenId(token)) || null
}

export function destroySession(req) {
  const token = tokenOf(req)
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(tokenId(token))
}

export const destroyAllSessions = () => db.exec('DELETE FROM sessions')

export function cookieHeader(token, req) {
  const secure = process.env.COOKIE_SECURE === '1' || req.secure || req.headers['x-forwarded-proto'] === 'https'
  const parts = [`${COOKIE}=${token || ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/* ---------- Middleware ---------- */

export function attachAuth(req, res, next) {
  req.admin = !!sessionOf(req)
  next()
}

export function requireAdmin(req, res, next) {
  if (!req.admin) return next(httpError(401, 'Hace falta iniciar sesión en la consola.'))
  next()
}
