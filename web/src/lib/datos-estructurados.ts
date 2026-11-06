/**
 * Datos estructurados (schema.org en JSON-LD) para que los buscadores entiendan la web:
 * el sitio, su autor, la bitácora como blog y cada entrada como artículo.
 */
import { IDIOMAS, ruta, type Idioma } from '../i18n';
import type { Entrada } from './bitacora';

type Nodo = Record<string, unknown>;

const url = (site: URL, r: string) => new URL(r, site).href;

/** El capitán. */
export const persona = (site: URL): Nodo => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  '@id': url(site, '/#malkev'),
  name: 'Malkev',
  url: url(site, '/'),
});

export const sitioWeb = (site: URL, idioma: Idioma, descripcion: string): Nodo => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': url(site, '/#web'),
  name: 'La Malkevnia',
  alternateName: 'Malkevnia',
  url: url(site, ruta(idioma, '/')),
  description: descripcion,
  inLanguage: [...IDIOMAS],
  publisher: { '@id': url(site, '/#malkev') },
});

export const blog = (site: URL, idioma: Idioma, nombre: string, descripcion: string, entradas: Entrada[]): Nodo => ({
  '@context': 'https://schema.org',
  '@type': 'Blog',
  '@id': url(site, '/bitacora#blog'),
  name: nombre,
  description: descripcion,
  url: url(site, ruta(idioma, '/bitacora')),
  // Las entradas están escritas en español aunque la interfaz esté en inglés.
  inLanguage: 'es',
  author: { '@id': url(site, '/#malkev') },
  isPartOf: { '@id': url(site, '/#web') },
  blogPost: entradas.slice(0, 20).map((e) => ({
    '@type': 'BlogPosting',
    headline: e.titulo,
    url: url(site, `/bitacora/${e.slug}`),
    datePublished: e.fecha.toISOString(),
  })),
});

export const articulo = (site: URL, e: Entrada, imagen: string): Nodo => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  '@id': url(site, `/bitacora/${e.slug}#entrada`),
  mainEntityOfPage: url(site, `/bitacora/${e.slug}`),
  url: url(site, `/bitacora/${e.slug}`),
  headline: e.titulo,
  ...(e.descripcion ? { description: e.descripcion } : {}),
  image: [url(site, imagen)],
  datePublished: e.fecha.toISOString(),
  dateModified: e.fecha.toISOString(),
  inLanguage: 'es',
  ...(e.etiquetas.length ? { keywords: e.etiquetas.join(', ') } : {}),
  ...(e.minutos ? { timeRequired: `PT${e.minutos}M` } : {}),
  author: { '@type': 'Person', '@id': url(site, '/#malkev'), name: 'Malkev', url: url(site, '/') },
  publisher: { '@type': 'Person', '@id': url(site, '/#malkev'), name: 'Malkev' },
  isPartOf: { '@id': url(site, '/bitacora#blog') },
});

/** Migas de pan: [['La Malkevnia', '/'], ['Bitácora', '/bitacora'], …]. */
export const migas = (site: URL, pasos: [string, string][]): Nodo => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: pasos.map(([nombre, r], i) => ({ '@type': 'ListItem', position: i + 1, name: nombre, item: url(site, r) })),
});
