# Secrets, OIDC y environment.prod.ts

Valores de ejemplo. **No pongas secretos reales en git.** Sustituye
`__DOMAIN__` y genera claves nuevas (no copies las del VPS viejo).

Tras el primer `.env` correcto, actualiza también
`guiders-frontend/apps/{console,admin}/src/environments/environment.prod.ts`
**antes** del primer build de producción. Plantillas en el repo frontend:
`docs/ops/new-server/`.

## URLs que deben coincidir (mismo `__DOMAIN__`)

| Uso | Valor |
|-----|--------|
| API / BFF | `https://api.__DOMAIN__` |
| REST que consume el SPA | `https://api.__DOMAIN__/api` |
| WebSocket (`wsUrl`) | `https://api.__DOMAIN__` |
| Console | `https://console.__DOMAIN__` |
| Admin | `https://admin.__DOMAIN__` |
| Keycloak issuer | `https://auth.__DOMAIN__/realms/guiders` |
| JWKS | `https://auth.__DOMAIN__/realms/guiders/protocol/openid-connect/certs` |
| OIDC console | `https://api.__DOMAIN__/api/bff/auth/callback/console` |
| OIDC admin | `https://api.__DOMAIN__/api/bff/auth/callback/admin` |
| `ALLOW_RETURN_TO` | `https://console.__DOMAIN__,https://admin.__DOMAIN__` |
| `KEYCLOAK_HOSTNAME` (compose) | `auth.__DOMAIN__` |

Clients Keycloak (realm `guiders`, públicos): `console` y `admin`.
`redirectUris` = las dos filas OIDC de arriba. `webOrigins` = Console y Admin.

Cookies BFF: `COOKIE_SECURE=true`, `SAMESITE=lax`. No hace falta
`COOKIE_DOMAIN` si el SPA llama a `api.__DOMAIN__` con `withCredentials`
(la cookie vive en el host de la API).

## Backend — GitHub secrets (`guiders-backend`)

Settings → Secrets and variables → Actions. El job *Create production
environment config* de `deploy-main.yml` lee estos nombres.

### Servidor y CI

| Secret | Placeholder |
|--------|-------------|
| `PROD_HOST` | `187.33.147.104` (primer día) o `api.__DOMAIN__` / `10.0.0.x` (VPN) |
| `PROD_USER` | `deploy` |
| `PROD_SSH_PASSWORD` | *(o migra el workflow a deploy key)* |
| `PROD_PORT` | `3000` |
| `WG_PRIVATE_KEY` | *(vacío el primer día)* |
| `WG_SERVER_ENDPOINT` | `vps.__DOMAIN__:51820` *(solo si hay VPN)* |

### URLs de app

| Secret | Placeholder |
|--------|-------------|
| `PROD_APP_URL` | `https://api.__DOMAIN__` |
| `PROD_CONSOLE_URL` | `https://console.__DOMAIN__` |
| `PROD_ADMIN_URL` | `https://admin.__DOMAIN__` |
| `PROD_OIDC_CONSOLE_REDIRECT_URI` | `https://api.__DOMAIN__/api/bff/auth/callback/console` |
| `PROD_OIDC_ADMIN_REDIRECT_URI` | `https://api.__DOMAIN__/api/bff/auth/callback/admin` |
| `PROD_KEYCLOAK_ISSUER` | `https://auth.__DOMAIN__/realms/guiders` |
| `PROD_KEYCLOAK_JWKS_URI` | `https://auth.__DOMAIN__/realms/guiders/protocol/openid-connect/certs` |

### Postgres (contenedor en el VPS; host = localhost desde Nest)

| Secret | Placeholder |
|--------|-------------|
| `PROD_DATABASE_HOST` | `localhost` |
| `PROD_DATABASE_PORT` | `5432` |
| `PROD_DATABASE_USERNAME` | `guiders` |
| `PROD_DATABASE_PASSWORD` | `<genera>` |
| `PROD_DATABASE` | `guiders` |

### Mongo + Redis

