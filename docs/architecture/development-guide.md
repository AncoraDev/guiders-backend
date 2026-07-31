# Guiders Backend - Guia de Desarrollo

**Fecha:** 2026-04-01

## Prerequisitos

| Herramienta    | Version | Proposito                         |
| -------------- | ------- | --------------------------------- |
| Node.js        | >= 20.x | Runtime (LTS recomendado)         |
| npm            | >= 10.x | Gestor de paquetes                |
| Docker         | >= 24.x | Contenedores para servicios       |
| Docker Compose | >= 2.x  | Orquestacion de servicios locales |
| Git            | >= 2.x  | Control de versiones              |

### Servicios Externos (via Docker)

| Servicio      | Puerto | Proposito                           |
| ------------- | ------ | ----------------------------------- |
| PostgreSQL 14 | 5432   | Base de datos relacional (TypeORM)  |
| MongoDB 7     | 27017  | Base de datos documental (Mongoose) |
| Redis 7       | 6379   | Cache, presencia, sesiones          |
| Keycloak 23   | 8080   | Identity provider (OIDC)            |

---

## Instalacion y Configuracion

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd guiders-backend
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Levantar servicios con Docker

```bash
docker-compose up -d
```

Esto levanta PostgreSQL, MongoDB, Redis y Keycloak en contenedores locales.

### 4. Configurar variables de entorno

```bash
cp .env.test .env
```

Editar `.env` con los valores apropiados. Las variables clave son:

| Variable            | Descripcion            | Ejemplo                             |
| ------------------- | ---------------------- | ----------------------------------- |
| `DATABASE_HOST`     | Host PostgreSQL        | `localhost`                         |
| `DATABASE_PORT`     | Puerto PostgreSQL      | `5432`                              |
| `DATABASE_NAME`     | Nombre de la BD        | `guiders`                           |
| `DATABASE_USERNAME` | Usuario PG             | `postgres`                          |
| `DATABASE_PASSWORD` | Password PG            | `postgres`                          |
| `MONGODB_URI`       | URI de MongoDB         | `mongodb://localhost:27017/guiders` |
| `REDIS_HOST`        | Host Redis             | `localhost`                         |
| `REDIS_PORT`        | Puerto Redis           | `6379`                              |
| `KEYCLOAK_BASE_URL` | URL de Keycloak        | `http://localhost:8080`             |
| `KEYCLOAK_REALM`    | Realm de Keycloak      | `guiders`                           |
| `JWT_SECRET`        | Secret para JWT        | `<random-string>`                   |
| `AWS_S3_BUCKET`     | Bucket S3 para uploads | `guiders-uploads`                   |
| `AWS_REGION`        | Region AWS             | `eu-west-1`                         |
| `GROQ_API_KEY`      | API Key de Groq (LLM)  | `gsk_...`                           |

### 5. Ejecutar migraciones

```bash
npm run typeorm:migrate:run
```

### 6. Iniciar en modo desarrollo

```bash
npm run start:dev
```

El servidor arranca en `http://localhost:3000` con hot-reload habilitado.

---

## Comandos Principales

### Desarrollo

| Comando             | Descripcion                         |
| ------------------- | ----------------------------------- |
| `npm run start:dev` | Iniciar con hot-reload (watch mode) |
| `npm run build`     | Build de produccion                 |
| `npm run lint`      | ESLint con auto-fix                 |
| `npm run format`    | Prettier formatting                 |

### Testing

| Comando                                           | Descripcion                                |
| ------------------------------------------------- | ------------------------------------------ |
| `npm run test:unit`                               | Tests unitarios (SQLite in-memory, rapido) |
| `npm run test:unit -- <path>`                     | Test unitario de un archivo especifico     |
| `npm run test:unit -- --testNamePattern="patron"` | Tests que coincidan con patron             |
| `npm run test:int`                                | Tests de integracion (requiere DBs reales) |
| `npm run test:int:dev`                            | Integracion sin coverage                   |
| `npm run test:e2e`                                | Tests end-to-end (servidor completo)       |

### Base de Datos

| Comando                            | Descripcion                     |
| ---------------------------------- | ------------------------------- |
| `npm run typeorm:migrate:run`      | Ejecutar migraciones pendientes |
| `npm run typeorm:migrate:generate` | Generar nueva migracion         |

### CLI

| Comando                                                              | Descripcion           |
| -------------------------------------------------------------------- | --------------------- |
| `node bin/guiders-cli.js create-company --name "X" --domain "x.com"` | Crear empresa         |
| `node bin/guiders-cli.js clean-database --force`                     | Limpiar base de datos |

---

## Estrategia de Testing

### Tests Unitarios

- **Framework:** Jest con `@nestjs/testing`
- **BD:** SQLite in-memory (no requiere servicios externos)
- **Ubicacion:** `__tests__/` junto al codigo fuente
- **Patron:** Mock de dependencias con `jest.Mocked<T>`
- **UUIDs:** Siempre usar `Uuid.random().value` (nunca IDs falsos)
- **Convencion:** `describe` blocks en espanol
- **Config:** `jest-unit.json`

```typescript
describe('CreateChatCommandHandler', () => {
  it('debe crear un chat exitosamente', async () => {
    const chatId = Uuid.random().value;
    mockRepo.save.mockResolvedValue(okVoid());
    const result = await handler.execute(command);
    expect(result.isOk()).toBe(true);
  });
});
```

### Tests de Integracion

