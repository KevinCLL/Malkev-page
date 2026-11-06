import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './db';
import { DIR_MODULOS } from './modulos';

export interface Entrada {
  slug: string;
  titulo: string;
  fecha: Date;
  descripcion: string;
  etiquetas: string[];
  portada: string | null;
  minutos: number | null;
  html?: string;
}

interface PostJson {
  id: string;
  title: string;
  datetime?: string;
  date: string;
  description?: string;
  tags?: string[];
  cover?: string | null;
  readingMinutes?: number;
  html: string;
}

let cache: Entrada[] | null = null;

/** Plan B sin base de datos: el módulo `modulos/bitacora/posts.json`. */
function desdeJson(): Entrada[] {
  if (cache) return cache;
  const f = join(DIR_MODULOS, 'bitacora', 'posts.json');
  if (!existsSync(f)) return (cache = []);
  const { posts } = JSON.parse(readFileSync(f, 'utf8')) as { posts: PostJson[] };
  cache = posts
    .map((p) => ({
      slug: p.id,
      titulo: p.title,
      fecha: new Date(p.datetime ? p.datetime.replace(/^(\S+) (\S+) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4') : p.date),
      descripcion: p.description ?? '',
      etiquetas: p.tags ?? [],
      portada: localizar(p.cover ?? null),
      minutos: p.readingMinutes ?? null,
      html: p.html,
    }))
    .sort((a, b) => +b.fecha - +a.fecha);
  return cache;
}

/**
 * Los posts antiguos enlazan con URL absolutas a malkevnia.com. Cuando esta web
 * sea malkevnia.com, esas rutas las sirve ella misma: las dejamos relativas para
 * que también funcionen en local y en preproducción.
 */
export function localizar<T extends string | null>(s: T): T {
  if (!s) return s;
  return s
    .replace(/https?:\/\/(www\.)?malkevnia\.com\/blog\/\d{4}\/\d{2}\/\d{2}\/([^/"'?#]+)\/?/g, '/bitacora/$2')
    .replace(/https?:\/\/(www\.)?malkevnia\.com\//g, '/') as T;
}

export async function listarEntradas(): Promise<Entrada[]> {
  if (db) {
    try {
      const filas = await db<Entrada[]>`
        select slug, titulo, publicado_en as fecha, descripcion, etiquetas, portada, minutos
        from entradas where publicado_en <= now() order by publicado_en desc`;
      if (filas.length) return filas.map((e) => ({ ...e, portada: localizar(e.portada) }));
    } catch (e) {
      console.warn('[bitácora] base de datos no disponible, uso el JSON:', (e as Error).message);
    }
  }
  return desdeJson().map(({ html, ...e }) => e);
}

export async function leerEntrada(slug: string): Promise<Entrada | null> {
  if (db) {
    try {
      const [e] = await db<Entrada[]>`
        select slug, titulo, publicado_en as fecha, descripcion, etiquetas, portada, minutos, html
        from entradas where slug = ${slug} and publicado_en <= now()`;
      if (e) return { ...e, portada: localizar(e.portada), html: localizar(e.html ?? '') };
    } catch (err) {
      console.warn('[bitácora] base de datos no disponible, uso el JSON:', (err as Error).message);
    }
  }
  const e = desdeJson().find((x) => x.slug === slug);
  return e ? { ...e, html: localizar(e.html ?? '') } : null;
}
