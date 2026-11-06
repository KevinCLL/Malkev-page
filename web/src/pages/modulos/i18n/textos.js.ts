import type { APIRoute } from 'astro';
import { idiomaDeModulo, textosDe } from '../../../lib/i18n-modulos';

/**
 * Diccionario de un idioma para los módulos, como script clásico:
 *   window.MALKEVNIA_TEXTOS = { idioma, textos: { comun: {…}, salas: {…}, 'nave-3d': {…} } }
 * Se genera al vuelo desde modulos/i18n/textos.json (no existe en disco) y va antes de
 * i18n.js para que los textos estén listos antes de que el módulo pinte nada.
 */
export const GET: APIRoute = async ({ url }) => {
  const pedido = url.searchParams.get('idioma');
  const idioma = idiomaDeModulo(new URL(`?lang=${pedido ?? ''}`, url));
  const textos = await textosDe(idioma);
  const cuerpo = `window.MALKEVNIA_TEXTOS=${JSON.stringify({ idioma, textos }).replace(/</g, '\\u003c')};\n`;
  return new Response(cuerpo, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};
