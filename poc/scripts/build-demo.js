// Construye la demo publicable en dist-demo/: una página HTML con todo el JS y CSS dentro
// y, al lado, la carpeta assets/ con las imágenes y audios que usan las entradas.
import { execSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..')
const OUT = join(ROOT, 'dist-demo')
const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: 'inherit' })

run('node --disable-warning=ExperimentalWarning scripts/export-demo.js')
run('npx vite build --mode demo')

const built = join(OUT, 'assets')
const files = readdirSync(built)
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(built, f), 'utf8'))
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(built, f), 'utf8')).join('\n')
if (js.length !== 1) throw new Error(`Se esperaba un único JS y hay ${js.length}`)

const page = `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Malkevnia POC</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,300..800;1,300..800&family=Orbitron:wght@500..900&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
<style>${css.replace(/<\/style/gi, '<\\/style')}</style>
<div id="app"></div>
<script type="module">${js[0].replace(/<\/script/gi, '<\\/script')}</script>
`
writeFileSync(join(OUT, 'malkevnia-poc.html'), page)

// Assets del blog que referencian las entradas.
const list = JSON.parse(readFileSync(join(ROOT, 'src', 'demo', 'assets.json'), 'utf8'))
for (const f of files) cpSync(join(built, f), join(OUT, '_build', f))
execSync(`rm -rf "${built}"`)
for (const rel of list) {
  const dest = join(built, decodeURI(rel))
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(join(ROOT, '..', 'assets', decodeURI(rel)), dest)
}
console.log(`✦ Demo lista: dist-demo/malkevnia-poc.html (${(page.length / 1e6).toFixed(2)} MB) y ${list.length} ficheros en dist-demo/assets/`)
