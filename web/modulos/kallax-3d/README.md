# Kallax 3D · módulo para La Malkevnia

Las dos Kallax 5×5 de Malkev con las 310 piezas del inventario (cajas de juegos y libros de rol), pósits, pegatinas de color y las 58 dudas. Las cajas se cogen: salen del cubo, vuelan hacia la cámara enseñando una portada generada y abren una ficha. Se pueden girar arrastrando.

Demo publicada: https://claude.ai/artifact/MPT6nxbbzYirFe4FcwsxQJ

## Ficheros

- `kallax-3d.js`: el módulo (ES module). Importa `three` por import map (three@0.160.0, igual que la nave) y `./kallax-data.js`. No usa addons.
- `kallax-data.js`: los datos, generados desde `poc-malkevnia/kallax-inventario.md`.
- `generar-datos.py`: regenera los datos: `python3 generar-datos.py ../../poc-malkevnia/kallax-inventario.md kallax-data.js`
- `index.html`: demo autónoma (con bloom). `ejemplo-en-escena.html`: ejemplo montado dentro de otra escena con mira central.

Unidades en metros a escala real: cada Kallax mide 1,82 × 1,82 × 0,39 m. El par mide 3,69 m de ancho. El origen del grupo está en el suelo, centrado, y el frente mira a +Z.

## API

```js
import { init } from './modulos/kallax-3d/kallax-3d.js';

// 1) Dentro de la escena de la nave
const k = init(scene, {
  camera,                      // obligatorio
  domElement: renderer.domElement,
  pointer: 'center',           // 'center' = raycast desde la mira; 'mouse' = cursor
  position: new THREE.Vector3(x, 0, z), rotationY: Math.PI, scale: 1,
  search: false,               // oculta el buscador (la ficha sigue)
  ui: true,                    // false = sin DOM; usa los callbacks
  uiContainer: document.body,  // dónde montar la ficha
  actionHint: 'E para coger',
  clickToPick: false,          // en modo center, el clic no coge (usa pickHovered)
  onHover(item) {}, onOpen(item) {}, onClose() {},
  kallaxColor: 0xe8e2f2, ledColor: 0xb08cff,
});
// cada frame:  k.update(dt)   (dt en segundos)
// al salir:    k.dispose()

// 2) Autónomo: crea renderer, cámara con órbita, bodega y bucle propio
const k = init(document.getElementById('app'), { createComposer(renderer, scene, camera) { /* opcional */ } });
```

Devuelve:

| | |
|---|---|
| `group` | `THREE.Group` raíz (muévelo o rótalo si hace falta) |
| `size` | `{ width, height, depth }` en metros |
| `items` | lista de piezas `{ id, name, kallax, cell, place, postit, dot, doubt, doubtText, book, prop }` |
| `update(dt)` | anima tirones, vuelo y giro de la caja cogida |
| `pickHovered()` | coge lo que apunta la mira (para la tecla E) |
| `select(idONombre)` | coge una pieza por id (`K2·F1C2-4-08`) o nombre; útil para el ordenador de a bordo |
| `close()` | devuelve la caja a la Kallax |
| `isOpen`, `hovered` | estado |
| `highlight(texto)` | resalta las coincidencias en la estantería (`null` lo quita) |
| `setPointer(x, y)` | NDC del puntero si lo gestionas tú |
| `dispose()` | quita todo de la escena y libera GPU y DOM |

En la nave: al recibir `onOpen` conviene salir del pointer lock (para poder arrastrar la caja y pulsar en la ficha) y volver a pedirlo en `onClose`. Esc y las flechas ← → funcionan solas mientras la ficha está abierta.
