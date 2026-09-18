# Docker — Guiders Backend

Todo el material Docker del backend vive aquí. Ejecuta los comandos **desde la raíz del repo**.

## Ficheros

| Archivo | Uso |
|---------|-----|
| `docker-compose.yml` | Desarrollo local (Postgres, Mongo, Redis, Keycloak…) |
| `docker-compose-staging.yml` | Staging (deploy) |
| `docker-compose-prod.yml` | Producción (referencia / uso explícito) |
| `docker-compose.e2e.yml` | Stack E2E en CI |
| `Dockerfile` | Imagen de la app (contexto = raíz del repo) |
| `Dockerfile.e2e` | Imagen E2E + entrypoint de seed |
| `docker-entrypoint.e2e.sh` | Migraciones + seed + start (E2E) |

## Desarrollo local

```bash
# Desde la raíz del repo
docker compose -f docker/docker-compose.yml up -d

# O con npm
npm run docker:up
npm run docker:down
npm run docker:ps
```

Los volúmenes que montan scripts usan rutas `../scripts/...` (relativas a este directorio).

### Cuidado: un Postgres nativo puede tapar al del compose

Si tienes un Postgres instalado en el sistema (por ejemplo `brew services start postgresql@16`),
escuchará en `127.0.0.1:5432` y `[::1]:5432`, mientras el contenedor publica `*:5432`. Como el
`.env` usa `DATABASE_HOST=localhost`, **la app se conecta al Postgres nativo, no al contenedor**.

Consecuencia práctica: `docker exec postgres psql -U postgres -d guiders` inspecciona **otra**
base de datos distinta a la que usa NestJS, así que las migraciones o los `ALTER TABLE` que
lances por ahí no tienen ningún efecto sobre la app.

Para saber contra qué base de datos estás trabajando:

```bash
# Quién escucha realmente en el 5432
lsof -nP -iTCP:5432 -sTCP:LISTEN

# La base de datos que ve la app (misma ruta que DATABASE_HOST=localhost)
psql -h 127.0.0.1 -p 5432 -U postgres -d guiders -c '\dt'
```

Si aparece un proceso `postgres` propio junto a `com.docker`, párralo
(`brew services stop postgresql@16`) o cambia `DATABASE_PORT` para apuntar sin ambigüedad al
contenedor. Ejecuta siempre `npm run typeorm:migrate:run` contra la base de datos que resuelve
`DATABASE_HOST`.

## Build de imagen

```bash
# Contexto siempre la raíz del monorepo/backend
docker build -f docker/Dockerfile -t guiders-backend .
docker build -f docker/Dockerfile.e2e -t guiders-backend-e2e .
```

## E2E

```bash
docker compose -f docker/docker-compose.e2e.yml up -d --wait
docker compose -f docker/docker-compose.e2e.yml down -v
```

## Deploy

Los workflows de GitHub Actions suben `docker/docker-compose-*.yml` al servidor en `…/docker/` y ejecutan:

```bash
docker compose -f docker/docker-compose-staging.yml --env-file .env.staging up -d
```

Más detalle: [`docs/ops/docker-compose-staging.md`](../docs/ops/docker-compose-staging.md).
