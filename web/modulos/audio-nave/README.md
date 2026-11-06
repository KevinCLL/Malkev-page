# audio-nave

Audio ambiental procedural para La Malkevnia. Todo se sintetiza con la Web Audio API: sin samples, sin ficheros de audio, sin dependencias. Un solo módulo ES (`audio-nave.js`, ~20 KB).

- `audio-nave.js`: el módulo.
- `demo.src.html`: la demo del mezclador; en el marcador `/*__MODULE__*/` se pega el módulo sin las palabras `export` para publicarla como página única.

## Capas

| Capa | Qué suena | Cambia con la sala |
|---|---|---|
| `motores` | Zumbido grave del reactor (senoidales a 43,65 Hz y armónicos + ruido marrón con "respiración") | Nivel y brillo (fuerte en Máquinas, casi nada en Biblioteca) |
| `ambiente` | Aire de la sala (ruido rosa filtrado) y eventos sueltos: pitidos de telemetría, vapor, crujidos, chirridos de máquinas recreativas | Color del aire y tipo/frecuencia de eventos |
| `musica` | Pad generativo con bajo, campanas al azar y eco; acordes, escala, tempo y timbre propios de cada sala | Fundido cruzado entre salas |
| `efectos` | Puertas, pasos, pitidos de interfaz | No |

Más un volumen `master`. Hay una reverb generada compartida cuya cantidad cambia por sala.

## Salas

Los ids son los mismos que en `nave-3d/index.html`:

`pasillo`, `maquinas`, `recreativa`, `proyeccion`, `bitacora`, `juegos`, `biblioteca`, `ordenador`, `puente`.

`ROOMS[id]` trae `name`, `mood` y los parámetros de síntesis, por si quieres ajustar una sala o añadir otra (mismo formato).

## Uso

```js
import AudioNave from './modulos/audio-nave/audio-nave.js';

// init() tiene que ir dentro de un gesto del usuario (click, tecla, toque).
document.querySelector('#entrar').addEventListener('click', async () => {
  await AudioNave.init({ room: 'pasillo' });
});

// Al cambiar de sala en la nave 3D
function alEntrarEnSala(id) {
  AudioNave.playDoor('open');
  AudioNave.setRoom(id);          // fundido de 3 s
}

// Pasos: o uno por zancada, o automáticos mientras se mueve
AudioNave.footstep({ surface: 'metal' });
AudioNave.setWalking(seMueve, { rate: 1.8, surface: 'rejilla' });
```

Con la cámara de la nave 3D lo natural es: `setWalking(true)` cuando la velocidad pasa de un umbral y `setWalking(false)` al parar, y `setRoom(id)` cuando la sala bajo el jugador cambia (el módulo ignora llamadas repetidas a la misma sala, así que se puede llamar en cada frame).

## API

| Función | Descripción |
|---|---|
| `init(opts?) → Promise<state>` | Crea el `AudioContext` y arranca. **Llamar en un gesto del usuario.** Idempotente. `opts`: `room` (sala inicial, por defecto `'pasillo'`), `fade` (segundos de fundido por defecto, 3), `volumes` (`{ master, motores, … }`), `pauseWhenHidden` (por defecto `true`: suspende el audio si la pestaña se oculta). |
| `setRoom(id, { fade? })` | Cambia de sala con fundido cruzado. Antes de `init()` solo recuerda la sala. Id desconocido → `pasillo` con aviso en consola. |
| `playDoor('open' \| 'close', { pan? })` | Puerta neumática: aviso de dos tonos, siseo, motor de la hoja y golpe. `pan` de -1 a 1. |
| `footstep({ surface?, intensity? })` | Un paso. `surface`: `'metal'` (por defecto), `'rejilla'`, `'moqueta'`. Alterna izquierda/derecha. |
| `setWalking(on, { rate?, surface? })` | Pasos automáticos, `rate` en pasos por segundo (1,8 por defecto). |
| `beep('ok' \| 'error')` | Pitido de interfaz para la consola o menús. |
| `setVolume(capa, 0..1)` | Capas: `master`, `motores`, `ambiente`, `musica`, `efectos` (alias: `engine`, `ambient`, `music`, `fx`). Curva cuadrática. Se puede llamar antes de `init()`. |
| `getVolume(capa)` | Volumen actual 0..1. |
| `setMuted(bool)` | Silencia todo sin perder los volúmenes. |
| `getAnalyser()` | `AnalyserNode` de la salida (para visualizadores) o `null`. |
| `getState()` | `{ running, room, roomName, volumes, muted, walking }`. |
| `onChange(fn) → unsubscribe` | Avisa de cambios de estado. |
| `dispose() → Promise` | Para todo y cierra el contexto. Se puede volver a llamar a `init()`. |
| `ROOMS` | Definición de las salas. |

También hay exportaciones con nombre de todo lo anterior (`import { init, setRoom } from …`).

## Notas

- Navegadores: Chrome, Edge, Firefox y Safari actuales. En iPhone el interruptor de silencio también silencia la Web Audio API.
- Coste: unas 40 voces de oscilador simultáneas en el peor caso (sala con acordes solapados). Bien para escritorio y móvil.
- Salida: compresor suave antes del destino, sin picos por encima de ~0,45 en las pruebas.
