# Universo 3D · La Malkevnia

Módulo ES autocontenido con el viaje por el universo (7 destinos, nave, salto warp, HUD en español).
Requiere three **0.160.0** importado como `three` y `three/addons/` (importmap de jsdelivr):

```html
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
```

Ficheros (mantener la estructura relativa; se cargan desde la carpeta de `universo.js`):
- `universo.js` — motor, HUD, API
- `ship.js` — la nave La Malkevnia exterior (`createShip(THREE)` → `{ object, length, update(dt,t,{speed}) }`)
- `planets/*.js` — thalassa, verdalia, brasa, gelida, opalia, izaro, abismo (contrato en CONTRATO.md)
- `index.html` — página independiente de ejemplo

## API

```js
import { createUniverse, createSkybox, ROUTE_IDS } from './universo-3d/universo.js';

const u = createUniverse({
  canvas,               // <canvas> obligatorio; se dimensiona según su caja CSS (ResizeObserver propio)
  container,            // donde se monta el HUD (por defecto canvas.parentElement); se pone position:relative si era static
  onExit: () => {...},  // si se pasa: botón "⟵ Volver a la nave" y tecla Esc lo llaman
  intro: false,         // pantalla de título "Encender motores" (por defecto true solo si no hay onExit)
  baseUrl,              // opcional: carpeta de ship.js y planets/ (por defecto la del módulo)
});
await u.ready;          // planetas y nave cargados y shaders compilados
u.start();              // arranca bucle de render, teclado (← → espacio H N M F Esc) y resize
u.goToPlanet('izaro');  // vuela con salto warp (id o índice); { instant: true } teletransporta
u.launch();             // empieza el recorrido desde el espacio profundo (como el botón de la intro)
u.stop();               // para render, quita listeners globales, oculta HUD, pausa el sonido
u.dispose();            // libera GPU y DOM
u.planets();            // [{ id, nombre, tipo, info }]
```

Mientras está parado no escucha teclado ni ratón (OrbitControls desactivado, keydown retirado).
Tiene su propio WebGLRenderer sobre el canvas: usa un canvas distinto del de la nave o llama a `stop()` en uno antes de renderizar el otro.

### createSkybox(scene, opts) — para las ventanas del puente

```js
const sky = createSkybox(scene, { radius: 900, starCount: 12000,
  palette: [0x5a2bd0, 0x1fb6c9, 0xff4fa8], star: { dir: [0.85,0.22,0.48], color: 0xffe2b0, intensity: 1 } });
// cada frame:
sky.update(t, camera);   // se centra en la cámara (radius debe ser < camera.far)
sky.setPalette(a, b, c); sky.dispose();
```
Nebulosa procedural + 12 000 estrellas + galaxias lejanas + brillo de estrella. Pinta en HDR lineal sin escribir profundidad (renderOrder negativo): dibuja primero y con ACES/bloom queda igual que en el viaje.

`ROUTE_IDS` = `['thalassa','verdalia','brasa','gelida','opalia','izaro','abismo']`.
