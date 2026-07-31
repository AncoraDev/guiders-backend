# Guiders Backend - Vision General del Proyecto

**Fecha:** 2026-04-01
**Tipo:** Monolito backend
**Arquitectura:** DDD + CQRS + Arquitectura Hexagonal
**Framework:** NestJS v11 + TypeScript 5.8

---

## Resumen Ejecutivo

Guiders Backend es la infraestructura de servidor para un producto orientado a equipos comerciales, que permite la comunicacion instantanea y sin friccion entre agentes comerciales y los visitantes de sitios web. El objetivo central es eliminar barreras de contacto, mejorar la experiencia del usuario y potenciar la conversion.

El sistema esta construido como un monolito modular sobre NestJS v11, siguiendo rigurosamente los principios de Domain-Driven Design (DDD), Command Query Responsibility Segregation (CQRS) y Arquitectura Hexagonal (Ports & Adapters). Gestiona comunicacion en tiempo real via WebSockets, tracking de visitantes, scoring de leads, integracion con inteligencia artificial (LLM) y personalizacion white-label para multiples empresas.

---

## Clasificacion del Proyecto

- **Tipo de repositorio:** Monolito
- **Tipo de proyecto:** Backend API + WebSocket en tiempo real
- **Lenguaje principal:** TypeScript 5.8
- **Patron arquitectonico:** DDD + CQRS + Arquitectura Hexagonal
- **Bounded contexts:** 15 contextos acotados independientes
- **Persistencia:** Dual - PostgreSQL (TypeORM) para contextos V1/core + MongoDB (Mongoose) para contextos V2

---

## Stack Tecnologico

| Categoria       | Tecnologia              | Version | Proposito                                  |
| --------------- | ----------------------- | ------- | ------------------------------------------ |
| Runtime         | Node.js                 | >= 20.x | Entorno de ejecucion                       |
| Framework       | NestJS                  | 11.x    | Framework backend principal                |
| Lenguaje        | TypeScript              | 5.8     | Lenguaje de desarrollo con tipado estatico |
| CQRS            | @nestjs/cqrs            | 11.x    | Buses de comandos, queries y eventos       |
| BD Relacional   | PostgreSQL              | 14      | Persistencia para auth, company, V1        |
| ORM Relacional  | TypeORM                 | 0.3.x   | Mapeo objeto-relacional para PostgreSQL    |
| BD Documental   | MongoDB                 | 7.x     | Persistencia para V2, leads, tracking      |
| ODM Documental  | Mongoose                | 8.x     | Modelado de datos para MongoDB             |
| Cache/Presencia | Redis                   | 7.x     | Cache, presencia de agentes, sesiones      |
| Tiempo Real     | Socket.IO               | 4.x     | Gateway WebSocket bidireccional            |
| Autenticacion   | Keycloak                | -       | OIDC/JWKS, gestion de identidades          |
| JWT             | @nestjs/jwt + jose      | -       | Tokens Bearer, BFF cookies, visitor JWT    |
| IA/LLM          | Groq SDK                | -       | Integracion con modelos de lenguaje        |
| Almacenamiento  | AWS S3                  | -       | Subida de archivos y logos white-label     |
| Email           | Resend                  | -       | Envio de correos transaccionales           |
| Contenedores    | Docker + Docker Compose | -       | Despliegue y servicios locales             |
| Proceso         | PM2                     | -       | Gestion de procesos en produccion          |
| CI/CD           | GitHub Actions          | -       | Integracion continua y despliegue          |

---

## Funcionalidades Clave

### Comunicacion en Tiempo Real

- Chat bidireccional entre visitantes web y agentes comerciales via WebSockets (Socket.IO)
- Indicadores de escritura en tiempo real
- Sistema de cola para asignacion automatica de chats a agentes disponibles
- Notificaciones push de nuevos mensajes

### Gestion de Visitantes

- Registro y tracking automatico de visitantes anonimos y autenticados
- Maquina de estados de ciclo de vida del visitante (nuevo → activo → inactivo → retornante)
- Sesiones con gestion de presencia en tiempo real via Redis
- Deteccion de dispositivo, geolocalizacion y UTM parameters

### Scoring de Leads

- Calificacion automatica de visitantes en tiempo real (hot/warm/cold)
- Algoritmo basado en eventos de tracking, interacciones y comportamiento
- Sin persistencia propia (calculo puro sobre datos de tracking)

### Integracion con IA (LLM)

- Auto-respuestas inteligentes a visitantes usando modelos Groq
- Tool use para que el LLM ejecute acciones del dominio
- Contexto de conversacion y scraping de contenido web para respuestas informadas

### Tracking de Eventos

- Ingesta de alto rendimiento con buffering en memoria
- Particionamiento mensual automatico de colecciones (tracking_events_YYYY_MM)
- Soporte para page views, clicks, formularios, eventos custom

### Gestion Comercial

