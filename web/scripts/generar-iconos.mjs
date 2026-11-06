// Genera los iconos de la web y de la app (PWA) a partir de los SVG de scripts/iconos/.
// Usa sharp, que ya viene con Astro. Los resultados se guardan en public/ y se suben al repo,
// así que solo hace falta volver a lanzarlo si cambia el diseño:
//   npm run iconos
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const raiz = join(import.meta.dirname, '..');
const fuentes = join(import.meta.dirname, 'iconos');
const publico = join(raiz, 'public');
const carpeta = join(publico, 'iconos');
await mkdir(carpeta, { recursive: true });

const maestro = await readFile(join(fuentes, 'icono.svg'), 'utf8');
const pequeno = await readFile(join(fuentes, 'icono-pequeno.svg'), 'utf8');

/** El maestro es a sangre (para "maskable" y Apple); esta versión recorta las esquinas. */
const redondeado = maestro
  .replace('<defs>', '<defs>\n    <clipPath id="esquinas"><rect width="512" height="512" rx="112"/></clipPath>')
  .replace(/(<\/defs>)([\s\S]*)(<\/svg>)/, '$1\n<g clip-path="url(#esquinas)">$2</g>\n$3');

const png = (svg, lado) =>
  sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil((72 * lado) / 512) * 2) })
    .resize(lado, lado)
    .png({ compressionLevel: 9, palette: lado <= 64 })
    .toBuffer();

const guardar = async (ruta, datos) => {
  await writeFile(ruta, datos);
  console.log(`[iconos] ${ruta.replace(raiz + '/', '')} (${(datos.length / 1024).toFixed(1)} KB)`);
};

// --- Favicons
await copyFile(join(fuentes, 'icono-pequeno.svg'), join(publico, 'favicon.svg'));
console.log('[iconos] public/favicon.svg');

/** favicon.ico con 16, 32 y 48 px (entradas PNG dentro del ICO, válido en todos los navegadores). */
const tamanosIco = [16, 32, 48];
const imagenes = await Promise.all(tamanosIco.map((t) => png(pequeno, t)));
const cabecera = Buffer.alloc(6 + 16 * imagenes.length);
cabecera.writeUInt16LE(0, 0);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(imagenes.length, 4);
let desplazamiento = cabecera.length;
imagenes.forEach((img, i) => {
  const o = 6 + 16 * i;
  cabecera.writeUInt8(tamanosIco[i] % 256, o);
  cabecera.writeUInt8(tamanosIco[i] % 256, o + 1);
  cabecera.writeUInt8(0, o + 2);
  cabecera.writeUInt8(0, o + 3);
  cabecera.writeUInt16LE(1, o + 4);
  cabecera.writeUInt16LE(32, o + 6);
  cabecera.writeUInt32LE(img.length, o + 8);
  cabecera.writeUInt32LE(desplazamiento, o + 12);
  desplazamiento += img.length;
});
await guardar(join(publico, 'favicon.ico'), Buffer.concat([cabecera, ...imagenes]));

// --- Apple (iOS redondea las esquinas por su cuenta: va a sangre y sin transparencia)
await guardar(join(publico, 'apple-touch-icon.png'), await png(maestro, 180));

// --- PWA
for (const lado of [192, 512]) {
  await guardar(join(carpeta, `icono-${lado}.png`), await png(redondeado, lado));
  await guardar(join(carpeta, `icono-maskable-${lado}.png`), await png(maestro, lado));
}

// Monocromo (iconos temáticos de Android): solo la silueta de la nave, en blanco.
const silueta = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="rotate(32 256 256)" fill="#fff">
    <path d="M256 84 C268 120 280 190 286 244 L352 330 L352 352 L288 322 L276 334 L236 334 L224 322 L160 352 L160 330 L226 244 C232 190 244 120 256 84 Z"/>
    <path d="M244 344 L268 344 L262 420 L250 420 Z" opacity="0.6"/>
  </g>
</svg>`;
await guardar(join(carpeta, 'icono-monocromo.png'), await png(silueta, 512));

// --- Atajos del menú de la app (manifest.shortcuts), 96 px
const marco = (dibujo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><radialGradient id="f" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#2b1b57"/><stop offset="1" stop-color="#0b0718"/></radialGradient></defs>
  <rect width="512" height="512" rx="112" fill="url(#f)"/>
  ${dibujo}
</svg>`;
const atajos = {
  nave: `<g transform="rotate(32 256 250) translate(256 250) scale(1.15) translate(-256 -225)">
      <path d="M256 84 C268 120 280 190 286 244 L352 330 L352 352 L288 322 L276 334 L236 334 L224 322 L160 352 L160 330 L226 244 C232 190 244 120 256 84 Z" fill="#e9e2ff"/>
      <ellipse cx="256" cy="206" rx="15" ry="32" fill="#7fd6ff"/></g>`,
  bitacora: `<rect x="146" y="104" width="220" height="304" rx="24" fill="none" stroke="#e9e2ff" stroke-width="28"/>
      <path d="M200 196h112M200 256h112M200 316h70" stroke="#b59bff" stroke-width="28" stroke-linecap="round"/>`,
  plano: `<rect x="92" y="146" width="328" height="220" rx="24" fill="none" stroke="#e9e2ff" stroke-width="26"/>
      <path d="M92 256h328M201 146v220M311 146v220" stroke="#b59bff" stroke-width="20"/>
      <circle cx="366" cy="311" r="24" fill="#7fd6ff"/>`,
  ordenador: `<path d="M140 176 L236 256 L140 336" fill="none" stroke="#7fd6ff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M268 344h108" stroke="#e9e2ff" stroke-width="36" stroke-linecap="round"/>`,
};
for (const [nombre, dibujo] of Object.entries(atajos)) {
  await guardar(join(carpeta, `atajo-${nombre}.png`), await png(marco(dibujo), 96));
}
