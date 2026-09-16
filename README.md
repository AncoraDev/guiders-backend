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
| Comercial 1 (Demo Company) | `comercial1@rmotion.com` | `Comercial123!` |
| Comercial 2 (Demo Company) | `comercial2@rmotion.com` | `Comercial123!` |

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
