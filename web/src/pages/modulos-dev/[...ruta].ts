import type { APIRoute } from 'astro';
import { GET as servirModulo } from '../modulos/[...ruta]';

// Solo para `npm run dev`: integraciones/modulos-en-desarrollo.mjs reescribe aquí las
// peticiones a /modulos/… para que Vite no las intercepte. En producción no existe.
export const GET: APIRoute = (contexto) =>
  import.meta.env.DEV ? servirModulo(contexto) : new Response('No encontrado', { status: 404 });
