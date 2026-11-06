import { defineMiddleware } from 'astro:middleware';

/**
 * Cabeceras de seguridad para todas las respuestas de Astro (los ficheros estáticos de
 * dist/client los sirve el adaptador sin pasar por aquí).
 * - frame-ancestors 'self': solo nuestras propias salas pueden meter la web en un iframe
 *   (los módulos se montan así), nadie de fuera.
 */
const CABECERAS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const cabeceras = defineMiddleware(async (_ctx, next) => {
  const res = await next();
  try {
    for (const [k, v] of Object.entries(CABECERAS)) res.headers.set(k, v);
    return res;
  } catch {
    // Algunas respuestas (p. ej. Response.redirect) traen cabeceras inmutables: se copian.
    const copia = new Response(res.body, res);
    for (const [k, v] of Object.entries(CABECERAS)) copia.headers.set(k, v);
    return copia;
  }
});
