# Modo vuelo libre · `vuelo-libre.js`

Módulo ES autocontenido (Three.js r160) para pilotar La Malkevnia por el sistema de Malkevnia, saltar entre planetas y aterrizar junto al museo de cada uno. Crea su propio renderer, escena, bucle y HUD (DOM con clases `.vl-*`), y lo limpia todo en `dispose()`.

Ficheros:
- `vuelo-libre.js`: el módulo.
- `index.html`: demo a pantalla completa (es lo que está publicado como Artifact).

## Dependencias

Necesita un importmap con `three` y `three/addons/` (el mismo que usa `nave-3d/index.html`):

```html
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
</script>
```

Fuentes recomendadas (el HUD cae a system-ui si faltan): Orbitron, Exo 2, JetBrains Mono.

## API

```js
import { init, PLANETAS_POR_DEFECTO } from './vuelo-libre.js';

const vuelo = init(canvas, {
  planets: PLANETAS_POR_DEFECTO, // opcional; ver formato abajo
  hud: true,                     // false = sin HUD (solo 3D)
  sonido: true,                  // motor y efectos con WebAudio, sin ficheros
  calidad: 'alta',               // 'alta' | 'media' | 'baja' (por defecto: 'media' en táctil)
  startPosition: [x, y, z],      // opcional
  onApproach: planet => {},      // empieza el piloto automático de aterrizaje
  onLand:     planet => {},      // la nave ha tocado tierra
  onVisit:    planet => {},      // botón «Entrar al museo» (o Enter). Aquí se abre la sala del hobby
  onTakeoff:  planet => {},      // despegue
  onExit:     () => {},          // si se pasa, el menú de pausa muestra «Volver a la nave»
});

vuelo.preview();  // renderiza la escena sin dar el control (fondo de una pantalla de inicio)
vuelo.start();    // da el control al jugador y arranca el bucle (llamar tras un gesto del usuario, por el audio)
vuelo.stop();     // detiene el bucle
vuelo.update(dt); // un paso manual (si el anfitrión lleva su propio bucle; no llamar a start())
vuelo.pause(true|false);
vuelo.setTarget('thalassa'); vuelo.warpTo('aurea'); vuelo.landOn('izaro'); vuelo.takeoff();
vuelo.setSound(true|false);
vuelo.state;      // 'vuelo' | 'salto' | 'aterrizaje' | 'aterrizado' | 'despegue'
vuelo.dispose();  // quita listeners, HUD, audio y libera GPU
```

También acepta `init({ canvas, ...opciones })` y exporta `createFlight({ canvas, onExit, ... })` (async) con la misma forma que espera la nave para sus módulos (`start()` / `stop()` / `dispose()`).

El HUD se inserta en el padre del canvas (o fijo a la ventana si el padre es `body`). El canvas debe tener tamaño por CSS; el módulo lo sigue con ResizeObserver.

## Formato de un planeta

```js
{
  id: 'izaro', nombre: 'Izaro',
  tipo: 'bosque',            // 'oceano' | 'bosque' | 'hielo' | 'lava' | 'gas' | 'desierto'
  tema: 'Juegos de mesa', museo: 'La Kallax', descripcion: '…',
  radio: 520, posicion: [0, -200, -6500],
  colores: ['#0d2a4a', '#1f6f8b', '#3f7a3a', '#a7b56a'], // 4 tonos del shader
  atmosfera: '#7fc4ff', anillos: false,
  ruta: '/juegos',           // libre: para que el integrador sepa a qué sala llevar en onVisit
}
```

Los seis planetas por defecto son uno por afición: Izaro (juegos de mesa, la Kallax), Thalassa (cine), Gélida (libros), Brasa Menor (manga y cómic), Aurea (bitácora, gigante gaseoso con anillos) y Duna Violeta (rol). Si el módulo del universo publica sus planetas en este formato, basta con pasarlos en `planets`.

## Controles

| Entrada | Acción |
|---|---|
| Ratón (posición respecto al centro) / flechas | dirigir (cabeceo y guiñada) |
| W / S | acelerar / empuje inverso |
| A / D, R / F | desplazamiento lateral y vertical |
| Q / E | alabeo |
| Mayús | turbo (gasta la barra de turbo, se recarga sola) |
| Espacio | freno |
| Tab / Mayús+Tab, T | cambiar objetivo / objetivo al centro de la vista |
| J | salto hiperespacial al objetivo (si está a más de 7 radios) |
| L | aterrizar en el planeta cercano (a menos de 4 radios) · despegar |
| Enter | entrar al museo tras aterrizar |
| C | cámara exterior / cabina |
| X | asistencia de vuelo (OFF = vuelo newtoniano) |
| M | sonido · H ayuda · Esc / P pausa |

En táctil: arrastrar en la mitad izquierda dirige, y hay botones de empuje, turbo y freno; las indicaciones de aterrizar y saltar son botones.

## Escala

1 unidad = 10 km en el HUD. Velocidad de crucero 340 u/s, turbo hasta 1600 u/s. El sol está en (62000, 26000, 24000). Usa `logarithmicDepthBuffer`, así que todos los shaders propios incluyen los chunks `logdepthbuf_*`; si el integrador añade ShaderMaterials a esta escena, deben hacer lo mismo.
