# Controles móviles · Malkevnia

Módulo ES sin dependencias (`controles-moviles.js`) para mover y mirar en escenas 3D desde el móvil:

- **Joystick virtual flotante**: aparece donde apoyas el pulgar en el 45 % izquierdo de la pantalla. Tiene zona muerta y devuelve valores de -1 a 1.
- **Mirar arrastrando**: con cualquier otro dedo. Funciona a la vez que el joystick (multitáctil con Pointer Events).
- **Giroscopio opcional**: usa la velocidad de giro (`devicemotion.rotationRate`), así que se suma al arrastre y funciona igual en vertical y en horizontal.
- **Botones opcionales** abajo a la derecha (acción, saltar, subir, bajar...), con pulsar y soltar.

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
ctl.setEnabled(isTouchDevice()); // en escritorio sigues con teclado y ratón

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
| `lookSensitivity` | `0.005` | Radianes por px arrastrado. |
| `gyroSensitivity` | `1` | Multiplicador del giroscopio. |
| `invertY` | `false` | Invierte el eje vertical de mirar. |
| `buttons` | `[]` | `[{ id, label, ariaLabel?, onPress, onRelease }]`. |
| `ui` | `true` | Dibuja joystick y botones (capa `position: fixed`). Con `false` solo emite eventos. |
| `zIndex` | `20` | z-index de esa capa. |

Colores: define `--cm-color` y `--cm-fill` en `:root` para cambiar el lavanda por defecto.

### Controlador
- `move` → `{ x, y }` siempre actualizado.
- `enableGyro()` → `Promise<'on' | 'denied' | 'unavailable'>`. Llamar desde un toque. Si en 1,5 s no llega ningún dato, resuelve `'unavailable'`.
- `disableGyro()`
- `gyroState` → estado actual.
- `setEnabled(bool)` → oculta los controles y suelta todo (útil al abrir un panel o un modal).
- `setButtons(lista)` → cambia los botones (por ejemplo al pasar de "a pie" a "vuelo libre").
- `dispose()` → quita listeners, la capa y el giroscopio.

## Integración

**Nave (`nave-3d/index.html`)**: sustituye el bloque "táctil" actual (los `touchstart/touchmove` del canvas y el `#joy`) por `init(canvas, { onMove, onLook: (y, p) => look(-y / .005, -p / .005, .005) })` o, más limpio, cambia `look()` para que reciba radianes. Llama a `ctl.setEnabled(false)` en `showPanel` y al entrar en el universo, y `true` al volver. El botón `#act` puede pasar a `buttons: [{ label: 'Usar', onPress: useNearest }]`.

**Universo (vuelo libre)**: usa `onMove` para avanzar en la dirección de la cámara y `buttons` con Subir/Bajar (pulsar pone `lift = ±1`, soltar `0`). La demo tiene este modo como ejemplo.

## Notas
- Dentro del visor de artifacts de Claude el navegador bloquea el giroscopio, así que allí saldrá "no disponible". En una página propia (malkevnia.com, con HTTPS) funciona; en iPhone pide permiso la primera vez.
- Si sale "sin permiso" en iOS, Safari no vuelve a preguntar hasta recargar la página.
- Probado con Chromium emulando un Pixel 7: joystick y arrastre a la vez, soltar vuelve a 0, y giroscopio con eventos simulados. Falta probarlo en un móvil de verdad.
