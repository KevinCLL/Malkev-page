// Caché en disco de las respuestas de las APIs: repetir una importación no vuelve a preguntar lo mismo,
// y con --sin-red se trabaja solo con lo que ya está guardado.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'

export function crearCache(dir = process.env.IMPORTADORES_CACHE || 'cache') {
  const base = resolve(dir)
  const ruta = (ns, clave) => join(base, ns, createHash('sha1').update(clave).digest('hex').slice(0, 16) + '.json')
  return {
    dir: base,
    get(ns, clave) {
      const f = ruta(ns, clave)
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).data : undefined
    },
    set(ns, clave, data) {
      mkdirSync(join(base, ns), { recursive: true })
      writeFileSync(ruta(ns, clave), JSON.stringify({ clave, guardado: new Date().toISOString(), data }))
    },
  }
}

// Una cola sencilla: como mucho una petición cada `ms` milisegundos por servicio.
export function limitador(ms) {
  let siguiente = 0
  return async () => {
    const ahora = Date.now()
    const espera = Math.max(0, siguiente - ahora)
    siguiente = Math.max(ahora, siguiente) + ms
    if (espera) await new Promise((r) => setTimeout(r, espera))
  }
}

// GET JSON con caché, límite de ritmo y reintentos ante 429/5xx. Devuelve null en 404.
// claveCache: lo que identifica la petición en la caché (por defecto la URL); sirve para no guardar claves de API.
export async function getJson({ cache, ns, url, claveCache = url, headers = {}, turno, sinRed = false, intentos = 3 }) {
  const hit = cache?.get(ns, claveCache)
  if (hit !== undefined) return hit
  if (sinRed) return undefined
  for (let i = 1; ; i++) {
    await turno?.()
    let res
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
    } catch (err) {
      if (i >= intentos) throw err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
      continue
    }
    if (res.status === 404) { cache?.set(ns, claveCache, null); return null }
    if ((res.status === 429 || res.status >= 500) && i < intentos) {
      const retry = Number(res.headers.get('retry-after')) || 2 ** i
      await new Promise((r) => setTimeout(r, retry * 1000))
      continue
    }
    if (!res.ok) {
      const err = new Error(`${new URL(url).host} respondió ${res.status}`)
      err.status = res.status
      throw err
    }
    const data = await res.json()
    cache?.set(ns, claveCache, data)
    return data
  }
}
