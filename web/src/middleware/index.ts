import { sequence } from 'astro:middleware';
import { cabeceras } from './cabeceras';

// Cadena de middlewares. Cada pieza en su fichero (p. ej. idioma.ts para /en/, del hilo de
// PWA, inglés y SEO) y aquí solo el orden.
export const onRequest = sequence(cabeceras);
