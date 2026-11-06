# La Malkevnia · nueva malkevnia.com

La web de Malkev como una nave espacial: cada sección es una sala. Astro en modo
servidor (Node) + PostgreSQL, empaquetado en Docker para su servidor Hetzner.

> Estado: **en preparación**. La web en vivo sigue siendo la de Jekyll (raíz del repo,
> GitHub Pages). Esta carpeta está excluida de Jekyll en `_config.yml`.

## Arrancar en local

```bash
cd web
npm install
npm run dev          # http://localhost:4321
```

Sin base de datos ya funciona: la bitácora sale del módulo `modulos/bitacora/posts.json`.
Para probar con PostgreSQL:

```bash
cp .env.example .env               # cambia POSTGRES_PASSWORD
docker compose up -d --build       # web en 127.0.0.1:4321 + PostgreSQL
docker compose exec web node scripts/seed.mjs   # carga la bitácora en la BDD
```

## Salas y rutas

| Ruta | Sala | Módulo que la llena |
| --- | --- | --- |
| `/` | Puente de mando | (página Astro) |
| `/nave` | Paseo por la nave en 3D | `nave-3d` ✔ |
| `/bitacora`, `/bitacora/<slug>` | Bitácora del capitán | `bitacora` (datos) ✔ |
| `/sala-de-juegos` | Kallax con los juegos de mesa | `kallax-3d` |
| `/sala-recreativa` | Videojuegos | `sala-recreativa` |
| `/sala-de-proyeccion` | Filmoteca | `sala-de-cine` |
| `/biblioteca` | Libros y manga | `libreria` |
| `/ordenador` | Terminal de comandos (ya hay una versión mínima en Vue) | `ordenador` |
| `/plano` | Plano de la nave | `plano-nave` |
| `/rumbo` | Vuelo libre por el universo | `vuelo-libre` |
| `/sala-de-maquinas` | Rendimiento y diagnóstico | `sala-de-maquinas` |
| `/consola` | Panel de administración | `consola` |

El registro está en [`src/lib/salas.ts`](src/lib/salas.ts). Rutas extra:
`/feed.xml` (RSS), `/sitemap.xml`, `/api/salud` (salud para Docker) y redirecciones
301 desde las URL antiguas de Jekyll (`/blog/AAAA/MM/DD/slug/`, `/blog.html`, `/archivo.html`).

## Módulos

Los demás hilos del proyecto construyen cada sala como un **módulo**: una carpeta
`/mnt/project-files/modulos/<nombre>/` con un `index.html` autocontenido (más sus
ficheros). Para traerlos:

```bash
npm run modulos:sync     # copia /mnt/project-files/modulos/* a web/modulos/
```

Si `modulos/<nombre>/index.html` existe, la sala lo monta a pantalla completa
(se sirve en `/modulos/<nombre>/…`); si no, enseña un marcador "Sala en obras".
Si un módulo trae otro nombre de carpeta, cambia `modulo` en `src/lib/salas.ts`.
Los módulos de solo datos (como `bitacora/posts.json`) los leen las páginas Astro.

## Base de datos

Migraciones SQL en `db/migrations/`, aplicadas en orden por `npm run db:migrate`
(el contenedor lo hace solo al arrancar). Tablas: `entradas` (bitácora),
`comentarios` y `piezas` (juegos de mesa, videojuegos, películas, series, libros, manga).

## Despliegue

Ver [DESPLIEGUE.md](DESPLIEGUE.md).
