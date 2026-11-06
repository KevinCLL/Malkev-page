// Inicio de sesión del panel: una cuenta (el capitán) con contraseña scrypt, sesiones en admin_sessions
// y una cookie HttpOnly + SameSite=Strict. Sin dependencias: todo con node:crypto.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { one, query } from './db.js'
import { httpError } from './lib/http.js'

export const COOKIE = 'malkevnia_capitan'
const SESSION_DAYS = 30
const SCRYPT = { N: 16384, r: 8, p: 1 }

export function hashPassword(password) {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64, SCRYPT).toString('hex')}`
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored || '').split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const hash = scryptSync(String(password), Buffer.from(saltHex, 'hex'), 64, SCRYPT)
  const expected = Buffer.from(hashHex, 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}

export function checkNewPassword(password) {
  password = String(password || '')
  if (password.length < 10) throw httpError(400, 'La contraseña necesita al menos 10 caracteres.')
  if (password.length > 200) throw httpError(400, 'La contraseña es demasiado larga.')
  return password
}

export async function upsertCaptain(username, password) {
  checkNewPassword(password)
  return one(
    `INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id, username`,
    [username, hashPassword(password)],
  )
}

export const hasCaptain = async () => !!(await one('SELECT 1 AS ok FROM admin_users LIMIT 1'))

const tokenHash = (token) => createHash('sha256').update(token).digest('hex')

export async function createSession(userId, userAgent = '') {
  const token = randomBytes(32).toString('base64url')
  await query(
    'INSERT INTO admin_sessions (token_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, now() + $4::interval)',
    [tokenHash(token), userId, String(userAgent).slice(0, 200), `${SESSION_DAYS} days`],
  )
  await query('DELETE FROM admin_sessions WHERE expires_at < now()')
  return token
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) {
      try { return decodeURIComponent(part.slice(i + 1).trim()) } catch { return null }
    }
  }
  return null
}

export function cookieHeader(req, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https'
  const parts = [`${COOKIE}=${token || ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${token ? SESSION_DAYS * 86400 : 0}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

// Añade req.captain si la cookie corresponde a una sesión viva.
export async function attachCaptain(req, res, next) {
  const token = readCookie(req, COOKIE)
  if (token) {
    req.sessionHash = tokenHash(token)
    req.captain = await one(
      `SELECT u.id, u.username FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`, [req.sessionHash])
  }
  next()
}

export function requireCaptain(req, res, next) {
  if (!req.captain) return next(httpError(401, 'Hay que iniciar sesión en la consola del capitán.'))
  next()
}

export const destroySession = (req) => req.sessionHash && query('DELETE FROM admin_sessions WHERE token_hash = $1', [req.sessionHash])
export const destroyOtherSessions = (req) =>
  query('DELETE FROM admin_sessions WHERE user_id = $1 AND token_hash <> $2', [req.captain.id, req.sessionHash])
