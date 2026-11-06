import { defineMiddleware } from 'astro:middleware';
import { separarIdioma } from '../i18n';

/**
 * Inglés bajo /en/: no hay páginas duplicadas. Una petición a /en/bitacora se reescribe a
 * /bitacora con `locals.idioma = 'en'`, y cada página pinta sus textos en ese idioma.
 * Lo que no depende del idioma (módulos, API, RSS, sitemap, service worker…) no tiene
 * versión /en/: se redirige a su ruta de siempre.
 */
const SIN_IDIOMA = /^\/(?:modulos|api|admin|_astro|_image|iconos|assets)(?:\/|$)|^\/(?:feed\.xml|sitemap\.xml|sw\.js|robots\.txt|favicon\.(?:ico|svg)|apple-touch-icon\.png)$/;

export const idioma = defineMiddleware((ctx, next) => {
  const { idioma, resto } = separarIdioma(ctx.url.pathname);
  ctx.locals.idioma = idioma;
  if (idioma === 'es') return next();
  if (SIN_IDIOMA.test(resto)) return ctx.redirect(resto + ctx.url.search, 301);
  return next(new URL(resto + ctx.url.search, ctx.url));
});
