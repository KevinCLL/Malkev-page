import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Carpeta con los módulos (copias de /mnt/project-files/modulos). */
export const DIR_MODULOS = resolve(process.env.MODULOS_DIR ?? join(process.cwd(), 'modulos'));

/** ¿Hay un módulo con interfaz propia (index.html) para montar en una sala? */
export function moduloMontable(nombre?: string): boolean {
  if (!nombre || !/^[a-z0-9-]+$/.test(nombre)) return false;
  return existsSync(join(DIR_MODULOS, nombre, 'index.html'));
}
