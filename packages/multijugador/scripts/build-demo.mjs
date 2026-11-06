// Empaqueta demo/index.html en un único HTML autocontenido (dist/demo.html)
// metiendo los módulos locales en línea. Three.js sigue viniendo del CDN.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = resolve(root, 'demo');
const IMPORT_RE = /^import\s+(.+?)\s+from\s+'(\.{1,2}\/[^']+)';\s*$/gm;

const modules = new Map(); // abs path -> { varName, code }
let seq = 0;

function bindings(clause, varName) {
  const named = clause.match(/\{([^}]*)\}/);
  if (!named) throw new Error(`import no soportado: ${clause}`);
  const parts = named[1].split(',').map((s) => s.trim()).filter(Boolean)
    .map((s) => s.replace(/\s+as\s+/, ': '));
  return `const { ${parts.join(', ')} } = ${varName};`;
}

function load(file) {
  if (modules.has(file)) return modules.get(file).varName;
  let src = readFileSync(file, 'utf8');
  src = src.replace(IMPORT_RE, (_, clause, spec) => bindings(clause, load(resolve(dirname(file), spec))));
  const exported = [];
  src = src.replace(/^export default .*$/m, '');
  src = src.replace(/^export (async function|function|const|let|class) (\w+)/gm, (_, kw, name) => {
    exported.push(name);
    return `${kw} ${name}`;
  });
  const varName = `__m${seq++}`;
  const code = `// ---- ${relative(root, file)} ----\nconst ${varName} = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
  modules.set(file, { varName, code });
  return varName;
}

let html = readFileSync(resolve(demoDir, 'index.html'), 'utf8');
html = html.replace(/(<script type="module">)([\s\S]*?)(<\/script>)/, (_, open, body, close) => {
  const THREE_IMPORT = "import * as THREE from 'three';\n";
  const main = body.replace(THREE_IMPORT, '').replace(IMPORT_RE, (__, clause, spec) => bindings(clause, load(resolve(demoDir, spec))));
  const inlined = [...modules.values()].map((m) => m.code).join('\n');
  return `${open}\n${THREE_IMPORT}${inlined}\n${main}${close}`;
});
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/demo.html'), html);
console.log('dist/demo.html', (html.length / 1024).toFixed(1), 'KB');
