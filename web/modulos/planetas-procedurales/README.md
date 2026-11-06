# Planetas procedurales · La Malkevnia (v2)

Generador de planetas infinitos a partir de una semilla. La misma semilla (con las mismas opciones) da siempre el mismo planeta: nombre, designación, lore, datos físicos, colores, nubes, auroras, tormentas, anillos y lunas.

- `planetas.js`: módulo ES autocontenido. Solo depende de `three` (**three@0.160.0**, el mismo que usa `nave-3d/`).
- `demo.html`: visor de ejemplo. Para abrirlo en local hay que servir la carpeta (`npx serve .` o `python -m http.server`), porque los módulos ES no cargan desde `file://`.

La v2 es compatible con la v1: el mismo `generatePlanet(seed)` sigue funcionando. Ojo: las semillas antiguas dan otro planeta porque el catálogo de tipos ha cambiado.

## Carga

```html
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>
<script type="module">
  import * as THREE from 'three';
  import { generatePlanet, planetSpec, randomSeed, registerPlanetTypes } from './planetas.js';
</script>
```

## `generatePlanet(seed, opts?)` → handle

| Campo | Qué es |
|---|---|
| `group` | `THREE.Group` raíz. Añádelo a la escena y muévelo/escálalo. Contiene inclinación axial, superficie, nubes, atmósfera, anillos y lunas. |
| `mesh` | Malla de la superficie (radio 1 en local; para raycasting o colgar cosas que giren con el suelo). |
| `meta` | Datos y lore (ver abajo). También en `group.userData.meta`. |
| `visual` | Parámetros visuales usados (colores, mar, anillos…). Solo lectura. |
| `uniforms` | Uniforms del shader de superficie (`uType`, `uSea`, `uSeedOffset`, `uFreq`, `uWarp`, `uOctaves`, `uCity`, `uCityThr`, `uCityColor`, …). |
| `update(dt)` | Llamar cada frame con los segundos transcurridos. |
| `setLightDirection(v)` | Dirección **hacia** el sol, en mundo. |
| `setSunPosition(v \| null)` | Posición del sol en mundo; `update()` recalcula la dirección cada frame. |
| `setLightColor(c)` | Tiñe toda la luz (superficie, nubes, atmósfera, anillos), p. ej. rojiza para una enana roja. |
| `lightDirection`, `lightColor` | `Vector3` y `Color` compartidos por todos los shaders. |
| `dispose()` | Lo saca de la escena y libera GPU. |

### Opciones

| Opción | Por defecto | Notas |
|---|---|---|
| `radius` | `1` | Radio en unidades de escena (escala el grupo; anillos y lunas escalan con él). |
| `detail` | `'alta'` | `'alta'` \| `'media'` \| `'baja'`. Usa `'baja'` para planetas lejanos o vistas de sistema y `'media'` en móvil. |
| `moons` | `true` | `false` para no crear lunas (siguen en `meta.lunas`). |
| `lightDirection`, `lightColor` | `(1,0.3,0.3)`, blanco | Valores iniciales. |
| `tipo` | por semilla | Fuerza el tipo (núcleo o registrado). |
| `zona` | — | `'interior'` \| `'habitable'` \| `'exterior'`: si no hay `tipo`, se elige solo entre tipos que encajan en esa zona. |
| `temperatura` | por tipo | °C. Afecta a la habitabilidad. |
| `lunas` | por tipo | Número forzado, 0 a 8. |
| `acopladoMarea` | `false` | Sin rotación propia; el día dura un año orbital. |
| `contexto` | `null` | `{ estrella, aUA, periodoDias, zona, sistema }`. Se copia a `meta.contexto` y el lore lo menciona. |
| `civilizacion` | `null` | Se copia tal cual a `meta.civilizacion`. Las luces y estructuras las pone `modulos/civilizaciones/`. |

## `planetSpec(seed, opts?)` → `{ meta, visual }`

Lo mismo sin crear nada en GPU. Barato: sirve para mapas, listados o fichas.

