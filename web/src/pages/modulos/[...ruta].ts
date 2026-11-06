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

// Sirve los ficheros de `modulos/` (la nave 3D, la Kallax…) sin salirse de esa carpeta.
export const GET: APIRoute = async ({ params }) => {
  const rel = normalize(params.ruta ?? '').replace(/^([/\\])+/, '');
  const tipo = TIPOS[extname(rel).toLowerCase()];
  const fichero = join(DIR_MODULOS, rel);
  if (!tipo || rel.startsWith('..') || !fichero.startsWith(DIR_MODULOS + sep)) {
    return new Response('No encontrado', { status: 404 });
  }
  try {
    if (!(await stat(fichero)).isFile()) throw new Error();
    return new Response(await readFile(fichero), {
      headers: { 'Content-Type': tipo, 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return new Response('No encontrado', { status: 404 });
  }
};
