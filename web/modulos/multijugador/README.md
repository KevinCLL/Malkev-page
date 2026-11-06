# Módulo multijugador (para integrar en la nave)

Copia de `packages/multijugador/client/` de la rama `claude/multijugador-o103d2`
de KevinCLL/Malkev-page. Si cambia allí, esa es la fuente.

- `multijugador.js`: cliente ES autocontenido, sin dependencias.
- `avatares.js`: avatares Three.js opcionales (recibe `THREE` como parámetro, no lo importa).
- Demo con bots: https://claude.ai/artifact/Da4AGKF7uZesYBVYVNFPkU

## Integración en la nave 3D

```js
import * as THREE from 'three';
import { connect } from './multijugador.js';
import { createAvatarLayer } from './avatares.js';

// Servidor aún sin desplegar: wss://malkevnia.com/mj/ws cuando esté en el Hetzner,
// ws://localhost:8787/ws en local (npm start en packages/multijugador).
const mj = connect(MJ_URL, nombre, { room: salaActual, key: claveCapitan /* opcional */ });
const avatars = createAvatarLayer(THREE, scene);   // o el grupo de la sala

mj.onPlayers((list) => {/* [{ id, name, room }] de tu sala, sin ti */});
mj.onRooms((counts) => {/* { puente: 3, biblioteca: 1 } para el plano de la nave */});
mj.onStatus((s) => {/* 'connecting' | 'online' | 'reconnecting' | 'closed' */});

// en el bucle de render
mj.sendPose({ x, y, z, yaw, anim: andando ? 'walk' : 'idle' });  // llamar cada frame
avatars.update(mj.sample(), dt);

// al cruzar una puerta
mj.setRoom('biblioteca');

// al cerrar
mj.dispose(); avatars.dispose();
```

## API

`connect(url, name, opts?)`. Opciones: `room` ('puente'), `key` (clave de capitán, opcional), `sendHz` (15),
`interpDelay` (150 ms), `maxExtrapolate` (250 ms), `reconnect` (true),
`WebSocket` (implementación alternativa).

| miembro | descripción |
| --- | --- |
| `onPlayers(cb)` | `[{ id, name, captain, room }]`: los demás de tu sala al entrar/salir alguien; se llama al suscribirse; devuelve `unsubscribe` |
| `onRooms(cb)` | recuento por sala de toda la nave, contándote a ti en tu sala; solo salen las salas con alguien; máx. 1/s y solo si cambia |
| `onStatus(cb)`, `onError(cb)` | estado de conexión; errores `full`, `ip`, `rate`, `protocol`, `room` (vuelve solo a la sala anterior), `name` (nombre reservado: mira `mj.name`), `socket`, `connect` |
| `sendPose({ x, y, z, yaw, anim })` | `yaw` en radianes, 0 = mirando a +Z; `anim` ∈ idle, walk, run, sit; se limita solo |
| `sample(t?, { interpolate })` | `[{ id, name, captain, x, y, z, yaw, anim }]` de los demás (sin ti), interpolado, cada frame. Mismas coordenadas y `yaw` que mandó cada uno con `sendPose` (redondeo 0,01; `yaw` viaja en [0, 2π) y al interpolar puede salirse un poco: úsalo como ángulo) |
| `setRoom(room)` | sala = `[a-z0-9-]{1,24}`, p. ej. `puente`, `bitacora`, `sala-juegos`, `proyeccion`, `biblioteca` |
| `dispose()` | cierra y limpia |
| `id`, `name`, `captain`, `room`, `status`, `rooms` | lectura |

Los nombres los escriben otros visitantes: píntalos con `textContent` o en un
canvas, nunca con `innerHTML`.

Para que el minimapa y las listas usen el mismo color que el avatar:
`import { avatarColor } from './avatares.js'` y `avatarColor(p)` con cada
elemento de `sample()` u `onPlayers` (número `0xRRGGBB`; el capitán, tono cálido).

`createAvatarLayer(THREE, parent, { scale = 1, yawOffset = 0 })` devuelve
`{ root, update(players, dt), count, dispose() }`. El avatar mide unos 1,8 m
con la placa y mira a +Z local; usa `yawOffset` si la nave usa otro frente, y
`scale` si la nave no está en metros. Son siluetas humanas tipo sombra con
paso animado, todas en 9 mallas instanciadas (9 llamadas de dibujo en total más
una por placa). El material respeta la niebla, el tone mapping y el espacio de
color de la escena. El capitán sale con ✦ y en tono cálido.

Las coordenadas son las de la sala en la que estés, así que conviene que cada
estancia de la nave use su propio origen o que todas compartan el mismo sistema
del plano. Límite del servidor: ±500 en cada eje.

## Cambios del repaso (2026-11-06)

API compatible con la versión anterior; solo se añaden cosas: `key`, `captain`,
el error `name` y `avatarColor`. Copia de nuevo los dos `.js` si ya los tenías.
