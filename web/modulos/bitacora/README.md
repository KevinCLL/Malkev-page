# Bitácora del capitán · módulo para La Malkevnia

El blog de malkevnia.com convertido en holopaneles dentro de la nave. Un módulo ES sin dependencias (`bitacora.js`) más los datos (`posts.json`).

## Archivos

| Archivo | Qué es |
|---|---|
| `bitacora.js` | Módulo ES. No importa Three.js: recibe tu `THREE`, así comparte instancia con la nave (probado con three@0.160.0). |
| `posts.json` | Export de las **100 entradas publicadas** de `KevinCLL/Malkev-page/_posts` (las 35 con `published: false` se excluyen). HTML ya renderizado, rutas `/assets/...` reescritas a `https://malkevnia.com/...`. Más recientes primero. ~870 KB. |
| `demo/index.html` | Sala de demostración (la del Artifact). Espera `bitacora.js` y `posts.json` en su misma carpeta. |
| `export.py` | Regenera `posts.json`: `python3 export.py <ruta>/_posts posts.json` (necesita `markdown` y `pyyaml`). |

## Formato de un post

```js
{ id: "bienvenida",                 // slug, sirve de ancla (#bienvenida)
  n: 98,                            // nº de entrada (1 = la más antigua); lo añade loadPosts()
  title, description, tags: [],
  date: "2026-05-21", datetime: "2026-05-21 10:00:00 +0200", year: 2026,
  url: "https://malkevnia.com/blog/2026/05/21/bienvenida/",
  cover: "https://malkevnia.com/assets/...jpg" | null,
  words, readingMinutes, html }
```

## API

```js
import { loadPosts, createHoloWall, createReader, createBrowser, mountBitacora,
         filterPosts, yearsOf, tagsOf, drawPanelCanvas, formatDate, PALETTE } from './bitacora.js';
```

### `loadPosts(src = './posts.json') → Promise<Post[]>`
Acepta una URL, el objeto del JSON o un array. Ordena de más reciente a más antigua y añade `n`.

### `createHoloWall(THREE, opts) → wall`
Arco de holopaneles (texturas canvas) orientados hacia el centro del grupo. Coloca `wall.group` donde quieras que esté el centro del arco, a la altura del suelo; quien mira debe estar cerca de ese centro.

| opción | por defecto | |
|---|---|---|
| `posts` | `[]` | lista a mostrar (ya filtrada si quieres) |
| `radius` | `3.4` | radio del arco en metros |
| `rows` / `perRow` | `2` / `12` | paneles por página = rows × perRow |
| `spacing` | `0.44` | separación angular (rad); súbela si subes `panelWidth` |
| `panelWidth` | `1.3` | alto = ancho × 0.625 |
| `baseY` / `rowGap` | `1.05` / `0.95` | altura de la fila inferior y separación entre filas |
| `color` / `accent` | ámbar `0xffc27a` / violeta `0xb59bff` | ámbar = color de la sala Bitácora en la nave |
| `emitter` | `true` | anillo en el suelo y haces de luz |
| `reducedMotion` | según `prefers-reduced-motion` | sin parpadeo ni balanceo |

Métodos: `update(t, dt)` en tu bucle · `pick(raycaster) → post|null` · `hover(post|null)` · `spin(dRad)` (inercia, con límites) · `focus(post)` (cambia de página y gira hasta tenerlo delante) · `setPosts(list)` · `setPage(i)`, `nextPage()`, `prevPage()`, `page`, `pages` · `dispose()`.

Los materiales usan `toneMapped:false` y `depthWrite:false`; con el bloom de la nave conviene un `threshold` ≥ 0.6 para que el texto no se emborrone.

### `createReader({ posts, container?, embeds?, onOpen?, onClose? }) → reader`
Lector a pantalla completa (DOM, `z-index:60`). `open(idOPost)`, `close()`, `next()`, `prev()`, `isOpen`, `current`, `destroy()`. Esc cierra, ← → cambian de entrada, el foco queda atrapado dentro. Los enlaces entre entradas se abren en el propio lector. `embeds: 'link'` (por defecto) cambia vídeos de YouTube/Vimeo y audios por enlaces; `'native'` los deja embebidos (úsalo cuando la web viva en malkevnia.com). Si una imagen no carga, se sustituye por un enlace.

**Importante en la nave:** mientras `reader.isOpen` sea `true`, suelta el pointer lock y pausa el movimiento del jugador; al cerrarse (`onClose`) vuelve a pedirlo.

### `createBrowser({ posts, container, onSelect?, onFilter?, filter?, maxTags? }) → browser`
Índice con búsqueda (sin acentos ni mayúsculas), años y etiquetas. `onFilter(list, filter)` se llama al cambiar filtros: pásale `list` a `wall.setPosts()`. Métodos: `filtered`, `filter`, `setFilter({year, tag, q})`, `setCurrent(id)`, `focusSearch()`, `destroy()`.

### `mountBitacora(container, { posts })`
Índice + lector juntos, sin 3D (para una consola, el ordenador de a bordo o móviles sin WebGL).

### Utilidades
`filterPosts(posts, {year, tag, q})`, `yearsOf(posts)`, `tagsOf(posts)`, `formatDate(iso, long?)`, `drawPanelCanvas(post, {w, h, color, accent})` → `<canvas>` para usar la cara de un panel en otra superficie (p. ej. el monitor del escritorio).

## Montarlo en la sala Bitácora de la nave

```js
import { loadPosts, createHoloWall, createReader } from './modulos/bitacora/bitacora.js';

const posts = await loadPosts('./modulos/bitacora/posts.json');
await document.fonts.load('600 40px "Exo 2"');           // antes de pintar los paneles
const b = rb('bitacora');                                 // sala 5×4 en el plano de la nave
const wall = createHoloWall(THREE, { posts, radius: 1.7, rows: 2, perRow: 6, spacing: 0.62, panelWidth: 0.95, baseY: 1.0, rowGap: 0.7 });
wall.group.position.set(b.cx, 0, b.cz + 0.6);             // centro del arco = donde se planta el jugador
scene.add(wall.group);
anim.push((t) => wall.update(t, 1 / 60));

const reader = createReader({ posts, onOpen: () => document.exitPointerLock(), onClose: () => canvas.requestPointerLock() });
interact.push({ x: b.cx, z: b.cz + 0.6, r: 1.6, label: 'Leer el holopanel', run: () => {
  ray.setFromCamera({ x: 0, y: 0 }, camera);              // lo que hay bajo la mirilla
  const p = wall.pick(ray) || posts[0];
  wall.focus(p); reader.open(p);
}});
// Rueda o Q/E dentro de la sala: wall.spin(±0.04); PgUp/PgDn: wall.prevPage()/nextPage()
```

Fuentes que usa el canvas (cárgalas en la página): Exo 2 (300, 600), JetBrains Mono (500, 600). El lector usa también Orbitron si está.
