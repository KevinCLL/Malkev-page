# mapa-nave · Plano de la nave en tiempo real

Este es un módulo ES sin dependencias (`mapa-nave.js`). Dibuja en SVG el minimapa de La Malkevnia: el casco, las estancias, las puertas, tu posición con un cono de visión y la estela de tus pasos. Cuando lo tocas, o pulsas **M**, se abre el plano ampliado. Allí puedes tocar una estancia para teletransportarte. **Esc** lo cierra.

- Demo: `demo.html` en esta carpeta (es la misma que el Artifact https://claude.ai/artifact/VbQ46xK3Gw6PVcAoB1mweq).
- Layout de la nave: `/mnt/project-files/nave-3d/layout.json`.

## Uso mínimo

```js
import { init } from './mapa-nave.js';

const layout = await (await fetch('layout.json')).json();
const mapa = init(document.getElementById('mini'), layout);

// en el bucle de render
mapa.setPlayer(player.x, player.z, player.yaw);

// al tocar una estancia en el plano ampliado
const baja = mapa.onTeleport(({ roomId, room, x, z, yaw }) => {
  player.x = x; player.z = z; player.yaw = yaw;
});

mapa.dispose(); // quita el DOM, los listeners y el CSS inyectado
```

El contenedor decide el tamaño del minimapa: el SVG ocupa el 100 % de su ancho y conserva la proporción de la nave. Por ejemplo, un `div` fijo en una esquina de 300 a 340 px de ancho. El plano ampliado se abre como capa `position:fixed` sobre `document.body`.

## Coordenadas

- Metros del mundo, plano XZ. X va hacia la proa (derecha del plano) y Z crece hacia abajo.
- El yaw es el de una cámara de three.js con `rotation.order = 'YXZ'`. Con `yaw = 0` se mira a −Z y con `yaw = −π/2` a +X (proa). El vector adelante es `(−sin yaw, −cos yaw)`.

## Layout

Acepta el `layout.json` de la nave tal cual, o el formato corto:

| Campo | Tipo | Notas |
|---|---|---|
| `rooms[]` | `{ id, name, x, z, w\|width, d\|depth, spawn?, sub?, short?, color?, kind? }` | `kind: 'corridor'` se detecta solo si el id o el nombre empieza por "pasillo". `short` es el nombre del minimapa (por defecto quita "Sala de"). `color` acepta `'#hex'` o un número `0xRRGGBB`. |
| `rooms[].spawn` | `{ x, z, yaw }` | Destino del teletransporte. Si falta, se calcula justo dentro de la puerta que da al pasillo, mirando hacia dentro. |
| `doors[]` | `{ x, z, w\|width, d\|depth, between?:[a,b] \| a?, b? }` | Se dibujan como marcas de puerta. |
| `ship` / `bounds` | `{ x, z, width, depth }` / `{ x0, z0, x1, z1 }` | Caja del casco. Si falta, se usa la caja de las estancias. |
| `hull` | `'auto'` \| path SVG \| `false` | Silueta: popa redondeada con motores y proa en punta hacia +X. |
| `name`, `deck` | texto | Título y antetítulo del plano ampliado. |

`fromGrid({ rooms, doors, tile })` convierte el formato de rejilla antiguo de `nave-3d` (`ROOMS` con `x0..x1/z0..z1` en casillas y `DOORS` con `tiles`) a este layout.

## API completa

`init(container, layout, opciones?)` devuelve:

| Método | Qué hace |
|---|---|
| `setPlayer(x, z, yaw)` | Mueve el marcador. Resalta la estancia actual ("Estás aquí") y emite `onRoomChange` al cambiar de estancia. Un salto de más del 12 % del lado mayor reinicia la estela. |
| `onTeleport(cb)` | `cb({ roomId, room, x, z, yaw })` al elegir una estancia. Devuelve una función para darse de baja. **El módulo no mueve al jugador** salvo con `autoMove: true`. |
| `onRoomChange(cb)` | `cb({ room, prev })`. `room` es `null` fuera de toda estancia. |
| `onToggle(cb)` | `cb(abierto)` al abrir o cerrar el plano. Sirve para pausar el movimiento. |
| `teleportTo(id)` | Lanza el teletransporte a una estancia por código (botones, consola de comandos…). |
| `expand()` / `collapse()` / `toggle()` / `isExpanded()` | Controlan el plano ampliado. |
| `roomAt(x, z)` | Devuelve la estancia en ese punto. Las salas tienen prioridad sobre los pasillos. |
| `getRoom(id)`, `getLayout()` | Devuelven el layout normalizado, con `cx`, `cz` y `spawn` calculados. |
| `setLayout(layout)` | Cambia de cubierta o de layout en caliente. |
| `dispose()` | Lo limpia todo. Se puede llamar varias veces. |

Opciones (con sus valores por defecto): `mode:'compact'`, `keyboard:true`, `toggleKey:'KeyM'`, `trail:true`, `autoMove:false`, `closeOnTeleport:true`, `releasePointer:true` (al abrir, sale del pointer lock), `teleportCorridors:true`, `title`, `hint`, `noseLength`.

## Estilo

Todo el estilo va prefijado con `.mn` y se puede ajustar con variables CSS en el contenedor: `--mn-bg`, `--mn-line`, `--mn-fg`, `--mn-muted`, `--mn-accent`, `--mn-glow`, `--mn-player`, `--mn-hull`, `--mn-font`, `--mn-display`, `--mn-mono`. Usa las mismas fuentes que la nave (Orbitron, Exo 2 y JetBrains Mono) y respeta `prefers-reduced-motion`.

## Integración en nave-3d/index.html

1. Sustituye `<canvas id="miniC">` dentro de `#mini` por el contenedor del mapa y quita `drawMini()` y el atajo M propio.
2. Llama a `mapa.setPlayer(player.x, player.z, player.yaw)` en `tick()`. Es barato: solo cambia un `transform`.
3. En `onTeleport`, haz un fundido con `#fade`, coloca al jugador en `x, z, yaw` y pon `pitch = 0`.
4. En `onToggle(abierto)`, pausa el movimiento mientras el plano está abierto. Tras cerrarlo, vuelve a pedir el pointer lock con un clic.
