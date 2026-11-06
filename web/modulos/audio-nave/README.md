# audio-nave

Audio ambiental procedural para La Malkevnia. Todo se sintetiza con la Web Audio API: sin samples, sin ficheros de audio, sin dependencias. Un solo módulo ES.

- `audio-nave.js`: el módulo.
- `audio-nave.d.ts`: tipos para TypeScript / Astro.
- `demo.src.html`: la demo del mezclador. `demo.html` es la misma demo con el módulo pegado dentro (en el marcador `/*__MODULE__*/`, quitando las palabras `export`), lista para abrir sin servidor.

Se puede importar en el servidor (Astro, SSR) sin romper nada: no toca `window` ni `document` hasta que se llama a `init()`.

## Capas

| Capa | Qué suena | Cambia con la sala |
|---|---|---|
| `motores` | Zumbido grave del reactor: dos fundamentales a 43,65 Hz separadas 0,21 Hz (batido lento), armónicos para altavoces pequeños y ruido marrón que respira | Nivel y brillo (fuerte en Máquinas, casi nada en Biblioteca) |
| `ambiente` | Aire de la sala (ruido rosa filtrado que fluctúa), la textura propia de la sala y sonidos sueltos | Color del aire, textura y sonidos sueltos |
| `musica` | Pad generativo con bajo y campanas o arpegio con eco; acordes, escala, tempo y timbre propios de cada sala. Las campanas eligen sobre todo notas del acorde que suena, y de vez en cuando la música "respira" con un acorde solo de bajo | Fundido cruzado entre salas |
| `efectos` | Puertas, pasos, pitidos de interfaz | Los pasos usan el suelo de la sala |

Más un volumen `master`. Una reverb generada (predelay, primeras reflexiones y cola que se oscurece) se comparte entre capas y su cantidad cambia por sala.

## Salas

Los ids son los de `nave-3d/rooms.json`.

| id | Suelo | Textura continua | Sonidos sueltos |
|---|---|---|---|
| `pasillo` | metal | | telemetría, el casco al dilatarse |
| `maquinas` | rejilla | turbina | vapor, crujidos, casco |
| `recreativa` | metal | | máquinas recreativas al fondo (y arpegio retro en la música) |
| `proyeccion` | moqueta | proyector (obturador a 24 fps y motor) | |
| `bitacora` | moqueta | | alguien teclea |
| `juegos` | madera | | dados rodando |
| `biblioteca` | moqueta | reloj (tic, tac) | |
| `ordenador` | metal | servidores | telemetría (y arpegio de pitidos en la música) |
| `puente` | metal | viento solar y brillo estelar | telemetría, casco |

`ROOMS[id]` trae `name`, `mood`, `floor`, `texture`, `events` y los parámetros de música. Es un objeto normal: se puede retocar una sala o añadir otra con el mismo formato antes de entrar en ella.

## Uso

```js
import AudioNave from './modulos/audio-nave/audio-nave.js';

// init() debe ir dentro de un gesto del usuario (click, tecla, toque).
// Si el navegador aun así lo bloquea, el audio arranca solo en el siguiente click o tecla.
document.querySelector('#entrar').addEventListener('click', () => {
  AudioNave.init({ room: 'puente' });
});

// En el bucle de la nave 3D: se puede llamar en cada fotograma.
AudioNave.setRoom(salaBajoElJugador);          // la misma sala otra vez no hace nada
AudioNave.setWalking(jugador.seMueve);         // sin surface usa el suelo de cada sala

// Al cruzar una puerta
AudioNave.playDoor('open');
```

`setRoom()` y `setWalking()` son idempotentes: llamarlos en cada fotograma no amontona voces ni pasos. Si el jugador va y viene por una puerta, la sala que se estaba apagando se recupera en lugar de crear otra.

## API

| Función | Descripción |
|---|---|
| `init(opts?) → Promise<state>` | Crea el `AudioContext` y arranca. Llamar en un gesto del usuario. Idempotente. `opts`: `room` (sala inicial, `'pasillo'` por defecto), `fade` (segundos de fundido entre salas, 3), `volumes` (`{ master, motores, … }`), `pauseWhenHidden` (`true` por defecto: suspende el audio con la pestaña oculta y lo reanuda al volver). |
| `setRoom(id, { fade? })` | Cambia de sala con fundido cruzado de música, textura, motor, aire y reverb. Antes de `init()` solo recuerda la sala. Id desconocido → `pasillo` con aviso en consola. |
| `playDoor('open' \| 'close', { pan? })` | Puerta neumática: aviso de dos tonos, pestillo, servo, siseo y golpe (al cerrar, la chapa vibra). `pan` de -1 a 1. |
| `footstep({ surface?, intensity?, pan? })` | Un paso (talón y puntera). `surface`: `metal`, `rejilla`, `moqueta`, `madera`; sin ella, el suelo de la sala actual. |
| `setWalking(on, { rate?, surface? })` | Pasos automáticos, `rate` en pasos por segundo (1,8 por defecto). Llamarlo otra vez con `true` solo cambia ritmo y suelo. |
| `beep('ok' \| 'error')` | Pitido de interfaz para la consola o menús. |
| `setVolume(capa, 0..1)` | Capas: `master`, `motores`, `ambiente`, `musica`, `efectos` (alias: `engine`, `ambient`, `music`, `fx`). Curva cuadrática. Vale antes de `init()`. |
| `getVolume(capa)` | Volumen actual 0..1. |
| `setMuted(bool)` | Silencia todo sin perder los volúmenes. Se recuerda aunque se llame antes de `init()` o entre `dispose()` e `init()`. |
| `getAnalyser()` | `AnalyserNode` de la salida (para visualizadores) o `null`. |
| `getState()` | `{ ready, running, room, roomName, floor, volumes, muted, walking, voices }`. `ready` = se llamó a `init()`; `running` = suena de verdad (es `false` si el navegador lo tiene en pausa o la pestaña está oculta). |
| `onChange(fn) → unsubscribe` | Avisa de cada cambio de estado (también cuando el navegador pausa o reanuda el audio). |
| `dispose() → Promise` | Para todo y cierra el contexto. Después se puede volver a llamar a `init()`. |
| `ROOMS`, `SURFACES` | Definición de las salas y suelos disponibles. |

También hay exportaciones con nombre de todo lo anterior (`import { init, setRoom } from …`).

## Notas

- Navegadores: Chrome, Edge, Firefox y Safari actuales. En iPhone el interruptor de silencio también silencia la Web Audio API.
- Si se comprueba "¿está sonando?" para decidir si llamar a `init()`, usar `getState().ready`, no `running`: `running` también es `false` cuando la pestaña está oculta.
- Rendimiento: unas 20 a 40 voces de oscilador a la vez según la sala. Los sonidos de un solo uso se desconectan del grafo al terminar y las salas apagadas se liberan, así que una sesión larga no acumula nodos.
- Niveles medidos (navegador automático, volúmenes por defecto): RMS de 0,06 a 0,15 según la sala, picos por debajo de 0,41. Hay un compresor suave antes de la salida.
- Con la pestaña oculta y `pauseWhenHidden: false`, el planificador mira 1,6 s por delante para aguantar los temporizadores lentos, y si aun así se queda atrás salta lo perdido en vez de amontonar notas.
