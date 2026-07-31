# Guiders Backend - Arquitectura del Sistema

**Fecha:** 2026-04-01
**Tipo:** Monolito backend
**Framework:** NestJS v11 + TypeScript 5.8
**Patron arquitectonico:** DDD + CQRS + Arquitectura Hexagonal

---

## Resumen Ejecutivo

Guiders Backend es un monolito modular construido sobre NestJS v11 que sigue los principios de Domain-Driven Design (DDD), Command Query Responsibility Segregation (CQRS) y Arquitectura Hexagonal (Ports & Adapters). El sistema gestiona comunicacion en tiempo real entre visitantes web y agentes comerciales, con capacidades de tracking, scoring de leads e integracion con inteligencia artificial.

La arquitectura se organiza en 15 bounded contexts independientes que comparten infraestructura comun (bases de datos, WebSockets, eventos). Cada contexto sigue una estructura de tres capas estricta: `domain/` (logica de negocio pura), `application/` (orquestacion CQRS), e `infrastructure/` (adaptadores externos).

---

## Stack Tecnologico

### Runtime y Framework

| Componente | Tecnologia            | Version | Proposito                         |
| ---------- | --------------------- | ------- | --------------------------------- |
| Runtime    | Node.js               | >= 20.x | Entorno de ejecucion              |
| Framework  | NestJS                | v11     | Framework backend modular         |
| Lenguaje   | TypeScript            | 5.8     | Tipado estatico                   |
| CQRS       | @nestjs/cqrs          | v11     | Segregacion comandos/consultas    |
| Eventos    | @nestjs/event-emitter | v3      | Publicacion de eventos de dominio |
| Scheduling | @nestjs/schedule      | v6      | Tareas programadas (cron)         |

### Persistencia

| Componente | Tecnologia | Version | Proposito                                 |
| ---------- | ---------- | ------- | ----------------------------------------- |
| Relacional | PostgreSQL | 14      | Datos core (auth, company, legacy)        |
| ORM        | TypeORM    | 0.3     | Mapeo objeto-relacional PostgreSQL        |
| Documental | MongoDB    | 7.0     | Contextos V2 (chats, visitors, etc.)      |
| ODM        | Mongoose   | 8.x     | Mapeo objeto-documento MongoDB            |
| Cache      | Redis      | 6/7     | Cache, sesiones, presencia en tiempo real |

### Comunicacion

| Componente | Tecnologia      | Proposito                              |
| ---------- | --------------- | -------------------------------------- |
| REST API   | Express         | Endpoints HTTP (~145 endpoints)        |
| WebSocket  | Socket.IO       | Comunicacion bidireccional tiempo real |
| Swagger    | @nestjs/swagger | Documentacion interactiva de API       |

### Autenticacion y Seguridad

| Componente | Tecnologia          | Proposito                              |
| ---------- | ------------------- | -------------------------------------- |
| IdP        | Keycloak 26         | Identity Provider (OIDC/PKCE)          |
| JWT        | jsonwebtoken + jose | Tokens de acceso/refresco              |
| API Keys   | RSA 4096 + JWKS     | Autenticacion de visitantes (widget)   |
| BFF        | openid-client       | Backend-For-Frontend con cookies       |
| Sesiones   | express-session     | PKCE state/nonce (Redis store en prod) |

### Integraciones Externas

| Componente | Tecnologia          | Proposito                           |
| ---------- | ------------------- | ----------------------------------- |
| AI/LLM     | Groq SDK            | Integracion con modelos de lenguaje |
| Storage    | AWS S3              | Almacenamiento de archivos/avatares |
| Email      | Nodemailer + Resend | Envio de correos electronicos       |
| Scraping   | Playwright          | Extraccion de contenido web         |

---

## Patron Arquitectonico: DDD + CQRS + Hexagonal

