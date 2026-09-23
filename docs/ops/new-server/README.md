# Instalación en un servidor nuevo

Guía operativa para levantar Guiders **desde cero** en un VPS (Ubuntu 22.04+).
No es un monorepo en el servidor: tres repos independientes se despliegan por
GitHub Actions hacia el mismo host, detrás de nginx.

**VPS actual:** IP `187.33.147.104` (Ubuntu 26.04, 1 vCPU, 4 GB, 10 GB).
Inventario y límites: [this-vps.md](./this-vps.md). Bootstrap: [bootstrap.sh](./bootstrap.sh).

| Documento | Contenido |
|-----------|-----------|
| [dns-and-nginx.md](./dns-and-nginx.md) | FQDN, mapa nginx, plantillas TLS + WebSocket |
| [vps-bootstrap.md](./vps-bootstrap.md) | Docker, Node 20, PM2, dirs, firewall, SSH |
| [secrets.md](./secrets.md) | Secrets de GitHub, OIDC, `environment.prod.ts` |
| [env.production.example](./env.production.example) | `.env.production` con placeholders |
| [first-deploy.md](./first-deploy.md) | Checklist de encendido (Docker → login) |
| [diario.md](./diario.md) | Qué hicimos, con fecha (para aprender) |
| [this-vps.md](./this-vps.md) | IP y límites de **esta** máquina |
| [bootstrap.sh](./bootstrap.sh) | Script root: Docker, Node 20, PM2, dirs, ufw |
| [nginx/](./nginx/) | Sitios nginx (`__DOMAIN__` → tu dominio) |

**Convención de hostnames** (sustituye `__DOMAIN__`, p. ej. `midominio.com`):

| Rol | FQDN | Destino en el VPS |
|-----|------|-------------------|
| API / BFF / WebSocket | `api.__DOMAIN__` | PM2 Nest `127.0.0.1:3000` |
| Console | `console.__DOMAIN__` | `/var/www/guiders-frontend/current/console` |
| Admin | `admin.__DOMAIN__` | `/var/www/guiders-frontend/current/admin` |
| Keycloak | `auth.__DOMAIN__` | Docker `127.0.0.1:8080` |
| Demo pixel | `guiders-demo.__DOMAIN__` | `/var/www/guiders-demo` |
| Apex (opcional) | `__DOMAIN__` / `www.__DOMAIN__` | 301 → `https://console.__DOMAIN__` |

El SDK **no** se instala en este VPS. Se publica por GitHub Release del repo
`guiders-sdk`; `GUIDERS_CONFIG` de cada web de cliente apunta a
`https://api.__DOMAIN__/api`.

## Orden de encendido

Hazlo en este orden. No saltes pasos: login BFF falla si Keycloak, cookies o
nginx no coinciden con los mismos FQDN.

1. **DNS** — registros A/AAAA de `api`, `console`, `admin` y `auth` a la IP
   pública del VPS. Espera a que resuelvan (`dig +short api.__DOMAIN__`).
2. **Bootstrap del VPS** — [vps-bootstrap.md](./vps-bootstrap.md): usuario
   deploy, Docker, Node 20, PM2, directorios, firewall 22/80/443.
3. **Secrets + env** — rellena [secrets.md](./secrets.md) en GitHub y copia
   `env.production.example` a `/var/www/guiders-backend/.env.production` con
   valores reales (nunca commits de secretos).
4. **Docker** — Postgres, Mongo, Redis, Keycloak:

   ```bash
   cd /var/www/guiders-backend
   docker compose -f docker/docker-compose.yml --env-file .env.production up -d
   ```

   Realm `guiders`, clients públicos `console` y `admin` con los redirect URIs
   nuevos (el job de prod intenta crear el realm si no existe).
5. **nginx + certificados** — copia las plantillas de [nginx/](./nginx/),
   sustituye `__DOMAIN__`, `certbot --nginx` para los cuatro hosts. Detalle en
   [dns-and-nginx.md](./dns-and-nginx.md).
6. **Deploy backend** — merge a `main` o `workflow_dispatch` de
   *Deploy to Production*. El job empaqueta `dist/` + `node_modules`, corre
   migraciones TypeORM y arranca PM2. La rama `sergi-version-v1` **no**
   publica nada hasta merge o dispatch.
7. **Deploy frontend** — push a `main` de `guiders-frontend` (o dispatch).
   `rsync` a `releases/<timestamp>/{admin,console}/` y `ln -sfn` → `current`.
   Antes del primer build de prod, copia los `environment.*.prod.example.ts`
   del frontend a `environment.prod.ts` con los FQDN reales.
8. **Probar login** — Console (`https://console.__DOMAIN__`) y Admin
   (`https://admin.__DOMAIN__`). Cookies BFF: `COOKIE_SECURE=true`,
   `ALLOW_RETURN_TO` con ambas URLs.
9. **SDK** — release WordPress o copiar `dist/index.js`; `GUIDERS_CONFIG`
   apunta a `https://api.__DOMAIN__/api`.

## Acceso CI el primer día

Los workflows de backend **exigían** WireGuard. En un server nuevo es más
simple SSH por clave o contraseña a la IP pública (firewall solo 22/80/443).

- Si `WG_PRIVATE_KEY` está vacío, el job **omite** WireGuard y conecta a
  `PROD_HOST` (hostname o IP pública).
- El frontend ya omitía WireGuard si el secret no existía; ahora también
  omite la verificación VPN en ese caso.

Cuando quieras VPN, crea un peer WireGuard y rellena `WG_*`.

## Qué no está en estos repos

- nginx de producción (ahora versionado aquí como plantilla; hay que
  instalarlo en el VPS).
- Dominios concretos: sustituye `__DOMAIN__` antes de certbot y del primer
  build. No adivines FQDN.
