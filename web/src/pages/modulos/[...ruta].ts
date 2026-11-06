import type { APIRoute } from 'astro';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { DIR_MODULOS } from '../../lib/modulos';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.ktx2': 'image/ktx2',
  '.hdr': 'application/octet-stream',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

/** Ruta absoluta y etiqueta (tamaño + fecha) de un fichero de modulos/, o null si no está. */
async function localizar(rel: string): Promise<{ fichero: string; etag: string } | null> {
  const fichero = join(DIR_MODULOS, rel);
  if (rel.startsWith('..') || !fichero.startsWith(DIR_MODULOS + sep)) return null;
  try {
    const st = await stat(fichero);
    return st.isFile() ? { fichero, etag: `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"` } : null;
  } catch {
    return null;
  }
}

/**
 * Los módulos se cargan unos a otros con rutas relativas pensadas para la carpeta del
 * proyecto. P. ej. nave-3d pide `./modulos/audio-nave/…` y `./universo-3d/…`. Aquí todos
 * los módulos son hermanos, así que si no está, se busca quitando el prefijo:
 *   nave-3d/modulos/audio-nave/x.js → audio-nave/x.js
 *   nave-3d/universo-3d/x.js        → universo-3d/x.js
 */
function alternativas(rel: string): string[] {
  const p = rel.split('/');
  const out: string[] = [];
  if (p.length > 3 && p[1] === 'modulos') out.push(p.slice(2).join('/'));
  if (p.length > 2) out.push(p.slice(1).join('/'));
  return out;
}

// Sirve los ficheros de `modulos/` (la nave 3D, la Kallax…) sin salirse de esa carpeta.
// Con ETag: el navegador revalida y, si no ha cambiado, recibe un 304 sin cuerpo (los .bin
// de la filmoteca pesan cientos de KB cada uno).
export const GET: APIRoute = async ({ params, request }) => {
  const rel = normalize(params.ruta ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const tipo = TIPOS[extname(rel).toLowerCase()];
  if (!tipo || rel.startsWith('..')) return new Response('No encontrado', { status: 404 });
  for (const r of [rel, ...alternativas(rel)]) {
    const f = await localizar(r);
    if (!f) continue;
    const cabeceras = { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=300', ETag: f.etag };
    if (request.headers.get('if-none-match') === f.etag) return new Response(null, { status: 304, headers: cabeceras });
    try {
      return new Response(new Uint8Array(await readFile(f.fichero)), { headers: cabeceras });
    } catch {
      break;
    }
  }
  return new Response('No encontrado', { status: 404 });
};
