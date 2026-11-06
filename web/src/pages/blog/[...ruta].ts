import type { APIRoute } from 'astro';
import { resolverUrlAntigua } from '../../lib/bitacora';

// Las URL de la web Jekyll (/blog/AAAA/MM/DD/slug/) siguen funcionando: redirección 301 a la bitácora.
export const GET: APIRoute = async ({ url, redirect }) => {
  const slug = await resolverUrlAntigua(url.pathname);
  return redirect(slug ? `/bitacora/${encodeURIComponent(slug)}` : '/bitacora', 301);
};
