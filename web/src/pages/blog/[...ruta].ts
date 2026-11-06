import type { APIRoute } from 'astro';

// Las URL de la web Jekyll (/blog/AAAA/MM/DD/slug/) siguen funcionando: redirección 301 a la bitácora.
export const GET: APIRoute = ({ params, redirect }) => {
  const partes = (params.ruta ?? '').split('/').filter(Boolean);
  const slug = partes.at(-1);
  if (!slug || /^\d+$/.test(slug)) return redirect('/bitacora', 301);
  return redirect(`/bitacora/${encodeURIComponent(slug)}`, 301);
};
