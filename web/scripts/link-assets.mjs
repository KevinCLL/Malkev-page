// En desarrollo, enlaza ../assets (imágenes, audio y PDF de la web Jekyll) en public/assets
// para que los posts antiguos vean sus imágenes. En Docker se copian directamente.
import { existsSync, symlinkSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const origen = join(import.meta.dirname, '..', '..', 'assets');
const destino = join(import.meta.dirname, '..', 'public', 'assets');
let yaExiste = false;
try { lstatSync(destino); yaExiste = true; } catch {}
if (!yaExiste && existsSync(origen)) {
  symlinkSync(origen, destino, 'junction');
  console.log('[assets] enlazado public/assets → ../assets');
}
