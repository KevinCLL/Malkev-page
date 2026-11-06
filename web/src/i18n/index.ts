/**
 * Idiomas de La Malkevnia: español por defecto (sin prefijo) e inglés bajo /en/.
 *
 * Los textos viven en un único fichero compartido con los módulos de la nave,
 * `modulos/i18n/textos.json` (se edita en /mnt/project-files/modulos/i18n/ y llega aquí con
 * `npm run modulos:sync`). Es al estilo gettext: la clave es el texto en español y cada
 * idioma de destino tiene sus traducciones por espacios de nombres (`comun`, `salas`, `web`,
 * uno por módulo…). Si falta una traducción, sale el español.
 */
import datos from '../../modulos/i18n/textos.json';

export type Idioma = 'es' | 'en';
export const IDIOMAS: readonly Idioma[] = ['es', 'en'];
export const POR_DEFECTO: Idioma = 'es';

/** Para Intl (fechas) y para og:locale. */
export const LOCALE: Record<Idioma, string> = { es: 'es-ES', en: 'en-GB' };
export const LOCALE_OG: Record<Idioma, string> = { es: 'es_ES', en: 'en_GB' };
/** Nombre de cada idioma en su propio idioma (selector). */
export const NOMBRE_IDIOMA: Record<Idioma, string> = { es: 'Español', en: 'English' };

export type Diccionario = Record<string, string>;
type Variables = Record<string, string | number>;
export type Traductor = (es: string, vars?: Variables) => string;

/** Espacios de nombres que usan las páginas de la web (el primero manda). */
const ESPACIOS_WEB = ['web', 'salas', 'comun'];

const bloques = datos as unknown as Partial<Record<Idioma, Record<string, Diccionario>>>;

export const esIdioma = (x: unknown): x is Idioma => typeof x === 'string' && (IDIOMAS as readonly string[]).includes(x);

/** Diccionario plano español → idioma con los espacios indicados (el primero manda). */
export function diccionario(idioma: Idioma, espacios: string[] = ESPACIOS_WEB): Diccionario {
  if (idioma === POR_DEFECTO) return {};
  const bloque = bloques[idioma] ?? {};
  const out: Diccionario = {};
  for (const e of [...espacios].reverse()) Object.assign(out, bloque[e] ?? {});
  return out;
}

/** Sustituye {variables} en un texto. */
export const rellenar = (s: string, vars?: Variables) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;

export function traductor(idioma: Idioma, espacios: string[] = ESPACIOS_WEB): Traductor {
  const d = diccionario(idioma, espacios);
  return (es, vars) => rellenar(d[es] ?? es, vars);
}

/** Ruta de la web en un idioma: '/bitacora' → '/en/bitacora'; '/' → '/en/'. */
export function ruta(idioma: Idioma, r: string): string {
  if (idioma === POR_DEFECTO) return r;
  return r === '/' ? `/${idioma}/` : `/${idioma}${r.startsWith('/') ? r : `/${r}`}`;
}

/** Separa el prefijo de idioma de una ruta: '/en/bitacora' → { idioma: 'en', resto: '/bitacora' }. */
export function separarIdioma(pathname: string): { idioma: Idioma; resto: string } {
  const m = pathname.match(/^\/(en)(\/.*)?$/);
  return m ? { idioma: m[1] as Idioma, resto: m[2] && m[2] !== '/' ? m[2] : '/' } : { idioma: POR_DEFECTO, resto: pathname || '/' };
}

/** Formateador de fechas en hora de Madrid para un idioma. */
export const fechas = (idioma: Idioma, opciones: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(LOCALE[idioma], { timeZone: 'Europe/Madrid', ...opciones });
