# Ordenador de a bordo · módulo

Terminal retro (look CRT, fósforo púrpura) de La Malkevnia. Se dibuja **entera en un `<canvas>` 2D**, así que sirve igual como página normal o como textura de una pantalla dentro de la nave 3D. Sin dependencias.

| Fichero | Qué es |
|---|---|
| `ordenador-abordo.js` | El módulo ES (`init`, `ROOMS`, `PLANETS`). ~35 KB. |
| `datos-malkevnia.js` | Datos reales: 270 juegos/libros de rol de las Kallax (de `kallax-inventario.md`) y las 135 entradas de la bitácora (de `_posts/`). ~95 KB. Opcional. |
| `demo.html` | Plantilla de la demo; `build.py` la convierte en un único HTML (`ordenador-de-a-bordo.html`). |
| `ordenador-de-a-bordo.html` | La demo autocontenida (la misma que el Artifact). |

## Uso rápido (página normal)

```js
import { init } from './ordenador-abordo.js';
import datos from './datos-malkevnia.js';

const term = init(document.getElementById('pantalla'), {
  data: datos,                                // { games, posts, rooms?, planets? }
  onNavigate(id, sala) { /* llevar al jugador a la sala */ },
});
// más tarde
term.dispose();
```

El contenedor necesita tamaño (alto y ancho). El módulo mete dentro un `<canvas>` y un `<textarea>` invisible encima que recoge el teclado (incluidas tildes y teclas muertas del teclado español, y el teclado del móvil al tocar la pantalla).

Fuente: usa `VT323` si la página la carga (Google Fonts: `family=VT323`); si no, cae a una monoespaciada del sistema. Se re-mide sola cuando la fuente termina de cargar.

## Uso como textura en la nave 3D (modo headless)

```js
const term = init(null, {
  headless: true, width: 1024, height: 640,   // píxeles del canvas
  data: datos, room: 'ordenador',
  onRender: () => { tex.needsUpdate = true; },  // se llama tras cada repintado
  onNavigate: (id) => teleportTo(id),
});
const tex = new THREE.CanvasTexture(term.canvas);
tex.colorSpace = THREE.SRGBColorSpace;
pantalla.material.map = tex;

// cuando el jugador "se sienta" en la consola:
term.focus();
addEventListener('keydown', (e) => { if (sentado && term.key(e)) e.preventDefault(); });
// al levantarse: term.blur();
```

- En headless no hay DOM propio: el anfitrión reenvía los `KeyboardEvent` con `term.key(e)` (devuelve `true` si lo ha usado). Las teclas muertas (´ + a) llegan como `e.key === 'Dead'` y se ignoran; para tildes en headless conviene usar un `<input>` propio y pasar el texto con `term.type(texto)`.
- El canvas se repinta a ~30 fps mientras hay efectos (`effects: true`, por defecto). Con `effects: false` solo se repinta cuando cambia algo o parpadea el cursor (ideal para la textura). `onRender` solo se llama cuando de verdad ha repintado.
- La curvatura CRT no se dibuja (el canvas es plano): si se quiere, que la ponga la geometría de la pantalla.

## Opciones de `init(container, opciones)`

