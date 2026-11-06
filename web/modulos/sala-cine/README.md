# Sala de proyección · módulo 3D

Sala de cine para La Malkevnia en un módulo ES de Three.js (probado con `three@0.160.0`).

- `sala-cine.js`: el módulo.
- `peliculas-ejemplo.js`: filmoteca **de ejemplo** (`PELIS_EJEMPLO`, 35 pelis de la POC). No es la colección real de Malkev.
- `index.html`: demo independiente (es la que está publicada en https://claude.ai/artifact/WVNW2jCkmFykVyYhcJrjJQ).

Qué hay en la sala: pantalla 2.35:1 con telones, escenario, 3 filas de butacas de terciopelo en gradas con pasillo central, pósters retroiluminados en las paredes laterales, apliques, techo de estrellas de fibra óptica, cabina del proyector con haz de luz y polvo, consola de proyección y cartel «COMPUERTA» sobre la puerta.

Modo **sala** (luces encendidas): la pantalla muestra la ficha «A continuación» de la película elegida.
Modo **proyección**: las luces bajan, se enciende el haz y la pantalla pone una cuenta atrás 3-2-1 y un tráiler generado de 24 s (presentación, paisaje con la frase del cartel, director, cortes rápidos, título con estrellas y cierre). Al acabar pasa a la siguiente película.

## Requisitos

- Importmap con `three` y `three/addons/` (lo usa `RoundedBoxGeometry`). El de la nave ya vale.
- Fuentes Orbitron, Exo 2 y JetBrains Mono cargadas **antes** de `init()` (los pósters y la pantalla se pintan en canvas). Hay fallback si no están.

## Uso

```js
import { init } from './sala-cine.js';
import { PELIS_EJEMPLO } from './peliculas-ejemplo.js';

const sala = init({ scene, films: PELIS_EJEMPLO, origin: new THREE.Vector3(x, 0, z) });
// en el bucle de render:
sala.update(dt);            // dt en segundos
// al salir de la sala o desmontar:
sala.dispose();
```

### `init(opciones)` → `sala`

| opción | por defecto | qué hace |
|---|---|---|
| `scene` | — | si se pasa, añade `sala.group` a la escena |
| `renderer` | — | opcional: solo para ajustar el tamaño de las estrellas del techo a su `pixelRatio` |
| `films` | — | array de películas (ver formato abajo) |
| `origin` | `(0,0,0)` | centro del suelo de la sala en coordenadas del mundo |
| `rotationY` | `0` | giro de la sala. Con 0 la pantalla queda en `-Z` y la puerta en `+Z` |
| `width`, `depth`, `height` | `9`, `7.5`, `3` | tamaño interior en metros |
| `shell` | `true` | construye suelo, paredes y techo. En la nave: `false`, porque ya existen |
| `rows`, `seatsPerSide` | `3`, `4` | máximos; se reducen solos si no caben |
| `autoAdvance` | `true` | al acabar un tráiler pasa a la siguiente peli |
| `roomLights` | igual que `shell` | añade una luz hemisférica y dos puntuales de sala. Las luces de Three afectan a toda la escena, así que en la nave va a `false` y solo queda la luz que refleja la pantalla |
| `reducedMotion` | `prefers-reduced-motion` | sin destellos blancos, rayas, parpadeo ni telones ondeando |
| `maxPosters` | `32` | pósters generados que se guardan a la vez (caché LRU) |
| `sound` | `false` | igual que llamar a `setSound(true)` al crear la sala (el audio espera al primer clic) |
| `onSelect(film, i)` | — | cambia la película elegida. **No** se llama en `init`: la inicial está en `sala.current` |
| `onModeChange(mode)` | — | `'sala'` o `'proyeccion'` |
| `onDim(level)` | — | nivel de luz de 1 (encendida) a 0.05 (proyección), para que el anfitrión baje sus propias luces |

### Formato de película

`{ title, director, year, rating (0-10), color: '#hex', format: '4k'|'bluray'|'dvd', tagline, poster?, trailer? }`

- `creator` se acepta como sinónimo de `director` (es el campo de la POC).
- `poster`: URL de imagen **con CORS**. Si falta, se genera un póster con el color y el título.
- `trailer`: URL de vídeo `.mp4`/`.webm` **con CORS**. Si existe, se proyecta en lugar del tráiler generado. YouTube no sirve (no se puede pintar en una textura).

### API de la instancia

- `update(dt)`, `dispose()`
- `setProjection(bool)`, `toggleProjection()`, `mode` (`'sala'`|`'proyeccion'`)
- `select(i)`, `next()`, `prev()`, `current`, `films`, `state`
- `pagePosters(dir)`: cambia la tanda de pósters de las paredes (hay 6 huecos con la sala por defecto)
- `setSound(bool)`: zumbido del proyector, pitidos de la cuenta atrás y golpe grave en el título (WebAudio, sin ficheros). Llamar desde un clic.
- `pick(raycaster)` y `hover(raycaster)` (solo prueban objetos de la sala, sin paredes: en la nave conviene limitar `raycaster.far` o usarlos solo con el jugador dentro) devuelven `{type:'poster', index, film}`, `{type:'seat', seatIndex, eye}`, `{type:'projector'}`, `{type:'screen'}` o `null`. `hover` además ilumina el póster.
- `colliders`: `[[x0, z0, x1, z1], …]` en el mundo (bloques de butacas, escenario, consola). Mismo formato que `colliders` de la nave.
- `interactions`: `[{x, z, r, label, run}]` en el mundo, compatible con el array `interact` de la nave. `label` es un getter: léelo cada vez. Incluye «Encender/Apagar el proyector» en la consola y «Ver «título»» delante de cada póster.
- `seats`: posición de los ojos de cada butaca (`Vector3`), para sentarse. `bestSeat`: índice de la butaca recomendada (última fila, junto al pasillo).
- `screen`: `{ center, width, height }`.
- `poster(i)`: el canvas del póster de la película `i`.

## Montarla en la nave (`nave-3d/index.html`)

La sala de proyección de la nave es `rb('proyeccion')`: 9 × 7,5 m, pantalla en `z0` y puerta centrada en `z1`, que coincide con la orientación por defecto.

```js
import { init as initCine } from '../modulos/sala-cine/sala-cine.js';
import { PELIS_EJEMPLO } from '../modulos/sala-cine/peliculas-ejemplo.js';

// borrar el bloque actual "// SALA DE PROYECCIÓN" (pantalla, butacas y su interact)
const b = rb('proyeccion');
const cine = initCine({ scene, renderer, shell: false, films: PELIS_EJEMPLO,   // roomLights queda en false
  origin: new THREE.Vector3(b.cx, 0, b.cz), width: b.x1 - b.x0, depth: b.z1 - b.z0, height: H });
cine.colliders.forEach(c => colliders.push(c));
cine.interactions.forEach(i => interact.push(i));   // si el HUD pinta i.label en cada frame, el getter se actualiza solo
// en tick(): cine.update(dt);
// opcional: onDim: (l) => { lucesDeLaSala.forEach(x => x.intensity = base * (0.15 + 0.85 * l)); }
```

## Rendimiento

- El tráiler se pinta a 24 fotogramas por segundo (como el cine), no en cada frame.
- La luz y el haz se tiñen con el color de cada escena sin leer píxeles del canvas; solo con un tráiler en vídeo se mide un canvas de 4×2 px cuatro veces por segundo.
- Butacas con `InstancedMesh` (5 llamadas de dibujo para todas). Solo una luz puntual dentro de la nave.
- Los pósters se generan al verlos y se liberan con la caché LRU.

## Encaje en la nave

Las butacas quedan sobre gradas de 20 cm solo bajo los bloques; los pasillos están a ras de suelo, así que el andar en primera persona de la nave no necesita cambios. Para «sentarse», mover la cámara a `cine.seats[k]` y mirar a `cine.screen.center`.
