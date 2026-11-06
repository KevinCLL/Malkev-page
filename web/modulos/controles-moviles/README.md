# Controles móviles · Malkevnia (v2)

Módulo ES sin dependencias (`controles-moviles.js`) para mover y mirar en escenas 3D desde el móvil:

- **Joystick virtual flotante**: aparece donde apoyas el pulgar en el 45 % izquierdo de la pantalla y te sigue si te pasas del borde. Tiene zona muerta y devuelve valores analógicos de -1 a 1.
- **Mirar arrastrando**: con cualquier otro dedo. Funciona a la vez que el joystick (multitáctil con Pointer Events).
- **Giroscopio opcional**: usa la velocidad de giro (`devicemotion.rotationRate`) proyectada sobre la vertical real (la gravedad). Girar sobre ti mismo es rumbo puro aunque sostengas el móvil inclinado, funciona en vertical, en horizontal y con la rotación bloqueada, corrige el signo invertido de iOS y filtra el temblor de la mano. Se suma al arrastre.
- **Botones opcionales** abajo a la derecha (acción, saltar, subir, bajar...), con pulsar y soltar y una vibración corta en Android.
- **Equipos híbridos**: en escritorio no se dibuja nada; en un portátil con pantalla táctil aparece al primer toque. El ratón nunca lo activa, así que convive con tu pointer lock y WASD.

Demo: https://claude.ai/artifact/M5coNTz5eSd6bge8oCARMn (`demo.html` en esta carpeta).

## Uso rápido

```js
import { init, isTouchDevice } from './controles-moviles.js';

const ctl = init(renderer.domElement, {
  onMove: (x, y) => { move.x = x; move.y = y; },     // x derecha +, y adelante +
  onLook: (dYaw, dPitch) => {                          // radianes
    player.yaw += dYaw;                                // + = girar a la izquierda (rotation.y de Three.js)
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch + dPitch)); // + = mirar arriba
  },
  buttons: [{ id: 'act', label: 'Usar', onPress: useNearest }],
});
// No hace falta desactivarlo en escritorio: con ui: 'auto' no dibuja nada hasta que alguien toca la pantalla.

// El giroscopio hay que activarlo desde un toque (iOS pide permiso):
gyroButton.onclick = async () => console.log(await ctl.enableGyro()); // 'on' | 'denied' | 'unavailable'
```

En el bucle también puedes leer `ctl.move.x` / `ctl.move.y` en lugar de usar `onMove`.

## API

### `isTouchDevice(): boolean`
`true` si la entrada principal es táctil (puntero `coarse` o `maxTouchPoints > 0` sin hover). Úsalo para decidir si mostrar los controles o el pointer lock.

### `hasGyro(): boolean`
`true` si el navegador expone `DeviceMotionEvent`. No garantiza que haya sensor ni permiso.

### `init(domElement, options) → controlador`
`domElement` es el elemento que recibe los toques (normalmente el canvas). Pone `touch-action: none` en él.

| Opción | Por defecto | Qué hace |
|---|---|---|
| `onMove(x, y)` | — | Se llama cuando cambia el joystick. `x` derecha +, `y` adelante +, en [-1, 1]. Vuelve a (0, 0) al soltar. |
| `onLook(dYaw, dPitch)` | — | Incrementos en radianes, del arrastre y del giroscopio. `dYaw` + gira a la izquierda, `dPitch` + mira arriba. |
| `onTap(x, y)` | — | Toque corto en la zona de mirar (coordenadas de cliente). Útil para "usar" lo que tienes delante. |
| `onGyroChange(estado)` | — | `'on'`, `'off'`, `'denied'` o `'unavailable'`. |
| `joystickZone` | `0.45` | Fracción del ancho, desde la izquierda, que lanza el joystick. |
| `joystickRadius` | `56` | Recorrido máximo del pomo en px. |
| `deadZone` | `0.12` | Fracción del radio que se ignora. |
| `followThumb` | `true` | El joystick se desplaza con el pulgar si este sale del borde. |
| `lookSensitivity` | `0.005` | Radianes por px arrastrado. |
| `gyroSensitivity` | `1` | Multiplicador del giroscopio. |
| `invertY` | `false` | Invierte el eje vertical de mirar. |
| `buttons` | `[]` | `[{ id, label, ariaLabel?, onPress, onRelease }]`. |
| `haptics` | `true` | Vibración de 8 ms al pulsar un botón (`navigator.vibrate`, solo Android). |
| `ui` | `'auto'` | `'auto'`: dibuja joystick y botones solo en táctiles o tras el primer toque. `true`: siempre. `false`: nunca, solo emite eventos. |
| `zIndex` | `20` | z-index de esa capa. |

