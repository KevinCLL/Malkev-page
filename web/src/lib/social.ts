import type { ImageMetadata } from 'astro';
import type { Idioma } from '../i18n';

/**
 * Imágenes para compartir en redes (Open Graph / Twitter), 1200×630, generadas a partir de
 * la propia nave con `npm run imagenes:sociales` (ver scripts/imagenes-sociales.mjs).
 * Se llaman `<sala>.<idioma>.jpg` en src/assets/social/; Astro las publica con hash en /_astro/.
 */
const imagenes = import.meta.glob<{ default: ImageMetadata }>('../assets/social/*.{jpg,png}', { eager: true });
const porNombre = new Map(
  Object.entries(imagenes).map(([fichero, m]) => [fichero.split('/').pop()!.replace(/\.(jpg|png)$/, ''), m.default]),
);

export interface ImagenSocial {
  src: string;
  ancho?: number;
  alto?: number;
  alt: string;
  tipo?: string;
}

/** Imagen de una sala en un idioma, con plan B: la de la sala en español, la general y, si no hay ninguna, el icono. */
export function imagenSocial(sala: string | undefined, idioma: Idioma, alt: string): ImagenSocial {
  for (const n of [sala && `${sala}.${idioma}`, sala && `${sala}.es`, `malkevnia.${idioma}`, 'malkevnia.es']) {
    const m = n ? porNombre.get(n) : undefined;
    if (m) return { src: m.src, ancho: m.width, alto: m.height, alt, tipo: m.format === 'png' ? 'image/png' : 'image/jpeg' };
  }
  return { src: '/iconos/icono-512.png', ancho: 512, alto: 512, alt, tipo: 'image/png' };
}

/** Capturas para el diálogo de instalación de la app (manifest.screenshots). */
export function capturasApp(): { src: string; sizes: string; type: string; form_factor: 'wide' | 'narrow' }[] {
  return [...porNombre]
    .filter(([n]) => n.startsWith('captura-'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([n, m]) => ({
      src: m.src,
      sizes: `${m.width}x${m.height}`,
      type: m.format === 'png' ? 'image/png' : 'image/jpeg',
      form_factor: n.includes('movil') ? ('narrow' as const) : ('wide' as const),
    }));
}
