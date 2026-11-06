// Copia los módulos que preparan los demás hilos del proyecto (nave 3D, Kallax, cine…)
// desde la carpeta compartida a web/modulos/. Uso:
//   npm run modulos:sync                 # origen por defecto: /mnt/project-files/modulos
//   npm run modulos:sync -- /otra/ruta   # o MODULOS_ORIGEN=/otra/ruta
import { cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const origen = process.argv[2] ?? process.env.MODULOS_ORIGEN ?? '/mnt/project-files/modulos';
const destino = join(import.meta.dirname, '..', 'modulos');

if (!existsSync(origen)) {
  console.error(`[modulos] no existe ${origen}`);
  process.exit(1);
}
for (const nombre of await readdir(origen)) {
  if (!/^[a-z0-9-]+$/.test(nombre) || !(await stat(join(origen, nombre))).isDirectory()) continue;
  await cp(join(origen, nombre), join(destino, nombre), { recursive: true, force: true });
  const tipo = existsSync(join(origen, nombre, 'index.html')) ? 'interfaz' : 'datos';
  console.log(`[modulos] ${nombre} (${tipo})`);
}