Colores: define `--cm-color`, `--cm-fill` y `--cm-text` en `:root` para cambiar el lavanda por defecto.

### Controlador
- `move` → `{ x, y }` siempre actualizado.
- `enableGyro()` → `Promise<'on' | 'denied' | 'unavailable' | 'off'>`. Llamar desde un toque. Si en 1,5 s no llega ningún dato, resuelve `'unavailable'`; si llamas a `disableGyro()` antes, `'off'`. Llamarlo dos veces seguidas devuelve la misma promesa.
- `disableGyro()`
- `gyroState` → estado actual.
- `setEnabled(bool)` → oculta los controles y suelta todo (útil al abrir un panel o un modal).
- `setButtons(lista)` → cambia los botones (por ejemplo al pasar de "a pie" a "vuelo libre"). Antes suelta los que estuvieran pulsados, llamando a su `onRelease`.
- `dispose()` → quita listeners, la capa y el giroscopio. Se puede llamar más de una vez.

## Integración

**Nave (`nave-3d/index.html`)**: quita el bloque "táctil" actual (los `touchstart/touchmove/touchend` del canvas y el `#joy`) y pon lo siguiente. El botón `#act` puede quedarse como está, porque ya aparece solo cuando tienes algo cerca:

```js
const ctl = init(canvas, {
  onMove: (x, y) => { joy.vx = x; joy.vy = -y; },          // la nave usa vy negativo hacia delante
  onLook: (dYaw, dPitch) => look(-dYaw, -dPitch, 1),        // look(dx, dy, k) resta dx·k al yaw y dy·k al pitch
  onTap: () => useNearest(),
});
```

Llama a `ctl.setEnabled(false)` en `showPanel` y al entrar en el universo, y a `ctl.setEnabled(true)` al cerrar el panel y al volver.

**Universo (vuelo libre)**: usa `onMove` para avanzar en la dirección de la cámara y `buttons` con Subir/Bajar (pulsar pone `lift = ±1`, soltar `0`). La demo tiene este modo como ejemplo.

## Notas
- Dentro del visor de artifacts de Claude el navegador bloquea el giroscopio, así que allí saldrá "no disponible". En una página propia (malkevnia.com, con HTTPS) funciona; en iPhone pide permiso la primera vez.
- Si sale "sin permiso" en iOS, Safari no vuelve a preguntar hasta recargar la página.
- Probado con Chromium emulando un Pixel 7 en vertical y un iPhone 13 en horizontal: joystick y arrastre a la vez, el joystick que sigue al pulgar, soltar vuelve a 0, botones, toque corto, y giroscopio con eventos simulados (girar sobre ti mismo con el móvil inclinado 30° da rumbo puro sin mover el cabeceo; en iPhone horizontal con la gravedad invertida, mirar arriba da cabeceo positivo). Falta probarlo en un móvil de verdad.

## Cambios en v2
Todo es compatible con v1: mismas funciones y mismos parámetros. Novedades: joystick que sigue al pulgar, giroscopio proyectado sobre la gravedad, `ui: 'auto'` por defecto, vibración en botones, `setButtons` suelta lo pulsado, `enableGyro` sin dobles llamadas y `dispose` idempotente.
