// Comprueba modulos/i18n/textos.json: que sea válido, que cada traducción conserve sus
// {variables} y que todos los textos de la web (t('…') en src/ y las salas) tengan inglés.
//   npm run textos:comprobar            # falla si falta algo
//   npm run textos:comprobar -- --lista # además, imprime lo que falta como JSON para pegar
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const ficheroTextos = join(raiz, 'modulos', 'i18n', 'textos.json');
const datos = JSON.parse(await readFile(ficheroTextos, 'utf8'));
const errores = [];

// --- estructura y {variables}
const variables = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const idioma of datos.idiomas ?? []) {
  if (idioma === datos.origen) continue;
  for (const [espacio, d] of Object.entries(datos[idioma] ?? {})) {
    if (typeof d !== 'object' || Array.isArray(d)) { errores.push(`${idioma}.${espacio} no es un objeto`); continue; }
    for (const [es, tr] of Object.entries(d)) {
      if (es.startsWith('$')) continue;
      if (typeof tr !== 'string') errores.push(`${idioma}.${espacio}: «${es}» no es un texto`);
      else if (variables(es) !== variables(tr)) errores.push(`${idioma}.${espacio}: «${es}» y «${tr}» no tienen las mismas {variables}`);
    }
  }
}

// --- textos de la web
async function ficheros(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await ficheros(f)));
    else if (/\.(astro|ts|vue)$/.test(e.name)) out.push(f);
  }
  return out;
}
const espaciosDe = (f) => (f.endsWith('Terminal.vue') ? ['terminal', 'comun'] : f.endsWith('Comentarios.vue') ? ['comentarios', 'comun'] : ['web', 'salas', 'comun']);
const faltan = new Map();
for (const f of await ficheros(join(raiz, 'src'))) {
  const codigo = await readFile(f, 'utf8');
  const usados = [...codigo.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => m[2].replace(/\\(.)/g, '$1'));
  if (f.endsWith('salas.ts')) usados.push(...[...codigo.matchAll(/\b(?:nombre|resumen|cubierta): '((?:\\.|[^'])*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1')));
  for (const es of usados) {
    for (const idioma of datos.idiomas ?? []) {
      if (idioma === datos.origen) continue;
      const bloque = datos[idioma] ?? {};
      if (espaciosDe(f).some((e) => typeof bloque[e]?.[es] === 'string')) continue;
      const espacio = espaciosDe(f)[0] === 'web' && f.endsWith('salas.ts') ? 'salas' : espaciosDe(f)[0];
      faltan.set(`${idioma}|${espacio}|${es}`, relative(raiz, f));
    }
  }
}
for (const [clave, f] of faltan) {
  const [idioma, espacio, es] = clave.split('|');
  errores.push(`falta ${idioma}.${espacio}: «${es}» (${f})`);
}

if (process.argv.includes('--lista') && faltan.size) {
  const porEspacio = {};
  for (const clave of faltan.keys()) {
    const [, espacio, es] = clave.split('|');
    (porEspacio[espacio] ??= {})[es] = '';
  }
  console.log(JSON.stringify(porEspacio, null, 2));
}
if (errores.length) {
  console.error(errores.map((e) => `✗ ${e}`).join('\n'));
  console.error(`\n${errores.length} problema(s) en modulos/i18n/textos.json`);
  process.exit(1);
}
const total = Object.values(datos).filter((v) => typeof v === 'object' && !Array.isArray(v)).reduce((n, b) => n + Object.values(b).reduce((m, d) => m + Object.keys(d).length, 0), 0);
console.log(`✓ textos.json correcto (${total} traducciones) y la web no tiene textos sin traducir.`);
