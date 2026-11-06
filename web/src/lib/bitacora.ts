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

/*
 * Orden de fuentes: API del catálogo → PostgreSQL propio (provisional, ver db/migrations)
 * → módulo modulos/bitacora/posts.json.
 */

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

/**
 * Fuente 1: la API del catálogo (hilo "Base de datos y panel de administración",
 * packages/catalogo). Si CATALOGO_API_URL está definida, es la fuente de verdad.
 * Ej.: CATALOGO_API_URL=http://catalogo:4400/api/v1
 */
const API = (process.env.CATALOGO_API_URL ?? import.meta.env.CATALOGO_API_URL ?? '').replace(/\/$/, '');

interface PostApi {
  slug: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  published_at: string;
  reading_minutes?: number | null;
  tags?: { slug: string; name: string }[];
  content_html?: string;
}

const desdeApi = (p: PostApi): Entrada => ({
  slug: p.slug,
  titulo: p.title,
  fecha: new Date(p.published_at),
  descripcion: p.description ?? '',
  etiquetas: (p.tags ?? []).map((t) => t.slug),
  portada: localizar(p.cover_url ?? null),
  minutos: p.reading_minutes ?? null,
  html: p.content_html === undefined ? undefined : localizar(p.content_html),
});

async function api<T>(ruta: string): Promise<T | null> {
  const r = await fetch(`${API}${ruta}`, { signal: AbortSignal.timeout(4000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API del catálogo: ${r.status} en ${ruta}`);
  return (await r.json()) as T;
}

export async function listarEntradas(): Promise<Entrada[]> {
  if (API) {
    try {
      const res = await api<{ posts: PostApi[] }>('/posts?limit=500');
      if (res) return res.posts.map(desdeApi);
    } catch (e) {
      console.warn('[bitácora] API del catálogo no disponible:', (e as Error).message);
    }
  }
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
  if (API) {
    try {
      const p = await api<PostApi>(`/posts/${encodeURIComponent(slug)}`);
      return p ? desdeApi(p) : null;
    } catch (e) {
      console.warn('[bitácora] API del catálogo no disponible:', (e as Error).message);
    }
  }
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
