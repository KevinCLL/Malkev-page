# mapa-nave · Plano de la nave en tiempo real (v2.0.0)

Este es un módulo ES sin dependencias (`mapa-nave.js`). Dibuja en SVG el minimapa de La Malkevnia con:

- el casco, con la popa redondeada, los tres motores de la nave exterior y la proa en punta;
- las estancias, las puertas y los ventanales reales de `layout.json`;
- tu posición, con un cono de visión y una estela de tus pasos;
- los visitantes del multijugador.

Si tocas el minimapa, o pulsas **M**, se abre el plano ampliado. Ahí eliges una estancia con el ratón, el dedo o las flechas más Intro, y te teletransportas. **Esc** cierra el plano.

- Demo: `demo.html` en esta carpeta (es la misma que el Artifact https://claude.ai/artifact/VbQ46xK3Gw6PVcAoB1mweq).
- Pruebas: `pruebas.playwright.js` con `pruebas.html` (36 comprobaciones). Para ejecutarlas, sirve esta carpeta con `layout.json` en `http://127.0.0.1:8765/` y lanza `node pruebas.playwright.js`.
- Layout de la nave: `/mnt/project-files/nave-3d/layout.json`.

## Uso mínimo

```js
import { init } from './mapa-nave.js';

const layout = await (await fetch('layout.json')).json();
const mapa = init(document.getElementById('mini'), layout, { bare: true });

// en el bucle de render (si la posición no cambia, no toca el DOM)
mapa.setPlayer(player.x, player.z, player.yaw);

// al elegir una estancia en el plano ampliado
mapa.onTeleport(({ x, z, yaw }) => { player.x = x; player.z = z; player.yaw = yaw; player.pitch = 0; });

// el plano abierto es modal: pausa el juego y no recaptures el ratón tras un Esc
mapa.onToggle((abierto, { via }) => { setModal(abierto); if (!abierto && via !== 'escape') lock(); });

mapa.dispose();
```

El contenedor decide el tamaño del minimapa. El SVG ocupa el 100 % de su ancho y conserva la proporción de la nave. El plano ampliado se abre como capa `position:fixed` (z-index 9999) en `document.body`.

## Coordenadas

- Metros del mundo, plano XZ. X va hacia la proa (derecha del plano) y Z crece hacia abajo.
- El yaw es el de una cámara de three.js con `rotation.order = 'YXZ'`. Con `yaw = 0` se mira a −Z y con `yaw = −π/2` a +X (proa). El vector adelante es `(−sin yaw, −cos yaw)`.

## Layout

Acepta el `layout.json` de la nave tal cual, o el formato corto:

| Campo | Tipo | Notas |
|---|---|---|
| `rooms[]` | `{ id, name, x, z, w\|width, d\|depth, spawn?, sub?, short?, color?, kind? }` | Un id o nombre que empieza por "pasillo" se trata como pasillo. `short` es el nombre que sale en el minimapa (por defecto quita "Sala de"). `color` acepta `'#hex'` o `0xRRGGBB`. Si falta el ancho o el fondo, o un id está repetido, salta un error claro. |
| `rooms[].spawn` | `{ x, z, yaw }` | Destino del teletransporte. Si falta, se calcula justo dentro de la puerta que da al pasillo, mirando hacia dentro. |
| `doors[]` | `{ x, z, w\|width, d\|depth, between?:[a,b] \| a?, b? }` | Se dibujan como marcas. Estar en una puerta no cuenta como salir de la estancia, así que no hay parpadeo de "en tránsito". |
| `windows` | `[{ x, z, w, d }]` o el texto de `layout.json` | Franjas luminosas. Del texto se lee cada tramo separado por `;` con sus rangos `x=a..b` y `z=a..b`. |
| `ship` / `bounds` | `{ x, z, width, depth }` / `{ x0, z0, x1, z1 }` | Con `ship`, el casco va por las paredes exteriores. Sin él, se deja un margen alrededor de las salas. |
| `hull` | `'auto'` \| path SVG \| `false` | Silueta del casco. |
| `engines` | `3` \| `2` \| `1` \| `0` | Motores dibujados en la popa. Por defecto 3, como el modelo exterior de vuelo libre. |
| `name`, `deck` | texto | Título y antetítulo del plano ampliado. |

## API

`init(container, layout, opciones?)` devuelve:

| Método | Qué hace |
|---|---|
| `setPlayer(x, z, yaw)` | Mueve el marcador, resalta la estancia actual ("Estás aquí") y emite `onRoomChange` al cambiar de estancia. Tarda unos 8 µs por llamada y, si nada cambió, no toca el DOM. |
| `onTeleport(cb)` | `cb({ roomId, room, x, z, yaw, from, via })`. Devuelve la función de baja. **No mueve al jugador** salvo con `autoMove: true`. `via` puede ser `click`, `key` o `api`. |
| `onRoomChange(cb)` | `cb({ room, prev })`. `room` es `null` fuera de toda estancia. |
| `onToggle(cb)` | `cb(abierto, { via })`. Al abrir, `via` es `click`, `key` o `api`. Al cerrar es `escape`, `key`, `close`, `backdrop`, `teleport`, `api` o `dispose`. Tras `escape` no pidas `requestPointerLock`: Esc no cuenta como gesto del usuario y el navegador lo rechaza. |
| `setOthers(lista, { yawOffset })` | Dibuja otros visitantes: `[{ id, name?, x, z, yaw?, color? }]`. Los que ya no vienen desaparecen. Los nombres se colocan sin solaparse. Se puede llamar cada frame. |
| `setRoomCounts({ puente: 2, … })` | Muestra en el plano ampliado la insignia "N visitantes" en cada sala. |
| `teleportTo(id)` | Teletransporta por código, por ejemplo desde la consola de a bordo. |
| `expand()` / `collapse()` / `toggle()` / `isExpanded()` | Controlan el plano ampliado. |
| `roomAt(x, z)`, `currentRoom()`, `getRoom(id)`, `getLayout()` | Consultas. Devuelven copias, así que tocarlas no cambia el mapa. |
| `setLayout(layout)` | Cambia de cubierta o de layout en caliente. |
| `version` | `'2.0.0'`. |
| `dispose()` | Si el plano está abierto, lo cierra (emite `toggle(false, { via: 'dispose' })`). Luego quita el DOM, los listeners, los temporizadores, los observadores y el CSS compartido. Se puede llamar varias veces. |

También exporta `fromGrid`, `parseWindows`, `yawFromDir` y `colorFromId`.

### Opciones

| Opción | Por defecto | Qué hace |
|---|---|---|
| `bare` | `false` | Minimapa sin fondo, borde ni desenfoque propios. Úsalo si el host ya pone el panel (`#mini` en la nave). |
| `keyboard` / `toggleKey` | `true` / `'KeyM'` | Atajo para abrir y cerrar. Se ignora al escribir en campos de texto, si el host ya consumió la tecla (`preventDefault`), si el minimapa está oculto o si otra capa lo tapa (universo, pausa, paneles). |
| `canToggle(e)` | `null` | Filtro extra del host. Devuelve `false` para ignorar la M. |
| `closeOnTeleport` / `closeDelay` | `true` / `260` | Cierra el plano después de elegir destino. |
| `releasePointer` | `true` | Al abrir, sale del pointer lock después de emitir `onToggle(true)`. |
| `autoMove` | `false` | Mueve el marcador al destino sin esperar al host. |
| `teleportCorridors` | `true` | Permite elegir también los pasillos. |
| `trail` | `true` | Estela de 24 puntos. |
| `title`, `hint`, `noseLength`, `mode` | — | Textos, largo de la proa y `'expanded'` para abrir el plano al iniciar. |

## Accesibilidad

- Minimapa: es un botón con la etiqueta "Abrir el plano de la nave. Estás en …", que se actualiza al cambiar de estancia.
- Plano ampliado: es un diálogo modal. El foco empieza en tu sala, las flechas mueven el foco por el plano, Tab no sale del diálogo e Intro o Espacio teletransportan.
- La sala actual lleva `aria-current="location"`.
- Respeta `prefers-reduced-motion`.
- En pantallas táctiles cambian los textos ("Toca…", "Cerrar"), los efectos hover se desactivan y no salen las pistas de teclado.

## Estilo

Todo va prefijado con `.mn`, con `pointer-events: auto`, así que funciona dentro de HUDs con `pointer-events: none`. Las variables CSS se pueden sobrescribir en el contenedor: `--mn-bg`, `--mn-line`, `--mn-fg`, `--mn-muted`, `--mn-accent`, `--mn-glow`, `--mn-player`, `--mn-hull`, `--mn-blur`, `--mn-font`, `--mn-display`, `--mn-mono`.

## Integración en la nave (estado a 2026-11-06)

`nave-3d/integracion.js` ya lo monta en `#mini`, con fundido al teletransportarse y modal mientras el plano está abierto. Lo he comprobado dentro de la nave 3D real: la M abre el plano y al tocar "Sala de juegos" te lleva allí. Mejoras recomendadas:

1. Pasar `{ bare: true }`, o quitar el fondo y el borde de `#mini`, para que no salga un panel dentro de otro.
2. Cuando llegue el multijugador: `mj.onRooms(c => mapa.setRoomCounts(c))`, y en cada frame `mapa.setOthers(mj.sample(), { yawOffset })`. Usa como `yawOffset` la diferencia entre el yaw que envías en `sendPose` y el de la cámara. Si envías `player.yaw + Math.PI`, pasa `-Math.PI`.
