import type { APIRoute } from 'astro';
import { db, dbViva } from '../../lib/db';
import { catalogoVivo, hayCatalogo } from '../../lib/bitacora';

// Comprobación de salud para Docker y el proxy: siempre 200 si la web responde, con el
// estado de lo que hay detrás (una caída de la BDD o del catálogo no tumba la web: tira
// de su plan B, así que no debe reiniciar el contenedor).
export const GET: APIRoute = async () => {
  const [baseDeDatos, catalogo] = await Promise.all([
    db ? dbViva().then((ok) => (ok ? 'ok' : 'caida')) : 'sin-configurar',
    hayCatalogo ? catalogoVivo().then((ok) => (ok ? 'ok' : 'caido')) : 'sin-configurar',
  ]);
  return Response.json({ estado: 'ok', baseDeDatos, catalogo }, { headers: { 'Cache-Control': 'no-store' } });
};
