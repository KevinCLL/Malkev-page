import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NAVE_UNIFICADA, type Sala } from './salas';

/** Carpeta con los módulos (copias de /mnt/project-files/modulos, nave-3d y universo-3d). */
export const DIR_MODULOS = resolve(process.env.MODULOS_DIR ?? join(process.cwd(), 'modulos'));

const SEGURO = /^[a-z0-9-]+$/;
const ENTRADA_SEGURA = /^[a-zA-Z0-9_\-/]+\.html$/;

const existe = (modulo: string, entrada: string) =>
  SEGURO.test(modulo) && ENTRADA_SEGURA.test(entrada) && !entrada.includes('..') && existsSync(join(DIR_MODULOS, modulo, entrada));

/** URL de la página del módulo suelto de una sala, o null si aún no existe. */
export function urlModulo(s: Pick<Sala, 'modulo' | 'entrada'>): string | null {
  const entrada = s.entrada ?? 'index.html';
  return s.modulo && existe(s.modulo, entrada) ? `/modulos/${s.modulo}/${entrada}` : null;
}

export interface Montaje {
  /** Página que se carga en el iframe de la sala. */
  src: string;
  /** true si es la nave unificada (abierta en la sala con su fragmento). */
  unificada: boolean;
}

/** Qué se monta en una sala: la nave unificada si existe y la sala vive en ella; si no, su módulo. */
export function montaje(s: Pick<Sala, 'modulo' | 'entrada' | 'nave'>): Montaje | null {
  if (s.nave !== undefined && existe(NAVE_UNIFICADA, 'index.html')) {
    return { src: `/modulos/${NAVE_UNIFICADA}/index.html${s.nave ? `#${s.nave}` : ''}`, unificada: true };
  }
  const src = urlModulo(s);
  return src ? { src, unificada: false } : null;
}
