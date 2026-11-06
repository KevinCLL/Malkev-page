# Desplegar La Malkevnia en el servidor Hetzner

Guía para poner la web en el mismo servidor que El Dragón Cojo **sin tocarlo**:
proyecto Docker Compose propio (`malkevnia`), red propia y base de datos propia.
La web solo escucha en `127.0.0.1:4321` y el proxy inverso que ya tenga el servidor
la publica con HTTPS.

> Nada de esto cambia la web actual hasta el paso 6 (DNS). Hasta entonces,
> malkevnia.com sigue saliendo de GitHub Pages.

## 0. Mira qué hay ya en el servidor

```bash
ssh usuario@servidor
docker --version && docker compose version     # hace falta Compose v2
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
sudo ss -tlnp | grep -E ':(80|443|4321|5432)\b'
```

Apunta **quién escucha en 80/443**: es el proxy que tendrás que configurar en el paso 4
(Caddy, Nginx o Traefik, en Docker o instalado en el sistema). Si el 4321 está ocupado,
elige otro puerto y ponlo en `WEB_PORT`.

## 1. Clona el repositorio

```bash
sudo mkdir -p /srv/malkevnia && sudo chown "$USER" /srv/malkevnia
git clone https://github.com/KevinCLL/Malkev-page.git /srv/malkevnia
cd /srv/malkevnia
git checkout claude/astro-malkevnia-6z0vp0      # o master cuando se fusione
```

## 2. Configura

```bash
cd web
cp .env.example .env
# Genera una contraseña y ponla en POSTGRES_PASSWORD:
openssl rand -base64 24
nano .env
```

`DATABASE_URL` no hace falta en `.env`: docker-compose la construye con la contraseña.

## 3. Levanta la web y la base de datos

```bash
docker compose up -d --build
docker compose ps                         # web y db en "healthy"
docker compose exec web node scripts/seed.mjs   # solo la primera vez: carga la bitácora
curl -s http://127.0.0.1:4321/api/salud   # {"estado":"ok","baseDeDatos":"ok"}
```

### 3b. Con el catálogo (base de datos y panel)

Cuando el PR del catálogo (`packages/catalogo`) esté en el repo, levántalo junto a la web.
Así hay **una sola base de datos** (la del servicio `db`) y la web lee todo de su API:

```bash
# En .env: ADMIN_PASSWORD (la del capitán para /admin) y, si quieres, TMDB_API_KEY
docker compose -f docker-compose.yml -f docker-compose.catalogo.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.catalogo.yml exec catalogo npm run seed   # primera vez
curl -s http://127.0.0.1:4400/api/v1 | head -c 200
```

En este modo no hace falta el `seed.mjs` de la web. Para no repetir los `-f`, pon en `.env`:
`COMPOSE_FILE=docker-compose.yml:docker-compose.catalogo.yml`.

## 4. Publica con el proxy inverso

Elige el bloque según lo que encontraste en el paso 0.

**Caddy** (`Caddyfile`), que saca el certificado solo:

```caddy
www.malkevnia.com {
    redir https://malkevnia.com{uri} permanent
}
malkevnia.com {
    encode zstd gzip
    # Solo con el catálogo: panel y API pública (comentarios incluidos)
    @catalogo path /admin /admin/* /api/v1 /api/v1/*
    reverse_proxy @catalogo 127.0.0.1:4400
    reverse_proxy 127.0.0.1:4321
}
```

**Nginx** (`/etc/nginx/sites-available/malkevnia.com`) y luego
`sudo certbot --nginx -d malkevnia.com -d www.malkevnia.com`:

```nginx
server {
    listen 80;
    server_name malkevnia.com www.malkevnia.com;
    # Solo con el catálogo: panel y API pública
    location ~ ^/(admin|api/v1)(/|$) {
        proxy_pass http://127.0.0.1:4400;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;
    }
    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Proxy dentro de Docker** (Caddy/Nginx/Traefik en un contenedor): `127.0.0.1` no
sirve desde dentro de otro contenedor. Une la web a la red del proxy y apunta a
`malkevnia-web-1:4321`:

```yaml
# docker-compose.override.yml en web/
services:
  web:
    networks: [interna, proxy]
networks:
  proxy:
    external: true
    name: <red-del-proxy>   # docker network ls
```

Con Traefik, añade además las `labels` de router con `Host(\`malkevnia.com\`)` como en
los servicios de El Dragón Cojo.

## 5. Prueba antes de cambiar el DNS

Desde tu PC, fuerza la resolución contra el servidor sin tocar el DNS público:

```bash
curl -I --resolve malkevnia.com:443:<IP-del-servidor> https://malkevnia.com/
```

(Con Caddy/certbot el certificado solo se emite cuando el DNS ya apunta al servidor;
hasta entonces prueba con `curl -k` o con un subdominio de prueba como `nave.malkevnia.com`.)

## 6. Cambia el DNS (el paso que ya se nota)

Hoy malkevnia.com apunta a las IP de GitHub Pages y `www` es un CNAME a `kevincll.github.io`.

1. Baja el TTL de esos registros a 300 s un día antes.
2. Cambia los registros `A` de `malkevnia.com` a la IP del servidor (y el `AAAA` si tiene IPv6;
   borra los `AAAA` de GitHub si los hay).
3. Cambia `www` a un `CNAME` hacia `malkevnia.com` (o un `A` a la misma IP).
4. En GitHub → Settings → Pages del repo, quita el dominio personalizado para que Pages
   no reclame malkevnia.com (el fichero `CNAME` de la raíz se puede borrar al fusionar).

**Vuelta atrás:** restaura los registros `A` de GitHub Pages
(185.199.108.153, .109.153, .110.153, .111.153) y el CNAME de `www`; la web Jekyll sigue en master.

## Mantenimiento

```bash
# Actualizar a la última versión
cd /srv/malkevnia && git pull && cd web && docker compose up -d --build

# Copia de seguridad de la base de datos (ponlo en cron, p. ej. cada noche).
# Con el catálogo, guarda también el volumen de imágenes subidas (malkevnia_subidas).
docker compose exec -T db pg_dump -U malkevnia malkevnia | gzip > ~/backups/malkevnia-$(date +%F).sql.gz

# Restaurar
gunzip -c malkevnia-AAAA-MM-DD.sql.gz | docker compose exec -T db psql -U malkevnia malkevnia

# Logs
docker compose logs -f web
```

## Pendiente antes de abrir al público

- Comentarios: la web Jekyll usa Cusdis. El catálogo ya tiene `GET/POST /posts/:slug/comments`
  con moderación; falta el formulario en `/bitacora/<slug>`.
- `/consola` es solo un marcador: el panel de verdad es `/admin` del catálogo, con login.
- Los 35 posts de `_posts/` con `published: false` no salen en la web (es lo esperado).
