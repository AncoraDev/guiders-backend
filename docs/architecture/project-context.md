---
project_name: 'guiders-backend'
user_name: 'Roger Puga'
date: '2026-04-21'
sections_completed: ['technology_stack', 'critical_implementation_rules', 'architecture_patterns', 'testing', 'naming_conventions', 'code_style', 'git_workflow']
---

# Project Context para Agentes AI

_Este archivo contiene reglas críticas y patrones que los agentes AI deben seguir al implementar código en este proyecto. Se enfoca en detalles no obvios que los agentes podrían omitir._

---

## Stack Tecnológico y Versiones

| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Node.js | ≥18 | Runtime |
| TypeScript | ^5.8.3 | Lenguaje principal |
| NestJS | ^11.0.x | Framework principal |
| @nestjs/cqrs | ^11.0.2 | CQRS / Event Bus |
| MongoDB / Mongoose | ^8.16.1 | Persistencia V2 (activa) |
| PostgreSQL / TypeORM | ^0.3.21 | Persistencia V1 (legacy) |
| Socket.io | ^4.8.1 | WebSocket tiempo real |
| Jest | ^29.7.0 | Testing |
| ts-jest | ^29.3.4 | Transpilación en tests |
| ESLint | ^9.28.0 | Linting |
| Prettier | ^3.4.2 | Formato |

---

## Reglas Críticas de Implementación

### 1. Patrón Result — OBLIGATORIO

**NUNCA lanzar excepciones para errores de negocio esperados. SIEMPRE usar `Result<T, E>`.**

```typescript
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';

// Repositorio — firma correcta
async findById(id: ChatId): Promise<Result<Chat, DomainError>> {
  const doc = await this.model.findOne({ id: id.value });
  if (!doc) return err(new ChatNotFoundError(id.value));
  return ok(this.mapper.toDomain(doc));
}

// Handler — verificar SIEMPRE antes de unwrap
const result = await this.repo.findById(id);
if (result.isErr()) return result; // propagar
const chat = result.unwrap();     // seguro solo después de isErr check
```

**Fábricas disponibles:**
- `ok(value)` — resultado exitoso con valor
- `okVoid()` — resultado exitoso sin valor (para saves, deletes)
- `err(domainError)` — resultado de error

**Cuándo usar Result vs Exception:**
- Errores de negocio esperados (not found, inválido): → `Result`
- Errores de programador / estado imposible: → `throw`

### 2. Value Objects — API de Acceso al Valor

Existen **dos tipos de VOs** con APIs distintas. No mezclar:

| Tipo | Hereda de | Acceso al valor | Ejemplo |
|------|-----------|-----------------|---------|
| **UUID-based** (IDs) | `Uuid` / clase propia | `.getValue()` | `ChatId`, `VisitorId`, `MessageId` |
| **Primitive-based** (states, enums) | `PrimitiveValueObject<T>` | `.value` | `ChatStatus`, `ChatPriority`, `MessageContent` |

```typescript
// VOs de tipo ID → getValue()
chat.id.getValue()          // ✅ ChatId
message.id.getValue()       // ✅ MessageId

// VOs de tipo primitivo → .value
chat.status.value           // ✅ ChatStatus
chat.priority.value         // ✅ ChatPriority

// Ambos trabajan: ChatId tiene ambos por compatibilidad
chat.id.value               // también válido en ChatId
```

### 3. ⚠️ CRÍTICO — Publicación de Eventos de Dominio

**SIEMPRE llamar `commit()` después de `mergeObjectContext()` + `save()`.**

```typescript
// CORRECTO
const aggregate = this.publisher.mergeObjectContext(entity);
const saveResult = await this.repo.save(aggregate);
if (saveResult.isErr()) return saveResult;
aggregate.commit(); // SIN ESTO LOS EVENTOS NO SE PUBLICAN

// INCORRECTO — eventos se pierden silenciosamente
await this.repo.save(entity);
// sin commit() → handlers de eventos nunca se ejecutan, sin error visible
```

### 4. ⚠️ CRÍTICO — Aggregates Inmutables en V2: Copiar Eventos

