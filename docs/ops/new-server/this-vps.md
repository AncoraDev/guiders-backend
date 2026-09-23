# Este VPS (2026-09-23)

Datos del panel. No hay dominio todavía: DNS y certbot esperan `__DOMAIN__`.

| Campo | Valor |
|-------|--------|
| IP pública | `187.33.147.104` |
| SO | Ubuntu 26.04 (64-bit) |
| CPU | 1 vCore |
| RAM | 4 GB |
| Disco | 10 GB SSD |
| Coste panel | ~8,51 €/mes |

`PROD_HOST` / `STAGING_SSH_HOST` el primer día: **`187.33.147.104`**.
Registros A: todos a esa IP ([dns-and-nginx.md](./dns-and-nginx.md)).

## Cabe en esta máquina, con matices

El stack completo (Postgres + Mongo + Redis + Keycloak + Nest + nginx) **cabe
en 4 GB** si no levantas los contenedores `*-test` y PM2 usa **1 instancia**.
**10 GB de disco es justo**: imágenes Docker + volúmenes + Ubuntu se comen
la mayor parte. Supervisa `df -h` desde el primer día.

En este VPS:

- No arranques `postgres-test` / `mongodb-test` (no uses el profile `test`).
- Swap de 2 GB (el script de bootstrap la crea).
- PM2: [ecosystem.small.config.js](./ecosystem.small.config.js) (`instances: 1`,
  restart a 800 MB). El `ecosystem.config.js` del repo pide 2 workers y 2 GB.
- Bind de DBs a `127.0.0.1` (ufw no abre 5432/27017/6379/8080).
- Staging en el mismo host: no. No cabe.

Si Keycloak o Mongo se quedan sin disco, sube el volumen **antes** de
acumular datos; no esperes a `no space left on device`.

## Bootstrap (hecho 2026-09-23)

- SSH por clave (`id_ed25519` de Sergi) en `root` y `deploy`.
- Docker 29, Compose v5, Node 20.20, PM2, nginx, certbot, fail2ban, ufw 22/80/443.
- Dirs `/var/www/guiders-backend` y `/var/www/guiders-frontend`.
- Swap 2 GB. PM2: [ecosystem.small.config.js](./ecosystem.small.config.js) en el server.
- Disco ~5,5 GB libres (42 %). No levantar contenedores `*-test`.

## Siguiente paso

Hace falta el **dominio** (`__DOMAIN__`). Sin FQDN no hay certbot, Keycloak
ni `environment.prod.ts`. Luego: `.env.production` → Docker (sin profile
test) → nginx → primer deploy.