| Secret | Placeholder |
|--------|-------------|
| `PROD_MONGODB_DATABASE` | `guiders` |
| `PROD_MONGODB_PORT` | `27017` |
| `PROD_MONGODB_ROOT_USERNAME` | `admin` |
| `PROD_MONGODB_ROOT_PASSWORD` | `<genera>` |
| `PROD_MONGODB_USERNAME` | `guiders` |
| `PROD_MONGODB_PASSWORD` | `<genera>` |
| `PROD_REDIS_PORT` | `6379` |
| `PROD_REDIS_URL` | `redis://localhost:6379` |

### Criptografía y tokens

| Secret | Placeholder |
|--------|-------------|
| `PROD_ENCRYPTION_KEY` | 32+ caracteres aleatorios (AES CRM / tokens) |
| `PROD_GLOBAL_TOKEN_SECRET` | 64+ caracteres aleatorios |
| `PROD_ACCESS_TOKEN_EXPIRATION` | `15m` |
| `PROD_REFRESH_TOKEN_EXPIRATION` | `7d` |

```bash
openssl rand -base64 32
openssl rand -base64 64
```

### Keycloak admin (compose + job 7b)

Usa las mismas variables en `.env.production` del server. Nombres típicos
en compose: `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`,
`KEYCLOAK_DB_*`, `KEYCLOAK_HOSTNAME=auth.__DOMAIN__`.

### S3 + LLM

| Secret | Placeholder |
|--------|-------------|
| `PROD_AWS_ACCESS_KEY_ID` | *(IAM con acceso al bucket)* |
| `PROD_AWS_SECRET_ACCESS_KEY` | |
| `PROD_AWS_REGION` | `eu-north-1` |
| `PROD_AWS_S3_BUCKET_NAME` | `guiders-prod` |
| `PROD_AWS_S3_AVATAR_FOLDER` | `avatars` |
| `PROD_GROQ_API_KEY` | `gsk_...` |

Opcionales que el job ya tiene default: `PROD_CONSENT_VERSION`,
`PROD_REDIS_COMMANDER_PASSWORD`, `PROD_MONGO_EXPRESS_PASSWORD`.

## Frontend — GitHub secrets (`guiders-frontend`)

El workflow se llama “staging” y usa secrets `STAGING_*`, pero el build es
**production** (`nx` configuration production).

| Secret | Placeholder |
|--------|-------------|
| `STAGING_SSH_HOST` | `187.33.147.104` (mismo que `PROD_HOST`) |
| `STAGING_SSH_USER` | `deploy` |
| `STAGING_SSH_PORT` | `22` |
| `STAGING_SSH_PASSWORD` | *(o clave; el job usa sshpass)* |
| `STAGING_DEPLOY_PATH` | `/var/www/guiders-frontend` |
| `WG_PRIVATE_KEY` | *(vacío el primer día)* |
| `WG_SERVER_ENDPOINT` | *(solo VPN)* |
| `BACKEND_REPO` | `org/guiders-backend` *(solo job E2E que clona backend)* |
| `BACKEND_REPO_TOKEN` | PAT lectura *(solo ese job)* |

## Frontend — `environment.prod.ts`

Copia desde `guiders-frontend/docs/ops/new-server/` y sustituye `__DOMAIN__`.
No dejes `guiders.es` si el DNS nuevo es otro.

Console (`apps/console/src/environments/environment.prod.ts`):

- `auth.authority` = `https://auth.__DOMAIN__/realms/guiders`
- `auth.secureRoutes` = `['https://api.__DOMAIN__/api']`
- `api.baseUrl` = `https://api.__DOMAIN__/api`
- `api.wsUrl` = `https://api.__DOMAIN__`
- `adminUrl` = `https://admin.__DOMAIN__`

Admin (`apps/admin/src/environments/environment.prod.ts`):

- mismos `authority` y `secureRoutes` / `baseUrl`
- `consoleUrl` = `https://console.__DOMAIN__`

`environment.staging.ts` solo si vas a servir un segundo entorno; si no,
déjalo o alinéalo al mismo mapa para no confundir builds.

## Primer `.env` en el server

Usa [env.production.example](./env.production.example). El workflow
**sobrescribe** `.env.production` en cada deploy de `main` a partir de
secrets. El archivo local sirve para el `docker compose up` inicial
(Keycloak/DBs) antes de que CI exista.