En contextos V2, los aggregates son **inmutables**: los métodos de mutación devuelven una nueva instancia. Al hacerlo, **los eventos no comprometidos del original se pierden** si no se copian explícitamente:

```typescript
// CORRECTO — copiar eventos antes de agregar nuevos
public assignCommercial(commercialId: string): Chat {
  const updatedChat = new Chat(this._id, ChatStatus.ASSIGNED, ...);

  // CRÍTICO: copiar eventos pendientes del original (ej: ChatCreatedEvent)
  const originalEvents = this.getUncommittedEvents();
  originalEvents.forEach((event) => updatedChat.apply(event));

  // Luego aplicar el nuevo evento
  updatedChat.apply(new CommercialAssignedEvent(...));
  return updatedChat;
}

// INCORRECTO — los eventos anteriores se pierden
public assignCommercial(commercialId: string): Chat {
  const updatedChat = new Chat(...);
  updatedChat.apply(new CommercialAssignedEvent(...)); // ChatCreatedEvent perdido ❌
  return updatedChat;
}
```

### 5. `apply()` (V2) vs `addDomainEvent()` (V1) — No mezclar

| Contexto | AggregateRoot | Emitir evento | Publicar |
|---------|--------------|---------------|---------|
| V2 (MongoDB) | `AggregateRoot` de `@nestjs/cqrs` | `this.apply(event)` | `aggregate.commit()` |
| V1 (PostgreSQL) | `AggregateRoot` propio de shared | `this.apply(event)` | `aggregate.commit()` |

Ambos usan `apply()` + `commit()`. La diferencia está en los imports:
```typescript
// V2 — usa NestJS CQRS directamente
import { AggregateRoot } from '@nestjs/cqrs';

// Shared custom (algunos contextos legacy)
import { AggregateRoot } from 'src/context/shared/domain/aggregate-root';
```

### 6. Mapeo de DomainError → HTTP en Controllers

No hay exception filter global. El controller hace el mapeo manualmente:

```typescript
// Patrón estándar en controllers V2
const result = await this.commandBus.execute(command);
if (result instanceof Error || result?.error) {
  if (result instanceof DomainError) {
    throw new HttpException(result.message, HttpStatus.BAD_REQUEST);
  }
  throw new HttpException('Error interno', HttpStatus.INTERNAL_SERVER_ERROR);
}

// Para errores de autorización
throw new HttpException('No autorizado', HttpStatus.UNAUTHORIZED);   // 401
throw new HttpException('Sin permisos', HttpStatus.FORBIDDEN);       // 403
throw new HttpException('No encontrado', HttpStatus.NOT_FOUND);      // 404
```

**Regla:** Si el controller captura un `HttpException` ya construido, debe re-lanzarlo sin envolver:
```typescript
catch (error) {
  if (error instanceof HttpException) throw error; // re-lanzar tal cual
  throw new HttpException('Error interno', HttpStatus.INTERNAL_SERVER_ERROR);
}
```

### 7. Aggregates — Inmutabilidad en Mutaciones

Los aggregates en V2 usan el **patrón de objeto inmutable**: los métodos que modifican estado devuelven una **nueva instancia** en lugar de mutar la existente.

```typescript
// CORRECTO — método devuelve nueva instancia
const updatedChat = chat.assignCommercial(commercialId);
const aggregate = this.publisher.mergeObjectContext(updatedChat);

// INCORRECTO — no mutar el aggregate directamente
chat.status = 'ASSIGNED'; // ❌ nunca
```

Cuando se devuelve una nueva instancia, **copiar los eventos no comprometidos** del original:
```typescript
const originalEvents = this.getUncommittedEvents();
originalEvents.forEach((event) => updatedChat.apply(event));
```

### 4. Contextos Activos vs Legacy

| Contexto | Estado | BD | Usar para |
|---------|--------|-----|-----------|
| `conversations-v2` | **ACTIVO** | MongoDB | Nuevas features de chat |
| `visitors-v2` | **ACTIVO** | MongoDB | Nuevas features de visitantes |
| `tracking-v2` | **ACTIVO** | MongoDB | Nuevas features de tracking |
| `conversations` | Legacy | PostgreSQL | Solo mantenimiento |
| `visitors` | Legacy | PostgreSQL | Solo mantenimiento |

