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
const mj = connect(MJ_URL, nombre, { room: salaActual });
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

`connect(url, name, opts?)`. Opciones: `room` ('puente'), `sendHz` (15),
`interpDelay` (150 ms), `maxExtrapolate` (250 ms), `reconnect` (true),
`WebSocket` (implementación alternativa).

| miembro | descripción |
| --- | --- |
| `onPlayers(cb)` | los demás de tu sala al entrar/salir alguien; se llama al suscribirse; devuelve `unsubscribe` |
| `onRooms(cb)` | recuento por sala de toda la nave |
| `onStatus(cb)`, `onError(cb)` | estado de conexión; errores `full`, `ip`, `rate`, `protocol`, `room`, `socket`, `connect` |
| `sendPose({ x, y, z, yaw, anim })` | `yaw` en radianes, 0 = mirando a +Z; `anim` ∈ idle, walk, run, sit; se limita solo |
| `sample(t?, { interpolate })` | `[{ id, name, x, y, z, yaw, anim }]` interpolado, cada frame |
| `setRoom(room)` | sala = `[a-z0-9-]{1,24}`, p. ej. `puente`, `bitacora`, `sala-juegos`, `proyeccion`, `biblioteca` |
| `dispose()` | cierra y limpia |
| `id`, `name`, `room`, `status`, `rooms` | lectura |

`createAvatarLayer(THREE, parent, { scale = 1, yawOffset = 0 })` devuelve
`{ root, update(players, dt), count, dispose() }`. El avatar mide unos 1,8 m
con la placa y mira a +Z local; usa `yawOffset` si la nave usa otro frente, y
`scale` si la nave no está en metros.

Las coordenadas son las de la sala en la que estés, así que conviene que cada
estancia de la nave use su propio origen o que todas compartan el mismo sistema
del plano. Límite del servidor: ±500 en cada eje.
