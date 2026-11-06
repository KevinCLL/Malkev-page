# Planetas temáticos por hobby

Cada planeta de la travesía de la Malkevnia guarda el "museo" de un hobby. Al aterrizar se ve una escena de superficie con 4 hitos (landmarks) que se pueden tocar, cada uno con su texto.

- `planetas-hobby.js`: el módulo (ES module, autocontenido salvo three.js).
- `index.html`: la demo (selector orbital + superficie con HUD). Publicada en https://claude.ai/artifact/7t3dEEThsGiApTYJPdzHe2.

## Planetas

| id | Nombre | Hobby | Museo | Hitos |
|---|---|---|---|---|
| `verdanza` | Verdanza | Juegos de mesa | El Prado de las Kallax | kallax, meeples, dados, abstractos |
| `carmesi` | Carmesí | Videojuegos | El Salón de Neón | recreativas, sprites, cartucho, portal |
| `thalassa` | Thalassa | Cine | El Autocine del Fin del Mundo | autocine, butacas, carretes, claqueta |
| `gelida` | Gélida | Libros y manga | La Biblioteca de Hielo | biblioteca, torre, vuelo, atril |
| `izaro` | Izaro | Rol · Proyecto Arca | Las Islas del Narrador | circulo, d20, eter, academia |
| `nix-aurea` | Nix Áurea | Música | El Escenario Dorado | ecualizador, vinilo, altavoces, notas |
| `lumen` | Lumen | Bitácora | El Faro de la Bitácora | faro, holopaneles, escritorio, paginas |

Nombres, tipo (gas/rock/ice), paletas, atmósfera y anillos son los de `poc/src/travesia.js` (rama `claude/project-thread-6obski`), así que el planeta que se ve por el ventanal del puente es el mismo en el que se aterriza.

Nota: el hilo del universo 3D (`/mnt/project-files/universo-3d/`) tiene su propio sistema (Thalassa, Verdalia, Brasa Menor, Gélida, Opalia, Izaro, El Abismo) con aspecto propio. Coinciden de nombre Thalassa, Gélida e Izaro. Si se quiere que aterrizar en un planeta del universo lleve a un museo, basta un mapa id-universo → id-museo (p. ej. `verdalia → verdanza`, `opalia → gelida`).

## Requisitos

La página que lo importe necesita el mismo importmap que la nave:

```html
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
            "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
</script>
```

## API

```js
import { PLANETAS, init, update, dispose, crearSuperficie, crearPlanetaOrbital } from './planetas-hobby.js';
```

### `PLANETAS`
Array de `{ id, nombre, hobby, museo, lema, descripcion, tipo, paleta[4], atmo, anillos, luna, semilla }`.

### `init(canvas, planetId, opts?) → controlador`
Monta todo en un `<canvas>`: renderer propio, cámara orbital (arrastrar/rueda/pinch), bloom, animación de aterrizaje y clic en hitos.

`opts`:
- `bucle` (true): usa su propio `requestAnimationFrame`. Con `false`, llama tú a `update(dt)` cada fotograma.
- `aterrizaje` (true): la cámara baja desde lo alto al entrar.
- `calidad`: `'alta' | 'media' | 'baja'` (pixel ratio; `'baja'` quita bloom, sombras y antialias).
- `sombras`: sombras reales del sol (por defecto, sí salvo en calidad baja).
- `adaptativo` (true): si tras calentar va por debajo de ~28 fps baja la resolución, luego quita sombras y por último el bloom.
- `posts`: entradas para los holopaneles de Lumen, `[{ titulo, fecha, tags, min, url }]`. Por defecto, 8 entradas reales de malkevnia.com.
- `onHito(hito)`: se llama al tocar un hito (en la escena o con `irAHito`).
- `onPlaneta(planeta)`: se llama al cargar un planeta.
- `onCalidad({ pixelRatio, sombras, bloom })`: se llama cuando la calidad adaptable rebaja algo.

Con `prefers-reduced-motion` no hay giro automático y la cámara salta en vez de volar.

Controlador:
- `planeta`, `hitos`: datos actuales. Cada hito: `{ id, nombre, texto, foco: Vector3, vista: Vector3, objeto, enlaces? }`.
- `update(dt)`: avanza un fotograma (solo si `bucle: false`).
- `irAHito(id)`: vuela la cámara al hito y dispara `onHito`.
- `setPlaneta(id)`: cambia de planeta sin recrear el renderer.
- `hitosEnPantalla()`: `[{ id, nombre, x, y, visible, distancia }]` en píxeles del canvas, para pintar etiquetas HTML.
- `resize()`: se llama sola con un ResizeObserver.
- `pausar()` / `reanudar()`, `pausado`: para el bucle sin perder el estado (al volver a órbita, por ejemplo).
- `dispose()`: libera renderer (con su contexto WebGL), escena, texturas, sombras y listeners.
- `renderer`, `camera`, `controls`, `superficie`: acceso directo si hace falta.

### `update(dt)` / `dispose()`
Atajos sobre el último `init()`.

### `crearSuperficie(id, opts?) → { planeta, scene, hitos, camara: {pos, objetivo}, bloom: {fuerza, radio, umbral}, exposicion, update(t, dt), dispose() }`
Solo la escena, para meterla en un renderer que ya exista (la nave). La escena trae cielo, niebla, luces y todo lo animado; `update(t, dt)` recibe el tiempo total en segundos. Recomendado: `ACESFilmicToneMapping` con `toneMappingExposure = exposicion`, UnrealBloom con los valores de `bloom` y `renderer.shadowMap.enabled = true` (PCFSoft) para ver las sombras. `opts.sombras = false` las quita; `opts.posts` como en `init`.

El cielo es una esfera de radio 1400 que se pinta siempre al fondo: la cámara necesita `far` ≥ 1500.

### `crearPlanetaOrbital(id, { radio = 1, luz = Vector3, segmentos = 96 }) → THREE.Group`
El planeta visto desde el espacio (shader procedural + atmósfera + anillos). `group.userData.update(t)` anima nubes y rotación. Sirve para el selector, el ventanal del puente o el universo.

## Cambios

- 2026-11-06 · v2: sombras reales, calidad adaptable, `pausar`/`reanudar`, `onCalidad`, movimiento reducido, contexto WebGL liberado en `dispose`, tablero de Verdanza nítido, cajas de la Kallax a escala, partículas que flotan con sus islas en Izaro. La API de la v1 no cambia.
- 2026-11-06 · v1: siete planetas con cuatro hitos cada uno.

## Ejemplo mínimo

```js
const ctrl = init(document.querySelector('canvas'), 'thalassa', {
  onHito: (h) => console.log(h.nombre, h.texto),
});
// más tarde
ctrl.setPlaneta('izaro');
ctrl.irAHito('d20');
```