**Toda nueva funcionalidad va en contextos V2 (MongoDB).**

### 5. UUIDs en Tests — OBLIGATORIO

**NUNCA usar UUIDs falsos o strings fijos como IDs en tests.**

```typescript
// CORRECTO
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
const chatId = Uuid.random().value; // UUID real

// INCORRECTO
const chatId = 'fake-id';          // ❌
const chatId = '123';              // ❌
const chatId = 'test-chat-id';     // ❌
```

### 6. Separación de Capas — Dirección de Dependencias

```
domain ← application ← infrastructure
```

- **Domain**: sin imports de `application` ni `infrastructure`
- **Application**: puede importar `domain` y `shared`
- **Infrastructure**: puede importar todo
- **NUNCA** exponer entidades ORM fuera de `infrastructure` — usar mappers

### 7. Inyección de Repositorios — Symbol Token

Los repositorios se inyectan siempre por token Symbol, nunca por clase directa:

```typescript
// Definición en domain
export const CHAT_V2_REPOSITORY = Symbol('CHAT_V2_REPOSITORY');
export interface IChatRepository { ... }

// Inyección en handler
@Inject(CHAT_V2_REPOSITORY)
private readonly chatRepository: IChatRepository
```

---

## Patrones de Arquitectura

### Estructura por Contexto

```
src/context/<context>/
├── domain/
│   ├── entities/        # Aggregates (extienden AggregateRoot de @nestjs/cqrs)
│   ├── value-objects/   # Objetos inmutables con validación
│   ├── events/          # Definiciones de domain events
│   ├── errors/          # DomainError específicos del contexto
│   └── <entity>.repository.ts  # Interface + Symbol token
├── application/
│   ├── commands/        # Write operations (@CommandHandler)
│   ├── queries/         # Read operations (@QueryHandler)
│   ├── events/          # Side-effect handlers (@EventsHandler)
│   └── dtos/            # Contratos de API
└── infrastructure/
    ├── controllers/     # HTTP/WebSocket
    ├── persistence/     # Implementaciones de repositorios + mappers
    └── services/        # Integraciones externas
```

### Aggregate — Factory Methods

```typescript
// create() — para entidades nuevas (emite eventos)
public static create(props: ChatProperties): Chat {
  const chat = new Chat(...);
  chat.apply(new ChatCreatedEvent(...)); // emitir evento
  return chat;
}

// fromPrimitives() — para rehidratación desde BD (sin eventos)
public static fromPrimitives(raw: ChatPrimitives): Chat {
  return new Chat(...); // sin apply()
}

// toPrimitives() — para serialización
public toPrimitives(): ChatPrimitives { ... }
```

### Mapper — Nunca Exponer ORM Entities

```typescript
@Injectable()
export class ChatMapper {
  toPersistence(aggregate: Chat): ChatDocument { ... }
  fromPersistence(doc: ChatDocument): Chat {
    return Chat.fromPrimitives({ ... }); // siempre via fromPrimitives
  }
}
```

### Error de Dominio

```typescript
export class ChatNotFoundError extends DomainError {
  constructor(chatId: string) {
    super(`Chat ${chatId} no encontrado`);
  }
}
```

`DomainError` ya configura `name` y `instanceof` automáticamente — no necesita código extra.

---

## Convenciones de Nomenclatura

| Elemento | Patrón | Ejemplo |
|---------|--------|---------|
| Aggregate file | `<entity>.aggregate.ts` | `chat.aggregate.ts` |
| Value Object | `<Name>` | `ChatId`, `ChatStatus` |
| Repository interface | `I<Entity>Repository` | `IChatRepository` |
| Repository impl | `Mongo<Entity>RepositoryImpl` | `MongoChatRepositoryImpl` |
| Command Handler | `<Action>CommandHandler` | `CreateChatCommandHandler` |
| Query Handler | `<Action>QueryHandler` | `GetChatByIdQueryHandler` |
| Event Handler | `<Action>On<Event>EventHandler` | `NotifyOnChatCreatedEventHandler` |
| Test file | `<name>.spec.ts` | `create-chat.command-handler.spec.ts` |
| Test dir | `__tests__/` | junto al archivo fuente |
| Domain event | `<Entity><Action>Event` | `ChatCreatedEvent` |