- **BD:** MongoDB Memory Server + PostgreSQL real
- **Config:** `jest-int.json` + `jest-int.setup.ts`
- **Proposito:** Validar repositorios contra BD real

### Tests E2E

- **Ubicacion:** `test/`
- **Config:** `test/jest-e2e.json`
- **Proposito:** Tests de servidor completo con HTTP requests

---

## Convenciones de Codigo

### Estilo

- **Quotes:** Simples (`'string'`)
- **Trailing commas:** Siempre
- **Indentacion:** 2 espacios
- **Formatter:** Prettier (ejecutar `npm run format` antes de commit)
- **Linter:** ESLint (ejecutar `npm run lint` antes de commit)

### Idioma

| Elemento                    | Idioma                         |
| --------------------------- | ------------------------------ |
| Identificadores de codigo   | Ingles                         |
| Comentarios y documentacion | Espanol                        |
| Descripciones Swagger       | Espanol                        |
| Mensajes de error           | Espanol                        |
| Commits                     | Espanol (Conventional Commits) |

### Nombrado

| Elemento               | Patron                          | Ejemplo                               |
| ---------------------- | ------------------------------- | ------------------------------------- |
| Aggregate              | `<Entity>Aggregate`             | `ChatAggregate`                       |
| Value Object           | `<Name>`                        | `ChatId`, `ChatStatus`                |
| Repository (interface) | `<Entity>Repository`            | `ChatRepository`                      |
| Repository (impl)      | `Mongo<Entity>RepositoryImpl`   | `MongoChatRepositoryImpl`             |
| Command Handler        | `<Action>CommandHandler`        | `CreateChatCommandHandler`            |
| Query Handler          | `<Action>QueryHandler`          | `GetChatByIdQueryHandler`             |
| Event Handler          | `<Action>On<Event>EventHandler` | `NotifyOnChatCreatedEventHandler`     |
| Test                   | `<name>.spec.ts`                | `create-chat.command-handler.spec.ts` |

### Orden de Imports

1. Paquetes externos (`@nestjs/*`, `mongoose`, etc.)
2. Contexto shared (`src/context/shared/*`)
3. Mismo contexto
4. Imports relativos

---

## Patrones de Implementacion

### Result Pattern (CRITICO)

Usar `Result<T, E>` en lugar de excepciones para errores esperados:

```typescript
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';

// En repositorios
async findById(id: ChatId): Promise<Result<Chat, DomainError>> {
  const entity = await this.model.findOne({ id: id.value });
  if (!entity) return err(new ChatNotFoundError(id.value));
  return ok(this.mapper.toDomain(entity));
}

// En handlers - verificar antes de unwrap
if (result.isErr()) return result;
const value = result.unwrap(); // Seguro despues de isErr check
```

### Publicacion de Eventos (CRITICO)

Siempre llamar `commit()` despues de `mergeObjectContext()` + `save()`:

```typescript
const aggregate = this.publisher.mergeObjectContext(chat);
const saveResult = await this.repo.save(aggregate);
if (saveResult.isErr()) return saveResult;
aggregate.commit(); // Sin esto, los eventos NO se publican
```

### Aggregates

- Constructor privado, usar factory methods
- `create()` - emite eventos (entidades nuevas)
- `fromPrimitives()` - sin eventos (rehidratacion)
- `toPrimitives()` - serializacion

---

## Workflow de Publicacion (OpenCode)

El proyecto incluye comandos personalizados de OpenCode para publicar:

| Comando          | Descripcion                                               |
| ---------------- | --------------------------------------------------------- |
| `/publish`       | Lint + tests unitarios + build + commit + push            |
| `/publish-quick` | Lint + tests unitarios + commit + push                    |
| `/publish-full`  | Lint + todos los tests (unit+e2e) + build + commit + push |

---

_Generado usando el workflow `document-project` de BMAD Method_

---

# Guiders Backend - Guia de Despliegue

## Infraestructura

### Contenedores Docker

**Dockerfile** (Multi-stage build):

```
Stage 1 (build): node:20-alpine → npm ci → npm run build
Stage 2 (production): node:20-alpine → COPY dist/ → npm ci --production
```

### Servicios Docker Compose

**Desarrollo** (`docker/docker-compose.yml`):

- PostgreSQL 14 (puerto 5432)
- MongoDB 7 (puerto 27017)
- Redis 7 (puerto 6379)
- Keycloak 23 (puerto 8080)

**Staging** (`docker/docker-compose-staging.yml`):

- Mismos servicios + volumenes persistentes
- Configuracion PM2 via `ecosystem.staging.config.js`

**Produccion** (`docker-compose-prod.yml`):

- Servicios optimizados
- PM2 cluster mode via `ecosystem.config.js`

### Process Manager (PM2)

El backend se ejecuta con PM2 en staging/produccion:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'guiders-backend',
      script: 'dist/main.js',
      instances: 'max', // Cluster mode
      exec_mode: 'cluster',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

## CI/CD

**Directorio:** `.github/workflows/`

El proyecto tiene 3 workflows de GitHub Actions:

1. **CI** - Lint, tests, build en PRs
2. **Deploy Staging** - Despliegue automatico a staging
3. **Deploy Production** - Despliegue a produccion (manual trigger)

## Variables de Entorno de Produccion

Las variables sensibles se gestionan via GitHub Secrets y se inyectan en el entorno de ejecucion. Ver `.env.test` como referencia de todas las variables necesarias.

---

_Generado usando el workflow `document-project` de BMAD Method_
