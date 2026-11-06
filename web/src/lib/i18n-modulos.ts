import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DIR_MODULOS } from './modulos';
import { esIdioma, POR_DEFECTO, type Idioma } from '../i18n';

/**
 * Idiomas en los módulos de la nave. Cada página HTML de /modulos/ se sirve con el script
 * compartido modulos/i18n/i18n.js al principio (y, en inglés, con su diccionario delante),
 * así que los módulos se traducen sin tocarlos. Ver modulos/i18n/README.md.
 */
const DIR_I18N = join(DIR_MODULOS, 'i18n');
const TEXTOS = join(DIR_I18N, 'textos.json');
const SCRIPT = join(DIR_I18N, 'i18n.js');

/** Idioma pedido a un módulo (?lang=en). */
export const idiomaDeModulo = (url: URL): Idioma => {
  const pedido = url.searchParams.get('lang');
  return esIdioma(pedido) ? pedido : POR_DEFECTO;
};

/** Firma de los ficheros de idiomas (cambia al editarlos): va en el ETag y en el ?v= de los scripts. */
export async function firmaI18n(): Promise<string | null> {
  try {
    const [a, b] = await Promise.all([stat(TEXTOS), stat(SCRIPT)]);
    return `${(a.size + b.size).toString(36)}${Math.floor(Math.max(a.mtimeMs, b.mtimeMs)).toString(36)}`;
  } catch {
    return null;
  }
}

/** Mete los scripts de idiomas al principio de una página de un módulo. */
export function inyectarI18n(html: string, { idioma, modulo, firma }: { idioma: Idioma; modulo: string; firma: string }): string {
  const etiquetas =
    (idioma !== POR_DEFECTO ? `<script src="/modulos/i18n/textos.js?idioma=${idioma}&amp;v=${firma}"></script>` : '') +
    `<script src="/modulos/i18n/i18n.js?v=${firma}" data-modulo="${modulo.replace(/[^a-z0-9-]/g, '')}"></script>`;
  // Tras <meta charset> si va al principio (debe quedar en los primeros 1024 bytes); si no, tras <head>.
  for (const re of [/<meta[^>]+charset[^>]*>/i, /<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i]) {
    const m = re.exec(html);
    if (m && (re.source.startsWith('<meta') ? m.index < 1024 : true)) {
      const fin = m.index + m[0].length;
      return html.slice(0, fin) + etiquetas + html.slice(fin);
    }
  }
  return etiquetas + html;
}

let cache: { firma: string; datos: Record<string, unknown> } | null = null;

/** Traducciones de un idioma (todos los espacios de nombres) leídas de textos.json. */
export async function textosDe(idioma: Idioma): Promise<Record<string, unknown>> {
  if (idioma === POR_DEFECTO) return {};
  const firma = await firmaI18n();
  if (!firma) return {};
  if (cache?.firma !== firma) {
    try {
      cache = { firma, datos: JSON.parse(await readFile(TEXTOS, 'utf8')) };
    } catch (e) {
      console.warn(`[i18n] textos.json ilegible: ${(e as Error).message}`);
      return {};
    }
  }
  const bloque = cache.datos[idioma];
  return bloque && typeof bloque === 'object' ? (bloque as Record<string, unknown>) : {};
}