---

## Estilo de Código

### Prettier (auto-enforce)
- Comillas simples: `'string'`
- Trailing commas: siempre
- Ejecutar antes de commit: `npm run format`

### ESLint — Reglas Clave
- `@typescript-eslint/no-explicit-any`: **off** (permitido)
- `@typescript-eslint/no-unused-vars`: **error** — prefijo `_` lo ignora
- `@typescript-eslint/no-floating-promises`: **warn**
- Operaciones unsafe: **warn** (relajado en tests)

### TypeScript
- `strictNullChecks`: **enabled** — no asumir que valores son no-nulos
- `noImplicitAny`: **off** — pero evitar `any` cuando sea posible
- `emitDecoratorMetadata`: **enabled** — requerido para NestJS DI

### Orden de Imports
1. Paquetes externos (`@nestjs/*`, `mongoose`, etc.)
2. Contexto shared (`src/context/shared/*`)
3. Mismo contexto
4. Imports relativos

---

## Testing

### Tipos de Tests y Configuración

| Tipo | Config | BD | Comando |
|------|--------|-----|---------|
| Unit | `jest-unit.json` | SQLite en memoria | `npm run test:unit` |
| Integration | `jest-int.json` | **MongoDB Memory Server** (en proceso) | `npm run test:int` |
| E2E | `test/jest-e2e.json` | Server real | `npm run test:e2e` |

> **Importante:** Los tests de integración con MongoDB usan `mongodb-memory-server` — **no requieren instancia MongoDB externa**. El setup está en `jest-int.setup.ts` que configura `MONGOMS_VERSION` y timeouts automáticamente (120s local, 300s en CI).

### Patrón de Test Unitario

```typescript
describe('CreateChatCommandHandler', () => {
  let handler: CreateChatCommandHandler;
  let mockRepo: jest.Mocked<IChatRepository>;

  beforeEach(async () => {
    mockRepo = {
      save: jest.fn().mockResolvedValue(okVoid()),
      findById: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        CreateChatCommandHandler,
        { provide: CHAT_V2_REPOSITORY, useValue: mockRepo },
      ],
    }).compile();

    handler = module.get(CreateChatCommandHandler);
  });

  it('debe crear un chat exitosamente', async () => {
    const visitorId = Uuid.random().value; // UUID real

    mockRepo.save.mockResolvedValue(okVoid());

    const result = await handler.execute(new CreateChatCommand(visitorId, ...));

    expect(result.isOk()).toBe(true);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });
});
```

### Reglas de Testing
- `describe` en **español**, lógica de test valida comportamiento
- Siempre usar `jest.Mocked<T>` para tipar mocks
- Archivo de test en `__tests__/` junto al archivo fuente
- Test regex unit: `.*(?<!int)(?<!e2e)\.spec\.ts$`
- Test regex integration: `.*\.int-spec\.ts$`

---

## Flujo Completo: Implementar un Nuevo Comando

Cuando se implementa un nuevo comando en un contexto V2, estos son los archivos a crear y el orden de registro:

### Archivos a crear

```
src/context/<context>/application/commands/
├── <action>-<entity>.command.ts           # 1. Definición del command (POJO)
└── <action>-<entity>.command-handler.ts   # 2. Handler con @CommandHandler

src/context/<context>/application/commands/__tests__/
└── <action>-<entity>.command-handler.spec.ts  # 3. Test unitario
```

### Registro en el módulo

Todo comando debe registrarse en `<context>.module.ts` como provider:

```typescript
// En <context>.module.ts
import { NewActionCommandHandler } from './application/commands/new-action.command-handler';

@Module({
  providers: [
    // ... otros providers
    NewActionCommandHandler,  // ← agregar aquí
  ],
})
export class MyContextModule {}
```

> **Nunca olvidar registrar el handler en el módulo** — NestJS CQRS no lo descubre automáticamente. Si falta, el CommandBus lanzará `CommandHandlerNotFoundException`.

### Estructura del handler

