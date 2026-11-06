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

| Ruta | Sala | Módulo (carpeta · página) |
| --- | --- | --- |
| `/` | Puente de mando | página Astro |
| `/nave` | Paseo por la nave en 3D (dentro: sala recreativa, sala de máquinas, consola…) | `nave-3d` · `index.html` |
| `/bitacora`, `/bitacora/<slug>` | Bitácora del capitán | páginas Astro con datos de la API del catálogo, PostgreSQL o `bitacora/posts.json` |
| `/sala-de-juegos` | Kallax con los juegos de mesa | `kallax-3d` · `index.html` (aún no existe) |
| `/sala-de-proyeccion` | Filmoteca | `sala-cine` · `index.html` |
| `/biblioteca` | Libros y manga | `libreria-3d` · `index.html` |
| `/ordenador` | Ordenador de a bordo | `ordenador-abordo` · `ordenador-de-a-bordo.html` (sin él, terminal Vue mínima) |
| `/plano` | Plano de la nave | `mapa-nave` · `demo.html` |
| `/rumbo` | El universo de La Malkevnia | `universo-3d` · `index.html` |
| `/vuelo-libre` | Pilotar la nave | `vuelo-libre` · `index.html` |
| `/planetas` | Planetas procedurales | `planetas-procedurales` · `demo.html` |
| `/sala-de-maquinas` | Rendimiento y diagnóstico | `rendimiento` · `demo/index.html` |
| `/consola` | Panel de administración | pendiente (lo trae el catálogo en `/admin`) |

Los módulos que son librerías (`audio-nave`, `controles-moviles`, `multijugador`,
`planetas-hobby`) no tienen sala propia: los integra `nave-3d`.

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

Si la página de entrada del módulo existe, la sala la monta a pantalla completa
(se sirve en `/modulos/<nombre>/…`); si no, enseña un marcador "Sala en obras".
La carpeta y la página de cada sala están en `src/lib/salas.ts` (`modulo` y `entrada`):
léelas del README de cada módulo. Las rutas relativas entre módulos que asumen la
estructura de la carpeta del proyecto (`nave-3d/modulos/audio-nave/…`,
`nave-3d/universo-3d/…`) se resuelven solas.
Los módulos de solo datos (como `bitacora/posts.json`) los leen las páginas Astro.

## Base de datos

La fuente de verdad será la **API del catálogo** (hilo de base de datos y panel, PR #4,
`packages/catalogo`): define `CATALOGO_API_URL` y la bitácora sale de ahí. El esquema
propio de `db/migrations/` es provisional y se retirará cuando el catálogo entre en
el `docker-compose.yml`.

Migraciones SQL en `db/migrations/`, aplicadas en orden por `npm run db:migrate`
(el contenedor lo hace solo al arrancar). Tablas: `entradas` (bitácora),
`comentarios` y `piezas` (juegos de mesa, videojuegos, películas, series, libros, manga).

## Despliegue

Ver [DESPLIEGUE.md](DESPLIEGUE.md).
