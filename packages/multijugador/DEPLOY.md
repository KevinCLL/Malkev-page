# Despliegue en el Hetzner (nota, sin desplegar)

Nada de esto está desplegado. Son los pasos para cuando la nave nueva viva en el
Hetzner junto a El Dragón Cojo. Hoy malkevnia.com está en GitHub Pages, que no
puede servir WebSockets, así que el multijugador necesita este servicio aparte.

## 1. Levantar el contenedor

```bash
git clone https://github.com/KevinCLL/Malkev-page.git
cd Malkev-page/packages/multijugador
# tu clave de capitán, para poder llamarte "Malkev" a bordo (guárdala en tu gestor de contraseñas)
echo "MJ_CAPTAIN_KEY=$(openssl rand -hex 24)" > .env
docker compose up -d --build
curl http://127.0.0.1:8787/health   # -> ok
```

El servicio solo escucha en `127.0.0.1:8787`; no abre puertos al exterior. Va con
sistema de archivos de solo lectura, sin capacidades, 128 MB y medio núcleo.

## 2. Publicarlo detrás del proxy inverso

El cliente se conecta a `wss://malkevnia.com/mj/ws`. Elige el bloque según el
proxy que ya use El Dragón Cojo (sin verificar todavía cuál es).

Caddy:

```caddy
malkevnia.com {
    handle_path /mj/* {
        reverse_proxy 127.0.0.1:8787
    }
    # ... resto del sitio
}
```

nginx:

```nginx
location /mj/ {
    proxy_pass http://127.0.0.1:8787/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
}
```

`TRUST_PROXY=1` hace que el límite por IP use la **última** dirección de
`X-Forwarded-For`, la que añade tu proxy. Déjalo solo si el puerto queda en
`127.0.0.1`, como en el compose. Si algún día pones Cloudflare delante,
configura el proxy para que esa última dirección sea la del visitante
(`real_ip_header CF-Connecting-IP` con `set_real_ip_from` en nginx, o
`trusted_proxies` en Caddy); si no, todos compartirían la IP de Cloudflare y el
límite de 4 pestañas por IP los dejaría fuera.

## 3. Variables

| variable | valor en compose | notas |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `https://malkevnia.com,https://www.malkevnia.com` | añade `http://localhost:5173` para probar en local |
| `MAX_PLAYERS` | `64` | |
| `MAX_PER_IP` | `4` | |
| `TICK_HZ` | `10` | instantáneas por segundo |
| `TRUST_PROXY` | `1` | |
| `RESERVED_NAMES` | `Malkev` | separados por comas |
| `CAPTAIN_KEY` | de `.env` | 24+ caracteres; vacío = nadie usa los nombres reservados |

## 4. Comprobar

```bash
curl https://malkevnia.com/mj/health
curl https://malkevnia.com/mj/stats    # { "players": 0, "rooms": {}, "max": 64 }
docker logs -f malkevnia-multijugador
```

Consumo esperado: unos pocos KB/s por visitante a 10 Hz; 64 visitantes caben de
sobra en el contenedor.

## 5. Entrar como capitán

En la nave, pasa la clave al conectar: `connect(url, 'Malkev', { key })`. No la
pongas en el código público: guárdala en el `localStorage` de tu navegador desde
la consola de la nave o pégala a mano. Quien no la tenga y se llame `Malkev`,
`Ma1kev` o parecido entra como `Viajero-…`.

## 6. Actualizar

```bash
git pull && docker compose up -d --build
```