```typescript
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { MyCommand } from './my.command';
import { MY_REPOSITORY, IMyRepository } from '../../domain/my.repository';
import { Result, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

@CommandHandler(MyCommand)
export class MyCommandHandler implements ICommandHandler<MyCommand, Result<void, DomainError>> {
  constructor(
    @Inject(MY_REPOSITORY)
    private readonly repo: IMyRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: MyCommand): Promise<Result<void, DomainError>> {
    // 1. Lógica de dominio
    const entity = MyEntity.create({ ... });

    // 2. mergeObjectContext ANTES de save
    const aggregate = this.publisher.mergeObjectContext(entity);

    // 3. Persistir
    const result = await this.repo.save(aggregate);
    if (result.isErr()) return result;

    // 4. Publicar eventos (SIEMPRE al final, tras save exitoso)
    aggregate.commit();

    return okVoid();
  }
}
```

---



### Conventional Commits (en español)

```
<tipo>[ámbito opcional]: <descripción en imperativo>
```

**Tipos:**
- `feat(context):` nueva funcionalidad
- `fix(context):` corrección de bug
- `refactor(context):` refactorización
- `test(context):` agregar/corregir tests
- `docs:` documentación
- `chore:` mantenimiento

**Ejemplos válidos:**
```
feat(conversations-v2): agregar asignación automática de comerciales
fix(auth): corregir validación de JWT expirado
test(visitors-v2): agregar tests de integración para repositorio
```

### Scripts de Publicación (OpenCode)
- `/publish` — lint + unit tests + build + commit + push
- `/publish-quick` — lint + unit tests solamente
- `/publish-full` — incluye E2E

---

## Anti-Patrones Bloqueados

| ❌ Prohibido | ✅ Correcto |
|------------|-----------|
| `throw new Error()` para errores de negocio | `return err(new DomainError())` |
| Olvidar `aggregate.commit()` | Siempre después de `save()` exitoso |
| Importar infraestructura desde dominio | Solo domain ← application ← infrastructure |
| Exponer entidades ORM fuera de infra | Usar mappers en infrastructure |
| UUIDs falsos en tests (`'fake-id'`) | `Uuid.random().value` |
| Lógica de negocio en controllers | Delegar a CommandBus/QueryBus |
| Mutar aggregate directamente | Métodos devuelven nueva instancia |
| `async method(): Promise<Entity>` en repositorios | `Promise<Result<Entity, DomainError>>` |

---

## Integración WebSocket (Socket.io)

- Contexto `conversations-v2` usa WebSockets para tiempo real
- Autenticación por JWT en cabecera del handshake
- Eventos cliente→servidor: `message:send`, `typing:start`, `typing:stop`
- Eventos servidor→cliente: `message:received`, `typing:indicator`, `chat:closed`
- Siempre validar permisos por `companyId` para aislar datos entre empresas

---

## Notas de Contextos Específicos

### conversations-v2 (MongoDB)
- Aggregate `Chat` usa `apply()` (de `@nestjs/cqrs` `AggregateRoot`) no `addDomainEvent()`
- Mutations en aggregate devuelven **nueva instancia** (immutable pattern)
- Copiar `getUncommittedEvents()` al crear nueva instancia tras mutación
- El `commit()` se llama **después** de todos los saves exitosos

### auth
- JWT con `passport-jwt` + `jwks-rsa` (verificación con JWKS remoto)
- Guards: `AuthGuard`, `JwtCookieAuthGuard`, `DualAuthGuard`, `OptionalAuthGuard`
- Roles via `@Roles()` decorator + `RoleGuard`
- **Widget API keys** (`api-key/`): RSA 4096 + JWKS por dominio, tabla `api_key_entity` — autenticación de visitantes del widget. **No modificar.**
- **Integration API keys** (`integration-api-key/`): tokens `gdr_live_<32hex>` / `gdr_test_<32hex>` por compañía, hash SHA-256, tabla `integration_api_keys`. Guard: `IntegrationApiKeyGuard` (header `x-api-key`). Uso: backends externos que integran con Guiders via REST. El token en claro se devuelve **una única vez** al crear; solo el hash persiste en BD.

### company
- Toda query de negocio debe estar filtrada por `companyId`
- Aislamiento multi-tenant estricto