### `meta`

```js
{
  seed, nombre, designacion, sector, tipo, tipoNombre, origen: 'nucleo',
  radioKm, densidad /* g/cm³ */, masaTierras, gravedad /* g */, gravedadDesc /* 'Ligera'… 'Extrema' */, velocidadEscape /* km/s */,
  temperatura /* °C */, duracionDia /* h */, duracionDiaTexto, acopladoMarea,
  atmosfera, habitabilidad /* 0-99 */, estado,
  lunas: [{ nombre, tipo, tipoNombre, radioKm, periodoDias, distanciaRadios }],
  anillos, auroras, tormentasElectricas,
  etiquetas /* ['Supertierra', 'Auroras', 'Con anillos', …] */,
  lore, loreFrases, contexto, civilizacion
}
```

## Tipos del núcleo

`PLANET_TYPES` (cada uno con `nombre`, `peso`, `zonas`, `gas`):

| Clave | Nombre | Zonas |
|---|---|---|
| `rocoso` | Mundo rocoso | todas |
| `desertico` | Mundo desértico | interior, habitable |
| `oceanico` | Mundo oceánico | habitable |
| `archipielago` | Mundo archipiélago | habitable |
| `vergel` | Vergel templado | habitable |
| `tundra` | Mundo de tundra | habitable, exterior |
| `pantanoso` | Mundo pantanoso | habitable |
| `volcanico` | Mundo volcánico | interior |
| `helado` | Mundo helado | exterior |
| `gaseoso` | Gigante gaseoso | exterior |
| `jupiter_caliente` | Júpiter caliente (cara nocturna incandescente) | interior |
| `gigante_helado` | Gigante de hielo | exterior |
| `mini_neptuno` | Mini-Neptuno (brumoso) | habitable, exterior |

Además, por semilla: auroras animadas en los polos, tormentas eléctricas con relámpagos en las nubes o en los gigantes, anillos con sombra sobre el planeta y del planeta sobre los anillos, hasta 8 lunas en gigantes y un ~22 % de paletas "exóticas" en púrpuras. La física es aproximada pero coherente: gravedad = densidad × radio, masa, velocidad de escape, y habitabilidad según temperatura y gravedad.

## Tipos registrados (mundos exóticos)

```js
import { REGISTRO_EXOTICOS } from '../mundos-exoticos/mundos-exoticos.js';
registerPlanetTypes(REGISTRO_EXOTICOS);
```

Después, `planetSpec(seed)` y `generatePlanet(seed)` mandan un 35 % de las semillas a tipos registrados y delegan en ese módulo (con `opts.tipo`). `listPlanetTypes()` devuelve el catálogo completo con `origen: 'nucleo' | 'registrado'`. Para que una semilla sea reproducible, registra siempre los mismos módulos y antes de generar.

## Utilidades exportadas

- `randomSeed()`, `normalizeSeed(s)` (`a-z0-9-`; "Mi Planeta" y "mi-planeta" son el mismo mundo).
- `makeRng(seed, salt)`, `makeWord(rng, min, max)`, `hashString(s)`.
- `NOISE_GLSL` (simplex 3D + `fbm`) y `HEIGHT_GLSL` (`planetHeight(n, seedOffset, freq, warp, oct)`), la misma altura que usa la superficie: tierra es `h > uSea`.

## Ejemplo

```js
const planet = generatePlanet('malkevnia', { radius: 3, detail: 'media', zona: 'habitable' });
planet.group.position.set(40, 0, -60);
planet.setSunPosition(new THREE.Vector3(0, 0, 0));
planet.setLightColor(0xffd2b0);
scene.add(planet.group);

renderer.setAnimationLoop(() => {
  planet.update(clock.getDelta());
  renderer.render(scene, camera);
});
```

Rendimiento: el ruido se calcula por píxel, sin texturas. Un planeta a pantalla completa en `'alta'` es lo más caro; para muchos a la vez usa `'baja'` y `moons: false` en los lejanos.
