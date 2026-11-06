# Multijugador de La Malkevnia

Pequeño multijugador para ver a otros visitantes paseando por la nave. Sin cuentas,
sin base de datos: cada pestaña es un visitante anónimo con el nombre que elija.

- `src/core.js`: lógica pura (salas, validación, límites, instantáneas). La usan el servidor y la demo.
- `src/server.js`: servidor Node (`ws`) con `/ws`, `/health` y `/stats`.
- `client/multijugador.js`: cliente ES autocontenido, sin dependencias (navegador y Node ≥ 22).
- `client/avatares.js`: avatares Three.js opcionales (siluetas humanas tipo sombra, con paso animado y placa con nombre). Instanciados: 9 llamadas de dibujo en total más una por placa, haya 2 o 64 visitantes.
- `demo/`: sala de pruebas con bots y red simulada (`npm run build:demo` genera `dist/demo.html`).
- `Dockerfile`, `docker-compose.yml`, [`DEPLOY.md`](DEPLOY.md): para el Hetzner.

```bash
npm install
npm test          # núcleo, cliente y extremo a extremo con servidor real (23 tests)
npm start         # ws://localhost:8787/ws
```

## API del cliente

```js
import { connect } from './multijugador.js';
import { createAvatarLayer } from './avatares.js';

const mj = connect('wss://malkevnia.com/mj/ws', 'Malkev', { room: 'puente' });
const avatars = createAvatarLayer(THREE, scene);

mj.onPlayers((list) => console.log('en la sala', list));   // [{ id, name, room }]
mj.onRooms((counts) => console.log(counts));                // { puente: 3, biblioteca: 1 }

function frame() {
  mj.sendPose({ x, y, z, yaw, anim: moving ? 'walk' : 'idle' }); // cada frame, se limita solo
  avatars.update(mj.sample(), dt);                                // los demás, interpolados
}
// al cambiar de estancia:
mj.setRoom('biblioteca');
// al salir:
mj.dispose(); avatars.dispose();
```

### `connect(url, name, opts?)` → cliente

| opción | por defecto | qué hace |
| --- | --- | --- |
| `room` | `'puente'` | sala inicial (`[a-z0-9-]`, hasta 24) |
| `key` | — | clave de capitán: permite usar los nombres reservados y marca tu placa con ✦ |
| `sendHz` | `15` | envíos de pose por segundo como máximo |
| `interpDelay` | `150` | ms de retraso de render para interpolar suave |
| `maxExtrapolate` | `250` | ms que se extrapola si un paquete llega tarde |
| `reconnect` | `true` | reconecta con espera creciente (1 s … 15 s) |
| `WebSocket` | `globalThis.WebSocket` | implementación alternativa (tests, simulador) |

| miembro | descripción |
| --- | --- |
| `onPlayers(cb)` | `cb([{ id, name, captain, room }])` con los demás de tu sala cuando alguien entra, sale o cambia de nombre. Se llama al suscribirse. Devuelve una función para darse de baja. |
| `onRooms(cb)` | `cb({ sala: n })` recuento de toda la nave (máx. 1/s, solo si cambia). |
| `onStatus(cb)` | `'connecting' \| 'online' \| 'reconnecting' \| 'closed'` |
| `onError(cb)` | `'full' \| 'ip' \| 'rate' \| 'protocol' \| 'room' \| 'name' \| 'socket' \| 'connect'`. `name`: el nombre está reservado y el servidor te ha dado uno de `Viajero-…` (léelo en `mj.name`). `room`: sala no válida; el cliente vuelve solo a la anterior. |
| `sendPose({ x, y, z, yaw, anim })` | tu pose; `yaw` en radianes (0 = mirando a +Z), `anim` ∈ `idle, walk, run, sit`. Se envía como mucho `sendHz`/s, solo si cambia, y cada 3 s como señal de vida. Las poses con `NaN` se ignoran. Con la pestaña en segundo plano el cliente manda un ping cada 20 s para no ser expulsado. |
| `sample(t?, { interpolate })` | `[{ id, name, captain, x, y, z, yaw, anim }]` de los demás, interpolado para el instante `t` (por defecto `performance.now()`). Llamar cada frame. |
| `setRoom(room)` | cambia de sala; los demás se vacían y llegan los de la nueva. Pedir la sala en la que ya estás no hace nada. |
| `dispose()` | cierra y limpia. |
| `id`, `name`, `captain`, `room`, `status`, `rooms` | lectura. |

**Los nombres los escriben otros visitantes.** Píntalos con `textContent` o en un
canvas, nunca con `innerHTML`. El servidor quita caracteres de control e
invisibles, pero no HTML.

### `createAvatarLayer(THREE, parent, { scale, yawOffset })`

Devuelve `{ root, update(players, dt), count, dispose() }`. Recibe `THREE` como
parámetro para usar la misma copia que la escena. `yawOffset` compensa si tu
escena tiene otro "frente" (el avatar mira a +Z local).

## Protocolo (JSON por WebSocket, versión 1)

Cliente → servidor

| `t` | campos |
| --- | --- |
| `hello` | `v: 1, name, room, key?` (obligatorio y único por conexión) |
| `pose` | `p: [x, y, z], r: yaw, a: anim` |
| `room` | `room` |
| `ping` | `c` (eco) |

Servidor → cliente

| `t` | campos |
| --- | --- |
| `welcome` | `v, id, name, captain?, room, tickHz, rooms` |
| `roster` | `room, players: [{ i, n, c? }]` (al cambiar; `c: 1` = capitán) |
| `snap` | `ts, room, full?, players: [[id, x, y, z, yaw, anim]]` a `tickHz`, solo si alguien se mueve. Lleva solo a quien cambió (más una vez al pararse); quien no aparece sigue donde estaba. Con `full: 1` (al entrar o salir alguien) lleva a todos. |
| `rooms` | `counts: { sala: n }` |
| `room` | `room` (confirmación) |
| `error` | `code` (`room` trae además la sala en la que sigues; `name`) |

Cierres: `4001` nave llena, `4002` demasiadas pestañas desde tu IP, `4008` abuso de
ritmo, `4009` protocolo, `4010` inactivo.

## Límites (configurables por entorno)

- 64 visitantes en total (`MAX_PLAYERS`), 4 por IP (`MAX_PER_IP`), 12 conexiones nuevas por IP y minuto.
- 25 mensajes/s con ráfaga de 50 por cliente; lo que pasa del límite o es inválido cuenta como falta, las faltas se olvidan a 1/s y con más de 40 acumuladas, fuera.
- Un cliente que no lee lo que le mandamos (más de 256 KB pendientes) se corta.
- Límites por IP con la IPv6 agrupada por /64. Detrás del proxy se usa la última IP de `X-Forwarded-For`, la que pone el proxy; las anteriores las puede falsificar cualquiera.
- Nombres reservados (`RESERVED_NAMES`, por defecto `Malkev`): solo con `CAPTAIN_KEY` (24 caracteres o más). Se comparan sin acentos, símbolos ni homoglifos, así que `Ma1kev`, `MaIkev` o `Маlkev` (con letras cirílicas) también cuentan.
- Mensajes de 512 bytes como mucho (1 KB a nivel de socket), solo texto.
- Coordenadas recortadas a ±500, nombres saneados (sin caracteres de control ni de dirección) a 20 caracteres.
- Solo orígenes en `ALLOWED_ORIGINS`; ping cada 15 s y fuera a los 2 min sin mensajes.
