# Guiders Backend

API + WebSocket. Documentación: [docs/README.md](docs/README.md).

Orden local: **Docker → API → Console / Admin**. WordPress y la demo de LeadCars son opcionales.

## Accesos local

### Console

Área del equipo comercial del cliente: Atención, chats y ficha del visitante.

http://localhost:4200

```bash
cd guiders-frontend
npm install              # primera vez
npm run serve
```

| Perfil | Usuario | Password |
|--------|---------|----------|
| Admin (Demo Company) | `admin@demo.com` | `Admin123!` |
| Comercial 1 (Demo Company) | `comercial1@demo.com` | `Comercial123!` |
| Comercial 2 (Demo Company) | `comercial2@demo.com` | `Comercial123!` |

### Admin

Plataforma Guiders: alta de clientes y API keys. No es el día a día del comercial.

http://localhost:4201

```bash
cd guiders-frontend
npm install              # primera vez
npm run serve:admin
```

| Perfil | Usuario | Password |
|--------|---------|----------|
| Staff Guiders | `AdminGuiders@guiders.local` | `Admin123!` |

### Keycloak

http://localhost:8080

Sale con Docker del backend (no se levanta solo):

```bash
cd guiders-backend
npm run docker:up
```

| Perfil | Usuario | Password |
|--------|---------|----------|
| Admin (realm master) | `admin` | `admin123` |

### Visitante (SDK)

http://127.0.0.1:8083

Sin login. Web de prueba con el widget (`guiders-sdk`).

```bash
cd guiders-sdk
npm install              # primera vez
npm run demo             # php :8083
```

WordPress (plugin) es opcional: `npm start` → http://localhost:8090

### Demo de proveedor

Simulador de concesionario. El comercial entra en Webseller y Console se abre ya con su sesión.

http://localhost:8095

Ábrelo como `localhost`, no como `127.0.0.1`: el origen del embed tiene que coincidir.

```bash
cd guiders-proveedor
cp .env.example .env     # primera vez
npm install              # primera vez
docker compose up -d     # Postgres en localhost:5435
npm start
```

| Perfil | Usuario | Password |
|--------|---------|----------|
| Admin de plataforma | `admin@leadcars.local` | `leadcars` |

En la portada, **Entrar como admin** abre Clientes y Usuarios. Necesita la API y Console en marcha. El comercial no tiene usuario de Keycloak: entra por el iframe.

La clave del `.env` es la del proveedor. Crear, cambiar o borrar un cliente llama a `/v2/integration/companies` y deja una empresa en el Admin de Guiders, con admin de Keycloak. Los comerciales de ese cliente usan `commercials/sync` y `commercials/remove`. La clave no toca chats, leads, marca, tema ni el embed: eso sigue en el Admin.

### API

http://localhost:3000

Sin usuario de producto. Habla con Console, Admin y el SDK.

```bash
cd guiders-backend
npm install              # primera vez
npm run start:dev
```

Necesita Docker arriba. Si no hay `.env`, cópialo de `.env.test`.

### Docker

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
