# rendimiento.js · modo rendimiento adaptable

Módulo ES autocontenido para las escenas 3D de La Malkevnia (nave y universo).
No importa Three.js: actúa sobre el `renderer`, la `scene` y el `composer` que le pases,
así que funciona con la `three@0.160.0` que ya usa `nave-3d/index.html`.

Archivos:
- `rendimiento.js`: el módulo.
- `demo/index.html`: banco de pruebas (escena pesada + panel + telemetría). Espera `rendimiento.js` al lado.

## Uso mínimo

```js
import * as R from './rendimiento.js';

const info = R.detect();                       // antes de crear el renderer
const renderer = new THREE.WebGLRenderer({ antialias: R.PRESETS[info.recomendado].antialias });
// ... escena, cámara, composer con RenderPass + UnrealBloomPass (bloom) + OutputPass

R.applyPreset(renderer, scene, 'auto', { composer, bloom });
const tuner = R.autoTune(renderer, 60);
R.panel(document.querySelector('#ajustes'));   // panel en español

function loop() {
  requestAnimationFrame(loop);
  R.render(renderer, scene, camera, composer);  // usa composer sólo si el postproceso está activo
}
```

En el `resize` sigue llamando a `renderer.setSize()` y `composer.setSize()` como siempre; el módulo sólo toca el pixel ratio.

## API

### `detect(renderer?) → info`
Lee la GPU (`WEBGL_debug_renderer_info`), si es móvil, núcleos, memoria y DPR, y recomienda un preset.
Sin renderer crea un contexto temporal y lo libera.

```js
{ gpu: 'NVIDIA GeForce RTX 3060', fabricante, webgl2, maxTextura, movil, nucleos, memoriaGB, dpr,
  software: false, tier: 2, recomendado: 'alto', motivo: 'GPU dedicada' }
```
`tier` 0..3 = bajo, medio, alto, ultra. Render por software (SwiftShader, llvmpipe) da 0. Un móvil nunca pasa de `medio`.

### `applyPreset(renderer, scene, preset = 'auto', opts?) → ajustes`
`preset`: `'bajo' | 'medio' | 'alto' | 'ultra' | 'auto'` o un objeto parcial (se mezcla con `medio`).
`'auto'` usa lo que el visitante eligió en el panel la última vez y, si no hay nada, lo recomendado por `detect()`.

`opts`:
- `composer`: EffectComposer; se le actualiza el pixel ratio.
- `bloom`: un pase o un array de pases; su `enabled` sigue a `postproceso`.
- `overrides`: cambios puntuales, por ejemplo `{ sombras: false }`.

Qué hace:
- Pixel ratio = `min(devicePixelRatio, pixelRatioMax) × escala dinámica`.
- Sombras: `renderer.shadowMap.enabled/type`, `mapSize` de cada luz y `needsUpdate` en materiales cuando cambia.
- Anisotropía de las texturas de los materiales.
- **Partículas**: objetos con `userData.rendimiento = { particulas: true }`. En `Points` usa `setDrawRange`; en `InstancedMesh` cambia `count`. Se dibuja `total × ajustes.particulas`.
- **Detalle**: objetos con `userData.rendimiento = { detalleMin: 'alto' }` (o 0..3) sólo son visibles a partir de ese nivel.

Presets (en `R.PRESETS`):

| | pixelRatioMax | escalaMin | sombras | mapa | postproceso | partículas | anisotropía | antialias |
|---|---|---|---|---|---|---|---|---|
| bajo | 0.75 | 0.5 | no | 512 | no | 25 % | 1 | no |
| medio | 1.0 | 0.6 | PCF | 1024 | no | 50 % | 2 | sí |
| alto | 1.5 | 0.65 | PCF suave | 2048 | bloom | 80 % | 4 | sí |
| ultra | 2.0 | 0.75 | PCF suave | 4096 | bloom | 100 % | 16 | sí |

`antialias` no se puede cambiar en caliente: léelo al crear el renderer.

### `autoTune(renderer, fpsObjetivo = 60, opts?) → controlador`
Mide el tiempo de frame con su propio `requestAnimationFrame` (no hay que llamarlo en tu bucle) y:
1. Si va lento ~0,6 s, baja la escala de resolución en proporción a lo que falta (hasta `escalaMin`).
2. Si ya está al mínimo y sigue lento 1,5 s, baja un preset (sólo en modo Auto).
3. Con margen 2,5 s, sube la resolución un 8 %; con margen 8 s a resolución completa, sube un preset (sin pasar del `techo`).

Ignora frames con la pestaña oculta. `opts`: `{ cambiarPreset: true, techo: 'ultra', suelo: 'bajo', onDecision(texto, tipo) }`.

Controlador: `{ fps, ms, historial (últimos 240 dt en ms), objetivo, activo, setObjetivo(n), pausar(bool), stop() }`.

### `panel(container, opts?) → { el, destroy() }`
Panel en español con: FPS, calidad (Auto / Bajo / Medio / Alto / Ultra), resolución dinámica on/off, escala manual,
FPS objetivo, sombras, postprocesado, partículas, restablecer y la GPU detectada.
Guarda las preferencias en `localStorage` (`malkevnia.rendimiento.v1`); si no hay almacenamiento, funciona igual.
Estilos propios con prefijo `.mk-rend` en tonos púrpura; ancho `min(300px, 100%)`.

### Utilidades
- `onChange(fn) → baja()`: eventos `{ tipo: 'preset' | 'escala' | 'decision', ajustes, escala, ... }`. Útil para reaccionar a `postproceso` o a `detalle` en cosas que el módulo no toca (distancia de dibujado, LOD propio, número de planetas).
- `ajustes()`, `escala()`, `setEscala(v)`, `preferencias()`.
- `render(renderer, scene, camera, composer)`: renderiza con o sin composer según `postproceso`.
- `NIVELES`, `PRESETS`.

## Integración en la nave (`nave-3d/index.html`)

1. Cambiar `renderer.setPixelRatio(...)` fijo por `R.applyPreset(renderer, scene, 'auto', { composer, bloom })`.
2. Crear siempre el composer (también en táctil) y sustituir `composer ? composer.render() : renderer.render(...)` por `R.render(...)`.
3. Marcar las capas de estrellas con `userData.rendimiento = { particulas: true }` y lo decorativo con `detalleMin`.
4. `R.autoTune(renderer, 60)` y montar `R.panel()` en el menú de pausa.

Para el universo: lo mismo, y usar `onChange` para ajustar distancia de generación de planetas según `ajustes.detalle`.
