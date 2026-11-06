// Copia los módulos que preparan los demás hilos del proyecto (nave 3D, Kallax, cine…)
// desde la carpeta compartida a web/modulos/. También trae nave-3d y universo-3d, que viven
// al lado de modulos/ en la carpeta del proyecto. Uso:
//   npm run modulos:sync                 # origen por defecto: /mnt/project-files/modulos
//   npm run modulos:sync -- /otra/ruta   # o MODULOS_ORIGEN=/otra/ruta
import { cp, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const origen = process.argv[2] ?? process.env.MODULOS_ORIGEN ?? '/mnt/project-files/modulos';
const destino = join(import.meta.dirname, '..', 'modulos');

if (!existsSync(origen)) {
  console.error(`[modulos] no existe ${origen}`);
  process.exit(1);
}
// Lo que no hace falta para servir los módulos: capturas del README y scripts de generación.
const SOBRA = /(^|[\\/])(capturas|__pycache__|node_modules)([\\/]|$)|captura[^\\/]*\.(png|jpe?g|webp)$|\.(py|rb|pyc)$/i;

const carpetas = (await readdir(origen)).map((n) => join(origen, n));
for (const hermana of ['nave-3d', 'universo-3d']) carpetas.push(join(origen, '..', hermana));

for (const dir of carpetas) {
  const nombre = basename(dir);
  if (!/^[a-z0-9-]+$/.test(nombre) || !existsSync(dir) || !(await stat(dir)).isDirectory()) continue;
  // Espejo: lo que se borró en el origen también desaparece de web/modulos/<nombre>.
  await rm(join(destino, nombre), { recursive: true, force: true });
  await cp(dir, join(destino, nombre), { recursive: true, filter: (f) => !SOBRA.test(f.slice(dir.length)) });
  console.log(`[modulos] ${nombre}`);
}