### Arquitectura General

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │ REST API │  │ WebSocket│  │ Swagger  │  │ BFF (OIDC/PKCE) ││
│  │ /api/*   │  │ /socket  │  │ /docs    │  │ /api/bff/*       ││
│  └────┬─────┘  └────┬─────┘  └──────────┘  └────┬─────────────┘│
│       │              │                            │              │
├───────┴──────────────┴────────────────────────────┴──────────────┤
│                    Application Layer (CQRS)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ CommandBus   │  │  QueryBus    │  │  EventBus            │   │
│  │ (Escrituras) │  │ (Lecturas)   │  │ (Efectos laterales)  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                  │                      │              │
├─────────┴──────────────────┴──────────────────────┴──────────────┤
│                     Domain Layer (Pura)                           │
│  ┌────────────┐  ┌────────────┐  ┌────────┐  ┌──────────────┐  │
│  │ Aggregates │  │ Value Objs │  │ Events │  │ Repo Ifaces  │  │
│  │ (Entidades)│  │ (Inmutables)│ │(Domain)│  │ (Contratos)  │  │
│  └────────────┘  └────────────┘  └────────┘  └──────────────┘  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                   Infrastructure Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────┐  ┌───────┐ │
│  │PostgreSQL│  │ MongoDB  │  │ Redis  │  │  S3   │  │ Groq  │ │
│  │ (TypeORM)│  │(Mongoose)│  │(Cache) │  │(Files)│  │ (LLM) │ │
│  └──────────┘  └──────────┘  └────────┘  └───────┘  └───────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Estructura de Capas por Bounded Context

Cada bounded context sigue estrictamente la Arquitectura Hexagonal:

```
src/context/<contexto>/
├── domain/                 # Nucleo de negocio PURO (sin dependencias externas)
│   ├── entities/           # Aggregates que extienden AggregateRoot
│   ├── value-objects/      # Objetos inmutables con validacion
│   ├── events/             # Eventos de dominio
│   ├── services/           # Servicios de dominio (logica entre aggregates)
│   └── <entity>.repository.ts  # Interfaz + Symbol (PORT)
│
├── application/            # Capa de orquestacion
│   ├── commands/           # Operaciones de escritura (@CommandHandler)
│   ├── queries/            # Operaciones de lectura (@QueryHandler)
│   ├── events/             # Manejadores de efectos laterales
│   └── dtos/               # Contratos de API (request/response)
│
└── infrastructure/         # Adaptadores externos (ADAPTERS)
    ├── controllers/        # Endpoints HTTP/WebSocket
    ├── persistence/        # Implementaciones de repositorios
    │   ├── entity/         # Entidades ORM (TypeORM o Mongoose schemas)
    │   └── mappers/        # Transformacion dominio <-> persistencia
    └── services/           # Integraciones externas
```

### Regla de Dependencias (CRITICA)

Las dependencias fluyen SOLO hacia adentro:

```
Infrastructure → Application → Domain
     ↓               ↓            ↓
  Adaptadores    Orquestacion   Logica pura
  (Mongoose,     (Handlers,     (Aggregates,
   Controllers)   DTOs)          VOs, Events)
```

**Prohibido**: Importar desde `infrastructure/` en `domain/` o `application/`.

---

## Patron Result<T, E>

El patron fundamental del sistema para manejo de errores. Reemplaza excepciones por valores tipados:

```typescript
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';

// Metodos del repositorio retornan Result
async findById(id: ChatId): Promise<Result<Chat, DomainError>> {
  const entity = await this.model.findOne({ id: id.value });
  if (!entity) return err(new ChatNotFoundError(id.value));
  return ok(this.mapper.toDomain(entity));
}

// En handlers - verificar antes de unwrap
const result = await this.repo.findById(chatId);
if (result.isErr()) return result;
const chat = result.unwrap(); // Seguro despues de isErr check
```

API del Result:

- `isOk()` / `isErr()` - verificacion de estado
- `unwrap()` - extraccion del valor (solo tras `isOk()`)
- `map(fn)` / `mapError(fn)` - transformacion
- `unwrapOr(default)` - valor por defecto
- `fold(onErr, onOk)` - patron match

---

## Publicacion de Eventos de Dominio

Ciclo de vida obligatorio para publicar eventos:

```typescript
// 1. Merge con contexto de publicacion
const aggregate = this.publisher.mergeObjectContext(chat);

// 2. Aplicar cambios (el aggregate emite eventos internamente)
aggregate.updateStatus(ChatStatus.CLOSED);

// 3. Persistir
const saveResult = await this.chatRepository.save(aggregate);
if (saveResult.isErr()) return saveResult;

// 4. CRITICO: Publicar eventos
aggregate.commit(); // Sin esto, los eventos NO se publican
```

---

## Arquitectura de Datos

### Modelo de Persistencia Dual

El sistema utiliza dos motores de base de datos con propositos complementarios:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL (TypeORM)                           │
│                  Datos Core y Legacy                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │companies │  │company_sites │  │ user_accounts│              │
│  │          │  │              │  │              │              │
│  └──────────┘  └──────────────┘  └──────────────┘              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────┐ │
│  │api_keys  │  │visitor_accts │  │   invites    │  │convos  │ │
│  │          │  │              │  │              │  │(legacy)│ │
│  └──────────┘  └──────────────┘  └──────────────┘  └────────┘ │
│  7 tablas, migraciones controladas via TypeORM CLI              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    MongoDB (Mongoose)                             │
│               Contextos V2 de Alto Rendimiento                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐              │
│  │visitors  │  │ chats_v2 │  │  messages_v2     │              │
│  │  _v2     │  │          │  │  (text index)    │              │
│  └──────────┘  └──────────┘  └──────────────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐              │
│  │ leads    │  │ lead_cars│  │tracking_events   │              │
│  │          │  │          │  │  _YYYY_MM (part) │              │
│  └──────────┘  └──────────┘  └──────────────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐              │
│  │consents  │  │wl_configs│  │web_content_cache │              │
│  │          │  │          │  │  (TTL index)     │              │
│  └──────────┘  └──────────┘  └──────────────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐              │
│  │ llm_chats│  │commercials│ │visitor_sessions  │              │
│  │          │  │          │  │  (TTL index)     │              │
│  └──────────┘  └──────────┘  └──────────────────┘              │
│  15 colecciones, ~99 indices, particionado mensual tracking     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Redis (Cache/Presencia)                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │visitor:status:*  │  │commercial:      │  │bff:sess:*    │   │
│  │visitor:activity:*│  │  status:*       │  │(PKCE/state)  │   │
│  │visitor:user_act:*│  │  activity:*     │  │              │   │
│  └─────────────────┘  └─────────────────┘  └──────────────┘   │
│  Presencia en tiempo real, estado de conexion, sesiones BFF     │
└─────────────────────────────────────────────────────────────────┘
```

### Estrategias de Datos Especiales

1. **Particionado mensual**: Las colecciones de tracking (`tracking_events_YYYY_MM`) se crean dinamicamente por mes para manejar alto volumen de eventos.

2. **Event buffering**: El sistema de tracking acumula eventos en memoria y los persiste en lote para optimizar escrituras.

3. **TTL indexes**: MongoDB gestiona automaticamente la expiracion de datos temporales (cache web, sesiones de visitantes).

4. **Text indexes**: Busqueda full-text en chats y mensajes para funcionalidades de busqueda.

---

## Arquitectura de API

### Prefijo Global

Todas las rutas REST usan el prefijo `/api/` excepto:

- `/docs` - Swagger UI
- `/docs-json` - OpenAPI spec
- `/jwks` - Clave publica JWKS para verificacion de API keys

### Mecanismos de Autenticacion

```
┌─────────────────────────────────────────────────────────────────┐
│                 3 Mecanismos de Autenticacion                    │
│                                                                  │
│  1. JWT Bearer (Usuarios internos)                               │
│     Authorization: Bearer <token>                                │
│     → Keycloak JWKS validation                                   │
│     → Roles: admin, owner, commercial                            │
│                                                                  │
│  2. BFF Cookies (Frontend SPA)                                   │
│     Cookie: access_token=<jwt>, refresh_token=<jwt>             │
│     → HttpOnly, Secure, SameSite=Lax                            │
│     → OIDC/PKCE flow con Keycloak                               │
│     → Sesion PKCE en Redis (15 min TTL)                         │
│                                                                  │
│  3. API Key + Visitor JWT (Widget)                               │
│     X-API-Key: <rsa-signed-key>                                 │
│     → RSA 4096 firma, JWKS endpoint publico                     │
│     → Genera Visitor JWT tras autenticacion inicial              │
│     → Visitor JWT incluye visitorId, companyId                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Arquitectura WebSocket

```
┌──────────────────────────────────────────────────────────────┐
│                    WebSocket Gateway                          │
│                    (Socket.IO)                                │
│                                                              │
│  Salas (Rooms):                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ chat:{chatId}      → Mensajes de chat en tiempo real │   │
│  │ visitor:{visitorId} → Notificaciones al visitante    │   │
│  │ tenant:{companyId}  → Notificaciones empresariales   │   │
│  │ commercial:{userId} → Presencia individual comercial │   │
│  │ visitor:{userId}    → Presencia individual visitante │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Eventos:                                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ chat:join/leave     → Gestion de salas de chat       │   │
│  │ visitor:join/leave  → Gestion de salas de visitante  │   │
│  │ tenant:join/leave   → Gestion de salas de tenant     │   │
│  │ presence:join/leave → Gestion de salas de presencia  │   │
│  │ typing:start/stop   → Indicadores de escritura       │   │
│  │ user:activity       → Heartbeat de actividad         │   │
│  │ test / health-check → Diagnosticos                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Autenticacion WS:                                           │
│  → JWT Bearer token en handshake                             │
│  → visitorId + tenantId sin token (visitantes)              │
│  → Auto-join a salas personales tras autenticacion          │
│                                                              │
│  Presencia:                                                  │
│  → Ping/Pong configurable (25s interval, 20s timeout)       │
│  → Estado: ONLINE → AWAY → OFFLINE                          │
│  → Scheduler de inactividad detecta usuarios inactivos      │
│  → Redis almacena estado de conexion en tiempo real         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Inventario de Bounded Contexts

### Contextos Activos (V2 - MongoDB)

| Contexto         | Responsabilidad                                       | Complejidad |
| ---------------- | ----------------------------------------------------- | ----------- |
| conversations-v2 | Sistema de chat en tiempo real, asignacion automatica | Alta        |
| visitors-v2      | Tracking de visitantes, sesiones, maquina de estados  | Alta        |
| tracking-v2      | Ingesta de eventos de alto rendimiento, particionado  | Media-Alta  |
| leads            | Gestion de leads, sincronizacion CRM (LeadCars)       | Media       |
| llm              | Integracion AI (Groq), tool use, auto-respuestas      | Media       |
| commercial       | Gestion de agentes comerciales, presencia             | Media       |
| white-label      | Personalizacion de marca (colores, logos, fuentes)    | Baja-Media  |
| consent          | Consentimiento GDPR, logs de auditoria, expiracion    | Baja-Media  |
| lead-scoring     | Scoring de visitantes, tiers hot/warm/cold            | Baja        |

### Contextos Core (PostgreSQL)

| Contexto     | Responsabilidad                                     | Complejidad |
| ------------ | --------------------------------------------------- | ----------- |
| auth (4 sub) | JWT, API keys RSA, Keycloak OIDC, BFF cookies       | Alta        |
| company      | Gestion multi-tenant de empresas y sitios           | Media       |
| shared       | Result<T,E>, Criteria, Value Objects, Guards, Email | Critico     |

### Contextos Legacy (PostgreSQL - Solo Mantenimiento)

| Contexto      | Estado                                       |
| ------------- | -------------------------------------------- |
| conversations | Deprecated - controlador vacio, migrado a V2 |
| visitors      | Deprecated - campos migrados a visitors-v2   |

---

## Flujos Principales

### Flujo de Chat en Tiempo Real

```
Visitante (Widget)              Backend                    Comercial (Dashboard)
     │                            │                              │
     │──── WS Connect ───────────→│                              │
     │     (visitorId+tenantId)   │                              │
     │←─── welcome ──────────────│                              │
     │←─── presence:joined ──────│                              │
     │                            │── mark visitor ONLINE ──→ Redis
     │                            │── emit presence change ──→│
     │                            │                              │←── presence update
     │                            │                              │
     │──── POST /chats ──────────→│                              │
     │     (crear chat)           │── CommandBus ──→ CreateChat │
     │                            │── save MongoDB             │
     │                            │── commit() events          │
     │                            │── WS emit chat:created ───→│
     │←─── 201 + chatId ────────│                              │
     │                            │                              │
     │──── chat:join ────────────→│                              │
     │     {chatId}               │──── chat:join ──────────────│
     │                            │                              │
     │──── POST /messages ───────→│                              │
     │     {content}              │── CommandBus ──→ SendMsg   │
     │                            │── save MongoDB             │
     │                            │── commit() events          │
     │                            │── WS emit to chat room ───→│
     │←─── 201 ──────────────────│                              │
```

### Flujo de Autenticacion BFF (OIDC/PKCE)

```
Frontend SPA                    BFF Backend                 Keycloak
     │                            │                              │
     │── GET /bff/auth/login ────→│                              │
     │                            │── genera PKCE verifier       │
     │                            │── guarda state en sesion     │
     │←── 302 redirect ─────────│                              │
     │                            │                              │
     │──── redirect a Keycloak ──────────────────────────────→│
     │←─── login form ────────────────────────────────────────│
     │──── credentials ──────────────────────────────────────→│
     │←─── redirect con code ─────────────────────────────────│
     │                            │                              │
     │── GET /bff/auth/callback ─→│                              │
     │                            │── exchange code + verifier ─→│
     │                            │←── tokens ──────────────────│
     │                            │── set HttpOnly cookies       │
     │←── 302 redirect + cookies │                              │
```

---

## Arquitectura de Despliegue

### Entornos

| Entorno    | Infraestructura            | Gestion de proceso | Deploy                     |
| ---------- | -------------------------- | ------------------ | -------------------------- |
| Desarrollo | docker/docker-compose.yml         | nest start --watch | Manual                     |
| Staging    | docker/docker-compose-staging.yml | PM2 ecosystem      | GitHub Actions (staging)   |
| Produccion | docker-compose-prod.yml    | PM2 ecosystem      | GitHub Actions → VPN → SSH |

### Topologia de Produccion

```
┌─────────────────────────────────────────────────────────────────┐
│                    Servidor de Produccion                         │
│                    (VPN WireGuard)                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  PM2 (Process Manager)                                    │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │ guiders-backend (Node.js :3000)                    │  │   │
│  │  │ → dist/src/main.js                                 │  │   │
│  │  │ → NODE_ENV=production                              │  │   │
│  │  │ → .env.production                                  │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Docker Compose (Servicios de datos)                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────┐ │   │
│  │  │ PostgreSQL │  │  MongoDB   │  │      Redis         │ │   │
│  │  │ 14-alpine  │  │   7.0      │  │    7-alpine        │ │   │
│  │  │ :5432      │  │  :27017    │  │     :6379          │ │   │
│  │  │ healthcheck│  │ healthcheck│  │  healthcheck       │ │   │
│  │  │ vol:pgdata │  │ vol:mongo  │  │  vol:redis-data    │ │   │
│  │  └────────────┘  └────────────┘  └────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Keycloak (Identity Provider)                             │   │
│  │  → Servidor externo o contenedor separado                 │   │
│  │  → OIDC/PKCE para autenticacion                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Nginx (Reverse Proxy, no incluido en este repo)                │
│  → SSL/TLS termination                                           │
│  → Proxy a :3000 (api) y WebSocket                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline de Deploy (Produccion)

```
GitHub (push main)
     │
     ├─── 1. Lint + Format check
     ├─── 2. Build (npm run build)
     ├─── 3. Unit tests
     ├─── 4. Integration tests (PG + Mongo + Redis reales)
     ├─── 5. E2E tests (servidor completo)
     │
     └─── 6. Deploy (si todo pasa)
          ├── Levantar VPN WireGuard
          ├── Verificar conectividad
          ├── SCP: tar.gz (dist + node_modules) → servidor
          ├── SCP: .env.production → servidor
          ├── SSH: docker compose up (DBs)
          ├── SSH: Esperar healthchecks
          ├── SSH: TypeORM migrations
          ├── SSH: PM2 restart guiders-backend
          └── SSH: Verificar estado final
```

### Dockerfile (Multi-stage Build)

```
Stage 1: builder
  → npm install (todas las deps)
  → npm run build
  → Genera dist/

Stage 2: production
  → Copia dist/, package*.json, .env.production, tsconfig*.json
  → npm install --omit=dev
  → EXPOSE 3000
  → CMD: npm run start:prod
```

Nota: En produccion actual se usa PM2 + deploy directo (no Docker para la app), pero el Dockerfile esta disponible para contenedorizacion futura.

---

## Pipeline CI/CD

### GitHub Actions Workflows

| Workflow             | Trigger              | Jobs                                              |
| -------------------- | -------------------- | ------------------------------------------------- |
| `ci.yml`             | push/PR main,develop | lint → build + unit + integration → e2e → summary |
| `deploy-main.yml`    | push main            | test-and-build → deploy-production                |
| `deploy-staging.yml` | push develop         | test-and-build → deploy-staging                   |

### Jobs CI (Parallelismo)

```
lint ──────────────┬──→ build ──────────→ e2e
                   ├──→ test-unit ──────→ check-coverage
                   ├──→ test-integration
                   └──→ security-scan
```

- **Criticos** (bloquean merge): lint, build, test-unit, test-integration, test-e2e, security-scan
- **No critico**: check-coverage (continue-on-error)

---

## Estrategia de Testing

### Piramide de Tests

| Nivel       | Config         | Base de datos             | Comando             |
| ----------- | -------------- | ------------------------- | ------------------- |
| Unitarios   | jest-unit.json | SQLite in-memory (mock)   | `npm run test:unit` |
| Integracion | jest-int.json  | PG + Mongo + Redis reales | `npm run test:int`  |
| E2E         | jest-e2e.json  | PG + Mongo + Redis reales | `npm run test:e2e`  |

### Convenciones de Testing

- Archivos en carpeta `__tests__/` junto al codigo fuente
- Nomenclatura: `<nombre>.spec.ts`
- Describe blocks en espanol
- UUIDs reales: `Uuid.random().value` (nunca IDs falsos)
- Mocks con `jest.Mocked<T>`
- MongoDB Memory Server para tests unitarios que necesitan Mongoose

---

## Patrones Transversales

### Criteria Pattern

Consultas type-safe con `CriteriaConverter`:

```typescript
// Construccion de criterios
const criteria = new Criteria(
  [new Filter('companyId', FilterOperator.EQUAL, companyId)],
  Order.asc('createdAt'),
  10, // limit
  0, // offset
);

// Conversion a query nativa
const query = this.criteriaConverter.convert(criteria);
```

### Mapper Pattern

Transformacion dominio ↔ persistencia obligatoria:

```typescript
interface Mapper<Domain, Persistence> {
  toPersistence(entity: Domain): Persistence;
  fromPersistence(raw: Persistence): Domain;
}
```

Nunca exponer entidades ORM fuera de la capa de infraestructura.

### Aggregates Inmutables

```typescript
class ChatAggregate extends AggregateRoot {
  // Constructor privado
  private constructor(/* ... */) {
    super();
  }

  // Factory con eventos (entidades nuevas)
  static create(props): ChatAggregate {
    /* emite eventos */
  }

  // Factory sin eventos (rehidratacion desde DB)
  static fromPrimitives(raw): ChatAggregate {
    /* sin eventos */
  }

  // Serializacion
  toPrimitives(): ChatPrimitives {
    /* ... */
  }
}
```

### Multi-tenancy

El sistema soporta multiples empresas (tenants):

- `companyId` presente en JWT tokens
- Filtrado por `companyId` en todas las queries
- Salas WebSocket separadas por tenant
- API keys vinculadas a company/site

---

## Configuracion del Entorno

### Variables de Entorno

La seleccion de archivo `.env` es dinamica segun `NODE_ENV`:

| NODE_ENV   | Archivo         |
| ---------- | --------------- |
| production | .env.production |
| staging    | .env.staging    |
| test       | .env.test       |
| (default)  | .env            |

### TypeScript

```json
{
  "target": "ES2021",
  "module": "commonjs",
  "strictNullChecks": true,
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "noImplicitAny": false,
  "baseUrl": "./"
}
```

### Configuracion de MongoDB

Pool configurable con parametros de resiliencia:

- `maxPoolSize`: 10
- `minPoolSize`: 5
- `serverSelectionTimeoutMS`: 10000
- `retryWrites` / `retryReads`: true

---

## Decisiones Arquitectonicas Clave

| Decision                       | Justificacion                                                         |
| ------------------------------ | --------------------------------------------------------------------- |
| DDD + CQRS + Hexagonal         | Separacion clara de responsabilidades, testabilidad                   |
| Persistencia dual (PG + Mongo) | PG para datos relacionales/auth, Mongo para alto volumen/flexibilidad |
| Result<T,E> sobre excepciones  | Control de flujo explicito, composabilidad, sin stack traces          |
| Aggregates inmutables          | Integridad de datos, eventos predecibles                              |
| WebSocket centralizado         | Un unico gateway para toda la comunicacion en tiempo real             |
| Redis para presencia           | Baja latencia, TTL nativo, atomicidad                                 |
| Keycloak como IdP              | Estandar OIDC, gestion de usuarios externalizada                      |
| API Keys RSA 4096              | Seguridad fuerte para widgets embebidos en sitios de terceros         |
| Particionado mensual tracking  | Evitar colecciones gigantes, facilitar archivado                      |
| PM2 en produccion              | Reinicio automatico, clustering, logs                                 |
| VPN WireGuard para deploy      | Acceso seguro al servidor de produccion desde CI                      |

---

## Documentacion Relacionada

- [Contratos de API](./api-contracts.md) - Catalogo completo de ~145 endpoints REST y 13 eventos WebSocket
- [Modelos de Datos](./data-models.md) - Esquemas de todas las bases de datos
- [Arbol de Fuentes](./source-tree-analysis.md) - Estructura de directorios anotada
- [Guia de Desarrollo](./development-guide.md) - Setup, comandos, y guia de despliegue
- [AGENTS.md (raiz)](../AGENTS.md) - Referencia rapida para agentes AI