- Dashboard de agentes comerciales con presencia en tiempo real
- Asignacion round-robin de conversaciones
- Gestion de leads con sincronizacion CRM (LeadCars)

### White-Label

- Personalizacion completa de marca por empresa (colores, logos, fuentes)
- Almacenamiento de assets en AWS S3
- Temas configurables para el widget de chat

### Consentimiento (GDPR)

- Gestion de consentimiento con auditoria completa
- Logs inmutables con hash de integridad
- Expiracion automatica de consentimientos

### Autenticacion Multi-Mecanismo

- JWT Bearer para APIs internas y externas
- BFF (Backend For Frontend) con cookies HTTP-only y PKCE flow via Keycloak
- API Keys RSA-4096 para registro de visitantes por empresa

---

## Aspectos Destacados de la Arquitectura

### Patron Result<T, E>

Todas las operaciones de dominio y repositorio devuelven `Result<T, E>` en lugar de lanzar excepciones. Esto fuerza el manejo explicito de errores en cada capa.

### Agregados Inmutables

Los agregados usan constructores privados y metodos fabrica (`create()` para nuevas entidades con eventos, `fromPrimitives()` para rehidratacion sin eventos). Los metodos de mutacion devuelven nuevas instancias.

### Eventos de Dominio

Cada agregado puede emitir eventos de dominio que se publican mediante `aggregate.commit()` despues de persistir exitosamente. Los handlers de eventos ejecutan efectos secundarios desacoplados.

### Patron Criteria

Queries tipo-seguras y componibles para MongoDB y PostgreSQL, evitando SQL concatenado y filtros ad-hoc.

### Particionamiento de Colecciones

El contexto de tracking usa particionamiento mensual automatico para manejar alto volumen de eventos sin degradar rendimiento.

---

## Panorama de Desarrollo

### Prerequisitos

- Node.js >= 20.x (LTS)
- Docker >= 24.x + Docker Compose >= 2.x
- Git >= 2.x

### Inicio Rapido

```bash
git clone https://github.com/RogerPugaRuiz/guiders-backend.git
cd guiders-backend
npm install
cp .env.example .env   # Configurar variables de entorno
docker-compose up -d    # Levantar PostgreSQL, MongoDB, Redis, Keycloak
npm run typeorm:migrate:run  # Ejecutar migraciones
npm run start:dev       # Servidor con hot-reload en http://localhost:3000
```

### Comandos Principales

- **Instalar:** `npm install`
- **Desarrollo:** `npm run start:dev`
- **Build:** `npm run build`
- **Tests unitarios:** `npm run test:unit`
- **Tests integracion:** `npm run test:int`
- **Tests E2E:** `npm run test:e2e`
- **Lint:** `npm run lint`
- **Formato:** `npm run format`

---

## Estructura del Repositorio

```
guiders-backend/
├── src/
│   ├── main.ts                  # Entry point
│   ├── app.module.ts            # Modulo raiz
│   ├── context/                 # 15 bounded contexts (DDD)
│   │   ├── auth/                # Autenticacion y autorizacion
│   │   ├── company/             # Gestion de empresas
│   │   ├── shared/              # Utilidades compartidas
│   │   ├── conversations-v2/    # Chat en tiempo real (V2, MongoDB)
│   │   ├── visitors-v2/         # Tracking de visitantes (V2, MongoDB)
│   │   ├── tracking-v2/         # Eventos y analitica (V2, MongoDB)
│   │   ├── leads/               # Gestion de leads
│   │   ├── llm/                 # Integracion IA
│   │   ├── lead-scoring/        # Scoring de visitantes
│   │   ├── commercial/          # Agentes comerciales
│   │   ├── white-label/         # Personalizacion de marca
│   │   ├── consent/             # GDPR y consentimiento
│   │   ├── conversations/       # Legacy V1 (deprecado)
│   │   └── visitors/            # Legacy V1 (deprecado)
│   └── websocket/               # Gateway WebSocket centralizado
├── docs/                        # Documentacion generada
├── test/                        # Tests E2E
├── migrations/                  # Migraciones TypeORM
├── docker-compose.yml           # Servicios locales
└── .github/workflows/           # CI/CD pipelines
```

---

## Mapa de Documentacion

Para informacion detallada, consultar:

- [index.md](./index.md) - Indice maestro de documentacion
- [architecture.md](./architecture.md) - Arquitectura tecnica detallada
- [source-tree-analysis.md](./source-tree-analysis.md) - Estructura de directorios anotada
- [component-inventory.md](./component-inventory.md) - Inventario de bounded contexts y componentes
- [development-guide.md](./development-guide.md) - Guia de desarrollo y despliegue
- [api-contracts.md](./api-contracts.md) - Catalogo de endpoints REST y WebSocket
- [data-models.md](./data-models.md) - Esquemas de base de datos

---

_Generado usando el workflow `document-project` del metodo BMAD_