| Opción | Por defecto | Qué hace |
|---|---|---|
| `data.games` | `[]` | `[{ n: nombre, d: 'Kallax 1 · fila 2, columna 3', p?: pósit, j?: pegatina }]` |
| `data.posts` | `[]` | `[{ f: 'AAAA-MM-DD', t: título, u: '/blog/…/', r: extracto, g?: [tags] }]`. Se numeran por fecha (#1 la más antigua). |
| `data.rooms` | las 9 salas de `nave-3d` | `[{ id, name, sub, alias?: [] }]`. Los `id` coinciden con `ROOMS` de la nave 3D. |
| `data.planets` | Thalassa, Gélida, Izaro, Brasa Menor | `[{ id, name, sub }]` para `rumbo`. |
| `headless` | `false` (o `true` si `container` es `null`) | Modo textura. |
| `width`, `height` | 1024 × 640 | Solo headless: tamaño del canvas. |
| `fontSize` | auto | px (en headless, `height / 26`). |
| `font` | `"VT323", "IBM Plex Mono", …, monospace` | Pila de fuentes. |
| `theme` | `'purpura'` | `purpura`, `ambar`, `verde`, `cian`. |
| `room` | `'ordenador'` | Sala inicial (sale en el prompt). |
| `captain` | `'Malkev'` | Nombre del capitán. |
| `baseUrl` | `'https://malkevnia.com'` | Prefijo de los enlaces de la bitácora. |
| `effects` | `true` | Brillo, scanlines, viñeta, banda y parpadeo. |
| `fps` | `30` | Tope de repintado con efectos. |
| `boot` | `true` | Secuencia de arranque animada. |
| `autofocus` | `true` | Solo en DOM. |
| `canvas` | uno nuevo | Pasa tu propio canvas si quieres. |
| `commands` | `{}` | Órdenes extra: `{ nombre: { run(args, { print, raw, state, navigate }) } }`. |
| `onNavigate(id, sala)` | — | Al terminar `ir <sala>`. |
| `onCourse(id, planeta)` | — | Al fijar `rumbo <planeta>`. |
| `onOpenUrl(url, post)` | `window.open` | Orden `abrir`. |
| `onCommand(nombre, args)` | — | Tras cada orden conocida (para sonidos, logros…). |
| `onTheme(tema)` | — | Al cambiar de tema. |
| `onRender(canvas)` | — | Tras cada repintado. |

## API devuelta

| Miembro | Qué hace |
|---|---|
| `canvas` | El canvas donde pinta. |
| `exec(orden)` | Ejecuta una orden como si se escribiera. |
| `print(texto)` | Escribe en pantalla. Admite color: `{a}acento{/}`, `{d}` tenue, `{w}` aviso, `{o}` ok, `{e}` error, `{l}` enlace. |
| `key(evento)` | Headless: procesa un `KeyboardEvent` (o `{ key, ctrlKey }`). Devuelve `true` si lo usó. |
| `type(texto)` | Inserta texto en la línea de entrada. |
| `focus()` / `blur()` | Cursor relleno o hueco. |
| `resize(w, h)` | Headless: cambia el tamaño. En DOM se ajusta solo con `ResizeObserver`. |
| `setRoom(id)` | Avisa de que el jugador ha cambiado de sala por su cuenta. |
| `setTheme(tema)` | Cambia el fósforo. |
| `room`, `theme`, `version` | Solo lectura. |
| `dispose()` | Para el bucle, quita listeners y elimina canvas/textarea. |

## Órdenes

`ayuda [orden]`, `salas`, `ir <sala>` (vale `ir cine`, `ir kallax`, o escribir solo `cine`), `dónde [juego]`, `buscar <texto>`, `juegos [texto]`, `sugerir [jugadores]`, `bitácora [página|texto]`, `leer <número|texto>`, `abrir`, `estado`, `rumbo [planeta]`, `fecha`, `tripulación`, `tirar [NdM]`, `tema [nombre]`, `historial`, `limpiar`, `reiniciar`, `eco`, `acerca`.

Teclas: Tab completa (órdenes, salas, planetas, temas, juegos), ↑↓ historial, RePág/AvPág o rueda para desplazar, Esc borra la línea o salta la animación, Ctrl+L limpia, Ctrl+C cancela.

Huevos de pascua (no salen en la ayuda): `hola`, `sudo`, `xyzzy`, `42`, `salir`, `rm`, `café`, `gato`, `ping`, `música`, `abre las compuertas`, `autodestrucción`, `matrix`, `gracias`, `dormir`.

## Regenerar

`python3 build.py` vuelve a montar `ordenador-de-a-bordo.html` a partir de `ordenador-abordo.js`, `datos-malkevnia.js` y `demo.html`. Los datos se generaron desde `kallax-inventario.md` y `_posts/` del repo; si cambian, hay que volver a generarlos.
