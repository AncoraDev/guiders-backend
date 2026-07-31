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
