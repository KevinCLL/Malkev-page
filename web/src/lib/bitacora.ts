import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGO_API_URL } from 'astro:env/server';
import { db } from './db';
import { DIR_MODULOS } from './modulos';

/*
 * La bitácora tiene tres fuentes, por orden:
 *   1. La API del catálogo (hilo "Base de datos y panel de administración", packages/catalogo),
 *      si CATALOGO_API_URL está definida. Es la fuente de verdad en producción.
 *   2. El PostgreSQL propio de web/ (provisional, ver db/migrations), si hay DATABASE_URL.
 *   3. El módulo modulos/bitacora/posts.json, para trabajar sin nada levantado.
 * Si una fuente falla (caída, tiempo agotado), se pasa a la siguiente sin romper la página.
 */

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

/**
 * Los posts antiguos enlazan con URL absolutas a malkevnia.com. Cuando esta web
 * sea malkevnia.com, esas rutas las sirve ella misma: las dejamos relativas para
 * que también funcionen en local y en preproducción. Los enlaces a /blog/AAAA/MM/DD/slug/
 * pasan directamente a /bitacora/slug, sin pasar por la redirección.
 */
export function localizar<T extends string | null>(s: T): T {
  if (!s) return s;
  return s
    // Absolutas a malkevnia.com, o relativas al principio de un atributo (href="/blog/…")
    .replace(/(?:https?:\/\/(?:www\.)?malkevnia\.com|(?<=["']))\/blog\/\d{4}\/\d{2}\/\d{2}\/([^/"'?#\s]+)\/?/g, '/bitacora/$1')
    .replace(/https?:\/\/(?:www\.)?malkevnia\.com\//g, '/') as T;
}

/* ------------------------------------------------------------------ 1. API del catálogo */

const API = (CATALOGO_API_URL ?? '').replace(/\/+$/, '');
/** Con el catálogo hay comentarios (su API se publica en /api/v1 del mismo dominio). */
export const hayCatalogo = API !== '';

/** Para /api/salud: ¿responde la API del catálogo? */
export async function catalogoVivo(): Promise<boolean> {
  if (!API) return false;
  try {
    return (await fetch(API, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}
/** La API ya manda Cache-Control de 60 s; aquí guardamos lo mismo para no pedirla en cada visita. */
const TTL_MS = 60_000;
const memoria = new Map<string, { hasta: number; valor: unknown }>();
/** Si la API falla, no se vuelve a intentar hasta pasado este momento (evita esperar en cada visita). */
let apiCaidaHasta = 0;

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

/** GET a la API con caché corta. Devuelve null en un 404 y lanza en cualquier otro fallo. */
async function api<T>(ruta: string): Promise<T | null> {
  const guardado = memoria.get(ruta);
  if (guardado && guardado.hasta > Date.now()) return guardado.valor as T | null;
  if (apiCaidaHasta > Date.now()) throw new Error('caída hace menos de 30 s');
  let valor: T | null;
  try {
    const r = await fetch(`${API}${ruta}`, { signal: AbortSignal.timeout(4000), headers: { Accept: 'application/json' } });
    if (r.status !== 404 && !r.ok) throw new Error(`HTTP ${r.status} en ${ruta}`);
    valor = r.status === 404 ? null : ((await r.json()) as T);
  } catch (e) {
    apiCaidaHasta = Date.now() + 30_000;
    throw e;
  }
  if (memoria.size > 500) memoria.clear();
  memoria.set(ruta, { hasta: Date.now() + TTL_MS, valor });
  return valor;
}

const avisar = (fuente: string, e: unknown) =>
  console.warn(`[bitácora] ${fuente} no disponible, paso a la siguiente fuente: ${(e as Error).message}`);

/* ------------------------------------------------------------------ 3. JSON del módulo */

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

let json: Entrada[] | null = null;

/** "2026-05-25 12:00:00 +0100" (formato Jekyll) → Date. */
const fechaJekyll = (p: PostJson) =>
  new Date(p.datetime ? p.datetime.replace(/^(\S+) (\S+) ([+-]\d{2})(\d{2})$/, '$1T$2$3:$4') : p.date);

function desdeJson(): Entrada[] {
  if (json) return json;
  const f = join(DIR_MODULOS, 'bitacora', 'posts.json');
  if (!existsSync(f)) return (json = []);
  const { posts } = JSON.parse(readFileSync(f, 'utf8')) as { posts: PostJson[] };
  json = posts
    .map((p) => ({
      slug: p.id,
      titulo: p.title,
      fecha: fechaJekyll(p),
      descripcion: p.description ?? '',
      etiquetas: p.tags ?? [],
      portada: localizar(p.cover ?? null),
      minutos: p.readingMinutes ?? null,
      html: localizar(p.html),
    }))
    .sort((a, b) => +b.fecha - +a.fecha);
  return json;
}

/* ------------------------------------------------------------------ Consultas */

export async function listarEntradas(): Promise<Entrada[]> {
  if (API) {
    try {
      const res = await api<{ posts: PostApi[] }>('/posts?limit=500');
      if (res) return res.posts.map(desdeApi);
    } catch (e) {
      avisar('API del catálogo', e);
    }
  }
  if (db) {
    try {
      const filas = await db<Entrada[]>`
        select slug, titulo, publicado_en as fecha, descripcion, etiquetas, portada, minutos
        from entradas where publicado_en <= now() order by publicado_en desc`;
      if (filas.length) return filas.map((e) => ({ ...e, portada: localizar(e.portada) }));
    } catch (e) {
      avisar('PostgreSQL', e);
    }
  }
  return desdeJson().map(({ html: _html, ...e }) => e);
}

export async function leerEntrada(slug: string): Promise<Entrada | null> {
  if (API) {
    try {
      const p = await api<PostApi>(`/posts/${encodeURIComponent(slug)}`);
      return p ? desdeApi(p) : null;
    } catch (e) {
      avisar('API del catálogo', e);
    }
  }
  if (db) {
    try {
      const [e] = await db<Entrada[]>`
        select slug, titulo, publicado_en as fecha, descripcion, etiquetas, portada, minutos, html
        from entradas where slug = ${slug} and publicado_en <= now()`;
      if (e) return { ...e, portada: localizar(e.portada), html: localizar(e.html ?? '') };
    } catch (err) {
      avisar('PostgreSQL', err);
    }
  }
  return desdeJson().find((x) => x.slug === slug) ?? null;
}

/**
 * Traduce una URL antigua (Jekyll /blog/AAAA/MM/DD/slug/ o WordPress /?p=123/) al slug
 * de la entrada. Con la API usa /posts/resolve, que conoce los alias; sin ella, toma
 * el último trozo de la ruta.
 */
export async function resolverUrlAntigua(ruta: string): Promise<string | null> {
  if (API) {
    try {
      const r = await api<{ slug: string }>(`/posts/resolve?path=${encodeURIComponent(ruta)}`);
      return r?.slug ?? null;
    } catch (e) {
      avisar('API del catálogo', e);
    }
  }
  const m = ruta.match(/^\/blog\/\d{4}\/\d{2}\/\d{2}\/([^/?#]+)\/?$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
