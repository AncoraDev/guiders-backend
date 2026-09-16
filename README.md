# Guiders Backend

API + WebSocket. Documentación: [docs/README.md](docs/README.md).

Orden local: **Docker → API → Console / Admin**. WordPress es opcional (visitante).

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
| Admin (Demo Company) | `admin@rmotion.com` | `Admin123!` |
| Comercial (Demo Company) | `comercial@rmotion.com` | `Comercial123!` |

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

### WordPress (visitante)

http://localhost:8090

Sin login. Es la web del cliente con el widget.

```bash
cd guiders-sdk
npm install              # primera vez
npm start                # WordPress + webpack del SDK
```

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
