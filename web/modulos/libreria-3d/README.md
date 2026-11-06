# Librería 3D · módulo para La Malkevnia

Estanterías 3D con la biblioteca real de Malkev (127 libros de Goodreads y 100 series de manga de AniList, sacados del export de la POC). Cada lomo se genera en un canvas con el color dominante de su portada, el título y el apellido del autor. Al tocar un lomo, el libro sale de la estantería, flota delante de la cámara enseñando la portada y aparece una ficha.

Demo publicada: https://claude.ai/artifact/FHe2J8MnSAThPQmXCYhD9b

## Ficheros

| Fichero | Qué es |
|---|---|
| `libreria-3d.js` | El módulo. Solo importa `three` (usa el import map de la página, probado con three@0.160.0 como la nave). |
| `libreria-datos.js` | `LIBROS` (227 entradas) y `ATLAS` (`{cols:16, rows:15, cellW:128, cellH:192}`). Datos reales, no de ejemplo. |
| `portadas.jpg` | Atlas de las 227 portadas (2048×2880, 1,7 MB). Va en local porque el CSP de los Artifacts bloquea imágenes de Goodreads/AniList y porque WebGL necesita CORS. |
| `index.html` | La sala de demo (suelo, pared, ojo de buey, sillón, OrbitControls, bloom). |
| `build.py` | Regenera datos y atlas desde `poc/coleccion.json` (rama `claude/project-thread-6obski`). |

Las fuentes que usa el canvas de los lomos son las de la nave: Orbitron, Exo 2 y JetBrains Mono (Google Fonts). Si no están cargadas usa las de sistema y repinta al cargarlas.

## Uso

```js
import { crearLibreria } from './modulos/libreria-3d/libreria-3d.js';
import { LIBROS, ATLAS } from './modulos/libreria-3d/libreria-datos.js';

const lib = crearLibreria({
  libros: LIBROS, atlas: ATLAS,
  atlasUrl: './modulos/libreria-3d/portadas.jpg',
  contenedor: document.body,        // opcional: monta la ficha HTML propia
  onSelect: libro => {},            // libro o null al cerrar
  onHover: libro => {},
  luces: true,                      // 1 PointLight suave por módulo de estantería
});
lib.init({ scene, camera, renderer });     // añade lib.group a la escena
lib.group.position.set(x, 0, z);           // el suelo está en y = 0; los lomos miran a +z
lib.group.rotation.y = ...;

// en el bucle
lib.update(dt);                            // dt en segundos

// al salir de la sala
lib.dispose();                             // quita listeners, ficha, geometrías y texturas
```

## API

`crearLibreria(opciones)` devuelve:

- `group`: `THREE.Group` con todo el mueble. Mide `dimensiones` (`{ancho ≈ 2,88 m, alto ≈ 2,36 m, fondo 0,30 m}`), centrado en x, apoyado en y = 0 y con el frente hacia +z.
- `init({ scene, camera, renderer, domElement, contenedor, eventos = true })`: mete el grupo en la escena y escucha clics y hover sobre el canvas. **En la nave con pointer lock pasa `eventos: false`** y usa `usar()` con el raycaster del punto de mira.
- `update(dt)`: anima libros (salir al pasar por encima, flotar delante de la cámara, volver a su sitio), filtros y luces.
- `pick(raycaster)`: devuelve el libro bajo el raycaster o `null`, sin abrirlo (para mostrar «E · Leer» en el HUD).
- `usar(raycaster)`: igual, pero lo abre; si ya estaba abierto lo devuelve a la estantería.
- `abrir(id)` / `cerrar()`: abre un libro por id o lo devuelve. `Escape` también cierra.
- `filtrar({ tipo: 'todos'|'libro'|'manga', estado: 'todos'|'leido'|'leyendo'|'pendiente', texto })`: apaga los que no coinciden y adelanta un poco los que sí. Devuelve cuántos coinciden.
- `abierto`: el libro abierto o `null`.
- `dispose()`.

Forma de cada libro en `LIBROS`: `{ id, tipo: 'libro'|'manga', titulo, autor, anio, nota, estado, color, portada, serie?, paginas?, capitulosLeidos?, capitulos?, origen?, tituloOriginal?, goodreads?, anilist? }`. `portada` es el índice en el atlas.

## Notas para montarlo en la nave

- Si la nave ya tiene su panel de fichas, no pases `contenedor` y pinta tu panel con `onSelect`.
- La cámara tiene que tener `near` < 0,5, porque el libro abierto flota a 0,55 m delante de ella.
- Son ~230 mallas con 3 materiales compartidos. Los lomos van en un único canvas de 2048×4096.
