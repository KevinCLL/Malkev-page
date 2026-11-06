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
};

async function leer(rel: string): Promise<Buffer | null> {
  const fichero = join(DIR_MODULOS, rel);
  if (rel.startsWith('..') || !fichero.startsWith(DIR_MODULOS + sep)) return null;
  try {
    return (await stat(fichero)).isFile() ? await readFile(fichero) : null;
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
export const GET: APIRoute = async ({ params }) => {
  const rel = normalize(params.ruta ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  const tipo = TIPOS[extname(rel).toLowerCase()];
  if (!tipo) return new Response('No encontrado', { status: 404 });
  for (const r of [rel, ...alternativas(rel)]) {
    const datos = await leer(r);
    if (datos) {
      return new Response(new Uint8Array(datos), {
        headers: { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=300' },
      });
    }
  }
  return new Response('No encontrado', { status: 404 });
};
