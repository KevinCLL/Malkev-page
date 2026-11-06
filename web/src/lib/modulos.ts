import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Sala } from './salas';

/** Carpeta con los módulos (copias de /mnt/project-files/modulos, nave-3d y universo-3d). */
export const DIR_MODULOS = resolve(process.env.MODULOS_DIR ?? join(process.cwd(), 'modulos'));

const SEGURO = /^[a-z0-9-]+$/;
const ENTRADA_SEGURA = /^[a-zA-Z0-9_\-/]+\.html$/;

/** URL de la página del módulo de una sala, o null si aún no existe. */
export function urlModulo(s: Pick<Sala, 'modulo' | 'entrada'>): string | null {
  const entrada = s.entrada ?? 'index.html';
  if (!s.modulo || !SEGURO.test(s.modulo) || !ENTRADA_SEGURA.test(entrada) || entrada.includes('..')) return null;
  return existsSync(join(DIR_MODULOS, s.modulo, entrada)) ? `/modulos/${s.modulo}/${entrada}` : null;
}
