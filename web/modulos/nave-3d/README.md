# La Malkevnia · nave navegable (punto de montaje para módulos)

Página: `index.html` (Three.js 0.160.0 por importmap: `three` y `three/addons/` desde cdn.jsdelivr.net).
Plano en metros: `layout.json` (salas con rectángulo y spawn, puertas, ventanas).

## Coordenadas
- Unidades: metros. Suelo y = 0, techo y = 3.0. Rejilla de 1,5 m (38 × 16 casillas).
- Proa hacia +X (puente, x 43.5–55.5). Popa en x = 0 (sala de máquinas).
- yaw = 0 mira a −Z; yaw = −π/2 mira a +X. forward = (−sin yaw, 0, −cos yaw).
- Puertas automáticas de 2,3 m de alto, 3 m de ancho.

| id | sala | x0–x1 | z0–z1 |
|---|---|---|---|
| maquinas | Sala de máquinas | 1.5–10.5 | 1.5–22.5 |
| recreativa | Sala recreativa | 12–21 | 1.5–9 |
| proyeccion | Sala de proyección (cine, pantalla en z=1.5) | 22.5–31.5 | 1.5–9 |
| bitacora | Bitácora | 33–42 | 1.5–9 |
| pasillo | Pasillo central | 10.5–43.5 | 10.5–13.5 |
| juegos | Sala de juegos (Kallax contra la pared z=22.5) | 12–21 | 15–22.5 |
| biblioteca | Biblioteca (estanterías en x=22.5 y x=31.5) | 22.5–31.5 | 15–22.5 |
| ordenador | Ordenador de a bordo | 33–42 | 15–22.5 |
| puente | Puente de mando (mesa holográfica en x≈46.9, z=12) | 43.5–55.5 | 1.5–22.5 |

## API: `window.Malkevnia` (también evento `malkevnia:ready`)
```js
const handle = await Malkevnia.registerModule('juegos', {
  async mount(ctx) {
    // ctx: THREE, scene, group (añade aquí tus objetos), room {x0,x1,z0,z1,cx,cz,height,name,color},
    //      rooms, camera, renderer, player {x,z,yaw,pitch},
    //      addCollider(x0,z0,x1,z1), addInteract({x,z,r,label,run}), onFrame((t,dt)=>{}),
    //      showPanel(eyebrow,title,text), suspend() / resume() (pausa controles para UIs propias), teleport(x,z,yaw)
  },
  update(t, dt) {},   // opcional, cada frame
  unmount() {},       // opcional
}, { replace: true }); // replace (por defecto true): quita el mobiliario provisional de esa sala
handle.unmount();
```
Reglas para módulos: ES module, importar three como `'three'` (misma versión 0.160.0), no crear otro renderer ni otro bucle salvo modos a pantalla completa (como el universo), no capturar teclado global mientras no esté activo, todo el texto en español.

## Ganchos para capas externas (versión unificada)
- `window.MALKEVNIA_DATA = { films }` antes de cargar la página: sustituye la filmoteca de ejemplo del cine.
- `window.MALKEVNIA_EXTRA = ['./capa.js', …]`: al terminar los montajes, `integracion.js` importa cada URL (relativa a la página) y llama a su `export default (N) => {}`.
- `N` (lo que recibe cada capa) incluye: `THREE, scene, camera, renderer, player, rooms, interact, anim, addCol, showPanel, suspend, resume, teleport, openUniverse, useNearest, lock, TOUCH, $`, y además `captures` (array de funciones `(KeyboardEvent) => bool`; la primera que devuelve true se queda la tecla), `centerRay()`, `fadeTo(fn)`, `goRoom(id)`, `spawnOf(id)`, `layout`, `modules` (instancias montadas: mapa, controles, cielo, terminal, bitacora, libreria, kallax, cine, planetaProa), `mode(m, id)` y `loading(nombre, texto, ok)`.
- Evento `malkevnia:mode` con `detail { mode: 'universo' | 'superficie' | 'vuelo' | 'nave', id }` al entrar y salir de cada modo a pantalla completa.
- Eventos `malkevnia:start` (clic en Embarcar, con gesto de usuario), `malkevnia:room` (`detail { id, prev }`) y `malkevnia:modules` (`detail { failed }`).
- `window.Malkevnia.modules` y `window.Malkevnia.layout` también quedan accesibles.

## Universo
La mesa holográfica del puente hace `import('./universo-3d/universo.js')` y llama a `createUniverse({ canvas, container, onExit, intro: false })`; el ordenador (`rumbo <planeta>`) abre el mismo universo en ese planeta. El sillón del capitán abre `modulos/vuelo-libre/vuelo-libre.js` y la lanzadera `modulos/planetas-hobby/planetas-hobby.js`.
