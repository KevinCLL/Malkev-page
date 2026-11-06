// Servidor del catálogo: API REST en /api/v1, imágenes en /uploads y el panel del capitán en /admin
// (Vite en desarrollo con --dev, la build de dist/ en producción).
import express from 'express'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'
import { apiRouter } from './routes.js'
import { securityHeaders, cors } from './guard.js'
import { pgMessage } from './lib/http.js'
import { hasCaptain, upsertCaptain } from './auth.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEV = process.argv.includes('--dev')
const PORT = Number(process.env.PORT) || 4400
const UPLOADS_DIR = resolve(ROOT, process.env.UPLOADS_DIR || 'uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

export async function createApp({ dev = false } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback') // detrás de Caddy/Nginx en el Hetzner
  app.use(securityHeaders)

  const origins = String(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  app.use('/api/v1', cors(origins), apiRouter({ uploadsDir: UPLOADS_DIR }))
  app.use('/api', (req, res) => res.status(404).json({ error: 'Esa ruta de la API no existe.' }))

  app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '30d', immutable: true }))
  // Imágenes del blog de Jekyll (../../assets), para que los posts importados se vean igual.
  const legacyAssets = join(ROOT, '..', '..', 'assets')
  if (existsSync(legacyAssets)) app.use('/assets', express.static(legacyAssets, { maxAge: '1d' }))

  if (dev) {
    const { createServer } = await import('vite')
    const vite = await createServer({ configFile: join(ROOT, 'vite.config.js'), root: join(ROOT, 'admin'), server: { middlewareMode: true }, appType: 'spa' })
    app.use(vite.middlewares)
  } else {
    const dist = join(ROOT, 'dist')
    if (existsSync(dist)) {
      app.use('/admin', express.static(dist, { index: false, maxAge: '1h' }))
      app.get(/^\/admin(\/.*)?$/, (req, res) => res.sendFile(join(dist, 'index.html')))
    }
  }
  app.get('/', (req, res) => res.redirect('/admin/'))

  // Errores: los nuestros llevan status; los de PostgreSQL se traducen; el resto es 500.
  app.use((err, req, res, next) => {
    const pg = pgMessage(err)
    const status = err.status || err.statusCode || (pg ? pg[0] : 500)
    if (status >= 500) console.error(err)
    res.status(status).json({ error: pg ? pg[1] : status >= 500 && !err.status ? 'Algo ha fallado en el servidor.' : err.message })
  })
  return app
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!(await hasCaptain()) && process.env.ADMIN_PASSWORD) {
    await upsertCaptain(process.env.ADMIN_USER || 'capitan', process.env.ADMIN_PASSWORD)
    console.log(`Cuenta del capitán creada (${process.env.ADMIN_USER || 'capitan'}).`)
  }
  const app = await createApp({ dev: DEV })
  const server = app.listen(PORT, () => console.log(`Catálogo de Malkevnia en http://localhost:${PORT}  (panel: /admin, API: /api/v1)`))
  const stop = () => server.close(() => pool.end().then(() => process.exit(0)))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
