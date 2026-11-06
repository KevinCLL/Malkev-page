import type { APIRoute } from 'astro';
import { db, dbViva } from '../../lib/db';

// Comprobación de salud para Docker y el proxy: 200 si la web responde.
export const GET: APIRoute = async () => {
  const baseDeDatos = db ? ((await dbViva()) ? 'ok' : 'caida') : 'sin-configurar';
  return Response.json({ estado: 'ok', baseDeDatos });
};
