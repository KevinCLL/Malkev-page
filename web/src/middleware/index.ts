import { sequence } from 'astro:middleware';
import { cabeceras } from './cabeceras';
import { idioma } from './idioma';

// Cadena de middlewares. Cada pieza en su fichero y aquí solo el orden:
// idioma.ts (rutas /en/, del hilo de PWA, inglés y SEO) va primero para que el resto vea
// ya la ruta reescrita.
export const onRequest = sequence(idioma, cabeceras);
