# Planetas procedurales · La Malkevnia

Generador de planetas infinitos a partir de una semilla. La misma semilla da siempre el mismo planeta: nombre, designación, lore, datos, colores, nubes, anillos y lunas.

- `planetas.js`: módulo ES autocontenido. Solo depende de `three` (probado con **three@0.160.0**, el mismo que usa `nave-3d/`).
- `demo.html`: visor de ejemplo ("Siguiente planeta", semilla en la URL con `#semilla`, copiar semilla, ← para volver). Para abrirlo en local hay que servir la carpeta (`npx serve .` o `python -m http.server`), porque los módulos ES no cargan desde `file://`.

## Carga

```html
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>
<script type="module">
  import * as THREE from 'three';
  import { generatePlanet, planetSpec, randomSeed } from './planetas.js';
</script>
```

## API

### `generatePlanet(seed, opts?)`

Crea el planeta en Three.js. Devuelve:

| Campo | Qué es |
|---|---|
| `group` | `THREE.Group` raíz. Añádelo a la escena y muévelo/escálalo como quieras. Contiene inclinación axial, superficie, nubes, atmósfera, anillos y lunas. |
| `mesh` | La malla de la superficie (útil para raycasting / "aterrizar"). |
| `meta` | Datos y lore (ver abajo). También en `group.userData.meta`. |
| `update(dt)` | Llamar cada frame con segundos transcurridos: rota planeta y nubes, mueve lunas, anima lava/tormentas y recoloca la sombra de los anillos. |
| `setLightDirection(vec3)` | Dirección **hacia** el sol, en coordenadas de mundo. |
| `setSunPosition(vec3 \| null)` | Alternativa: posición del sol en el mundo; `update()` recalcula la dirección cada frame. Útil en un sistema solar. |
| `lightDirection` | El `Vector3` compartido por todos los shaders (se puede mutar directamente). |
| `dispose()` | Lo saca de la escena y libera geometrías y materiales. |

`opts`:

| Opción | Por defecto | Notas |
|---|---|---|
| `radius` | `1` | Radio en unidades de escena (escala el grupo). Anillos y órbitas de lunas escalan con él. |
| `detail` | `'alta'` | `'alta'` \| `'media'` \| `'baja'`: segmentos de esfera y octavas de ruido. Usa `'baja'` para planetas lejanos y `'media'` en móvil. |
| `lightDirection` | `(1, 0.3, 0.3)` | `THREE.Vector3` inicial. |
| `moons` | `true` | `false` para no crear lunas (p. ej. vista lejana). |

Las lunas orbitan dentro del `group`, hasta unas 8 veces el radio. Los anillos llegan hasta ~2,6 radios.

### `planetSpec(seed)` → `{ meta, visual }`

Lo mismo sin crear nada en GPU. Sirve para listar sistemas, mapas estelares o generar la ficha sin renderizar. Es barato: se pueden calcular miles.

### `meta`

```js
{
  seed: 'k3x9q2', nombre: 'Trozia Mayor', designacion: 'MKV-5033b', sector: 'Bramau-2',
  tipo: 'vergel', tipoNombre: 'Vergel templado',
  radioKm: 7097, gravedad: 1.25, temperatura: 10, duracionDia: 39.6,
  atmosfera: 'de nitrógeno y oxígeno, respirable', habitabilidad: 69,
  estado: 'Sin explorar', anillos: false,
  lunas: [{ nombre, tipo, tipoNombre, radioKm, periodoDias }],
  lore: 'Texto completo…', loreFrases: ['…', '…', '…']
}
```

### Otros exports

- `randomSeed()`: semilla nueva de 7 caracteres (a-z, 2-9).
- `normalizeSeed(s)`: limpia cualquier texto a una semilla válida para URL (`a-z0-9-`). `generatePlanet` y `planetSpec` ya la aplican, así que "Mi Planeta" y "mi-planeta" son el mismo mundo.
- `PLANET_TYPES`: `rocoso`, `desertico`, `oceanico`, `vergel`, `volcanico`, `helado`, `gaseoso`, cada uno con `id`, `nombre` y `peso` (probabilidad relativa).

## Qué hace cada tipo

| Tipo | Shader |
|---|---|
| Rocoso | Relieve fuerte, casquetes polares a veces. |
| Desértico | Rampa de arenas con dunas; a veces mares pequeños y nubes de polvo. |
| Oceánico | Océano casi total con brillo especular, islas, nubes y casquetes. |
| Vergel | Continentes verdes (o bosques violetas), nubes y, a veces, luces de ciudades en la cara nocturna. |
| Volcánico | Costra oscura con grietas de lava emisivas que laten y brillan más de noche. |
| Helado | Hielo azulado con grietas y casquetes grandes. |
| Gigante gaseoso | Bandas animadas con turbulencia y, a veces, una gran tormenta. Más probabilidad de anillos y lunas. |

Todos llevan atmósfera (halo + borde iluminado). Un ~22 % de los planetas usa una paleta "exótica" en púrpuras y magentas para encajar con la estética de la nave. Los anillos reciben la sombra del planeta.

## Ejemplo mínimo

```js
const planet = generatePlanet('malkevnia', { radius: 3, detail: 'media' });
planet.group.position.set(40, 0, -60);
planet.setSunPosition(new THREE.Vector3(0, 0, 0));
scene.add(planet.group);

renderer.setAnimationLoop(() => {
  planet.update(clock.getDelta());
  renderer.render(scene, camera);
});

// Al alejarse:
planet.dispose();
```

Rendimiento: el shader de superficie calcula el ruido por píxel (sin texturas), así que un planeta a pantalla completa en `'alta'` es lo más caro. Para muchos planetas a la vez usa `'baja'` y `moons: false` en los lejanos, y crea el detalle alto solo al acercarte.
