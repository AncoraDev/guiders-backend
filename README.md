# Guiders Backend

API + WebSocket. Documentación: [docs/README.md](docs/README.md).

Usuarios y contraseñas: [accesos-local.md](accesos-local.md) y [accesos-produccion.md](accesos-produccion.md). El de producción no se sube a git.

Orden local: **Docker → API → Console / Admin**. WordPress y la demo de LeadCars son opcionales.

## Console

Área del equipo comercial del cliente: Atención, chats y ficha del visitante.

```bash
cd guiders-frontend
npm install              # primera vez
npm run serve
```

## Admin

Plataforma Guiders: alta de clientes y API keys. No es el día a día del comercial.

```bash
cd guiders-frontend
npm install              # primera vez
npm run serve:admin
```

## Keycloak

Sale con Docker del backend (no se levanta solo):

```bash
cd guiders-backend
npm run docker:up
```

## Visitante (SDK)

Web de prueba con el widget (`guiders-sdk`). Sin login.

```bash
cd guiders-sdk
npm install              # primera vez
npm run demo             # php :8083
```

WordPress (plugin) es opcional: `npm start` → http://localhost:8090

## Demo de proveedor

Simulador de concesionario. El comercial entra en Webseller y Console se abre ya con su sesión.

```bash
cd guiders-proveedor
cp .env.example .env     # primera vez
npm install              # primera vez
docker compose up -d     # Postgres en localhost:5435
npm start
```

En la portada, **Entrar como admin** abre Clientes y Usuarios. Necesita la API y Console en marcha. El comercial no tiene usuario de Keycloak: entra por el iframe.

La clave del `.env` es la del proveedor. Crear, cambiar o borrar un cliente llama a `/v2/integration/companies` y deja una empresa en el Admin de Guiders, con admin de Keycloak. Los comerciales de ese cliente usan `commercials/sync` y `commercials/remove`. La clave no toca chats, leads, marca, tema ni el embed: eso sigue en el Admin.

## API

Habla con Console, Admin y el SDK. Sin usuario de producto.

```bash
cd guiders-backend
npm install              # primera vez
npm run start:dev
```

Necesita Docker arriba. Si no hay `.env`, cópialo de `.env.test`.

## Docker

```bash
cd guiders-backend
npm run docker:up
```

Levanta Postgres, Mongo, Redis y Keycloak.

| Servicio | Conexión | Usuario | Password |
|----------|----------|---------|----------|
| PostgreSQL | `localhost:5432` / `guiders` | `postgres` | `postgres` |
| MongoDB | `localhost:27017` / `guiders` | `admin` | `password` |
| Redis | `localhost:6379` | — | — |
| Keycloak DB | `localhost:5434` | `keycloak` | `keycloak` |
