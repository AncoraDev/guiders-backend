# AGENTS.md - Guiders Backend

NestJS v11 backend with DDD+CQRS architecture, multi-persistence (PostgreSQL + MongoDB), and real-time WebSocket communication.

📚 **Documentation index**: [`docs/README.md`](docs/README.md)  
🐳 **Docker**: [`docker/README.md`](docker/README.md) — `npm run docker:up`

## Build, Lint & Test Commands

```bash
# Development
npm run start:dev              # Start with hot-reload
npm run build                  # Production build
npm run lint                   # ESLint with auto-fix
npm run format                 # Prettier formatting

# Testing - Unit (fast, SQLite in-memory)
npm run test:unit                                    # All unit tests
npm run test:unit -- src/context/auth/application/commands/__tests__/file.spec.ts  # Single file
npm run test:unit -- --testNamePattern="should create"   # Tests matching pattern

# Testing - Integration (requires real DBs)
npm run test:int                 # All integration tests
npm run test:int:dev             # Without coverage

# Testing - E2E
npm run test:e2e                 # Full server tests

# Database
npm run typeorm:migrate:run      # Run PostgreSQL migrations
npm run typeorm:migrate:generate # Generate new migration

# CLI Tools
node bin/guiders-cli.js create-company --name "Company" --domain "example.com"
node bin/guiders-cli.js clean-database --force

# OpenCode Custom Commands (recommended)
/publish              # Publish to GitHub with full validations (lint + tests + build)
/publish-quick        # Quick publish (lint + unit tests only)
/publish-full         # Full publish including E2E tests
```

> **💡 Tip:** Use `/publish` in OpenCode to automatically run lint, tests, build, commit and push to GitHub.  
> See [OpenCode Commands Guide](./.opencode/QUICK_START.md) for details.

## Project Structure

```
src/context/<context>/
├── domain/              # Pure business logic (no external deps)
│   ├── entities/        # Aggregates extending AggregateRoot
│   ├── value-objects/   # Immutable objects with validation
│   ├── events/          # Domain events
│   └── <entity>.repository.ts  # Interface + Symbol
├── application/         # Orchestration layer
│   ├── commands/        # Write operations (@CommandHandler)
│   ├── queries/         # Read operations (@QueryHandler)
│   ├── events/          # Side-effects handlers
│   └── dtos/            # API contracts
└── infrastructure/      # External adapters
    ├── controllers/     # HTTP/WebSocket endpoints
    ├── persistence/     # Repository implementations
    └── services/        # External integrations
```

**Active Contexts (V2 - MongoDB)**: `conversations-v2`, `visitors-v2` - Use for new features  
**Legacy Contexts (V1 - PostgreSQL)**: `conversations`, `visitors` - Maintenance only  
**Core**: `auth`, `company`, `tracking`, `llm`, `leads`

## Code Style Guidelines

### Formatting (Prettier)

- Single quotes: `'string'`
- Trailing commas: always
- Run `npm run format` before committing

### ESLint Rules

- `@typescript-eslint/no-explicit-any`: off (allowed)
- `@typescript-eslint/no-unused-vars`: error, but `_` prefix ignored
- Floating promises: warn
- Unsafe operations: warn (relaxed in test files)

### TypeScript

- Target: ES2021
- `strictNullChecks`: enabled
- `experimentalDecorators`: enabled
- `emitDecoratorMetadata`: enabled

### Naming Conventions

| Element              | Pattern                           | Example                               |
| -------------------- | --------------------------------- | ------------------------------------- |
| Aggregate            | `<Entity>` or `<Entity>Aggregate` | `Chat`, `ChatAggregate`               |
| Aggregate file       | `<entity>.aggregate.ts`           | `chat.aggregate.ts`                   |
| Value Object         | `<Name>`                          | `ChatId`, `ChatStatus`                |
| Repository interface | `<Entity>Repository`              | `ChatRepository`                      |
| Repository impl      | `Mongo<Entity>RepositoryImpl`     | `MongoChatRepositoryImpl`             |
| Command Handler      | `<Action>CommandHandler`          | `CreateChatCommandHandler`            |
| Query Handler        | `<Action>QueryHandler`            | `GetChatByIdQueryHandler`             |
| Event Handler        | `<Action>On<Event>EventHandler`   | `NotifyOnChatCreatedEventHandler`     |
| Test file            | `<name>.spec.ts`                  | `create-chat.command-handler.spec.ts` |

### Import Order

1. External packages (`@nestjs/*`, `mongoose`, etc.)
2. Shared context (`src/context/shared/*`)
3. Same context imports
4. Relative imports

## Architecture Patterns

### Result Pattern (CRITICAL)

Use `Result<T, E>` instead of exceptions for expected errors:

```typescript
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';

async findById(id: ChatId): Promise<Result<Chat, DomainError>> {
  const entity = await this.model.findOne({ id: id.value });
  if (!entity) return err(new ChatNotFoundError(id.value));
  return ok(this.mapper.toDomain(entity));
}

// In handlers - check before unwrap
if (result.isErr()) return result;
const value = result.unwrap(); // Safe after isErr check
```

### Event Publishing (CRITICAL)

Always call `commit()` after `mergeObjectContext()` + `save()`:

```typescript
const aggregate = this.publisher.mergeObjectContext(chat);
const saveResult = await this.repo.save(aggregate);
if (saveResult.isErr()) return saveResult;
aggregate.commit(); // Without this, events are NOT published
```

### Aggregates

- Private constructor, use factory methods
- `create()` - emits events (new entities)
- `fromPrimitives()` - no events (rehydration)
- `toPrimitives()` - serialization

### Mappers

Never expose ORM entities outside infrastructure. Use mappers:

- `toPersistence(aggregate)` - domain to ORM entity
- `fromPersistence(entity)` - ORM entity to domain

## Testing Guidelines

- Use `@nestjs/testing` for module creation
- Tests in `__tests__/` folder alongside source
- **Always use real UUIDs**: `Uuid.random().value` (never fake IDs)
- Mock dependencies with `jest.Mocked<T>`
- Describe blocks in Spanish, test logic validates behavior

```typescript
describe('CreateChatCommandHandler', () => {
  it('debe crear un chat exitosamente', async () => {
    const chatId = Uuid.random().value; // Real UUID
    mockRepo.save.mockResolvedValue(okVoid());
    const result = await handler.execute(command);
    expect(result.isOk()).toBe(true);
  });
});
```

## Anti-Patterns (BLOCK)

| Prohibited                          | Correct                                      |
| ----------------------------------- | -------------------------------------------- |
| Business logic in controllers       | Delegate to CommandBus/QueryBus              |
| `throw new Error()` for validations | `return err(new DomainError())`              |
| Concatenated SQL                    | `CriteriaConverter` + QueryBuilder           |
| Exposing ORM entities               | Use mappers in infrastructure                |
| Forgetting `commit()`               | Always after `save()`                        |
| Importing infra from domain         | Only domain <- application <- infrastructure |
| Fake UUIDs in tests                 | `Uuid.random().value`                        |

## Language Policy

| Element              | Language                       |
| -------------------- | ------------------------------ |
| Code identifiers     | English                        |
| Comments & docs      | Spanish                        |
| Swagger descriptions | Spanish                        |
| Error messages       | Spanish                        |
| Commit messages      | Spanish (Conventional Commits) |

## Feature-Specific Documentation

Each context has its own `AGENTS.md` with detailed feature specifications, domain models, and implementation guidelines:

### Core Contexts

- **[auth](./src/context/auth/AGENTS.md)** - Authentication & authorization (JWT, roles, permissions)
- **[company](./src/context/company/AGENTS.md)** - Company management & organization
- **[shared](./src/context/shared/AGENTS.md)** - Shared utilities (Result pattern, Value Objects, Events)

### Active Contexts (V2 - MongoDB)

- **[conversations-v2](./src/context/conversations-v2/AGENTS.md)** - Chat system with real-time messaging
- **[visitors-v2](./src/context/visitors-v2/AGENTS.md)** - Visitor tracking & identification
- **[tracking-v2](./src/context/tracking-v2/AGENTS.md)** - Event tracking & analytics

### Feature Contexts

- **[leads](./src/context/leads/AGENTS.md)** - Lead management & tracking
- **[llm](./src/context/llm/AGENTS.md)** - LLM integration & AI features
- **[lead-scoring](./src/context/lead-scoring/AGENTS.md)** - Lead scoring & qualification
- **[commercial](./src/context/commercial/AGENTS.md)** - Commercial/billing operations
- **[white-label](./src/context/white-label/AGENTS.md)** - White-label customization
- **[consent](./src/context/consent/AGENTS.md)** - Consent management & GDPR

### Legacy Contexts (V1 - PostgreSQL, Maintenance Only)

- **[conversations](./src/context/conversations/AGENTS.md)** - Legacy chat system (deprecated)
- **[visitors](./src/context/visitors/AGENTS.md)** - Legacy visitor tracking (deprecated)

## How to Navigate This Documentation

1. **Start here** for general architecture, build commands, and code style
2. **Visit feature-specific AGENTS.md** for detailed domain models, use cases, and implementation patterns
3. Each feature AGENTS.md includes:
   - Context overview and responsibilities
   - Domain entities and value objects
   - Key use cases and commands
   - Database schema (if applicable)
   - Integration points with other contexts
   - Testing strategies
   - Known limitations and future improvements

## Additional Resources

- **Detailed rules**: `.claude/rules/` (21 architecture pattern files)
- **Copilot instructions**: `.github/copilot-instructions.md`
- **Context-specific instructions**: `.github/instructions/*.instructions.md`
- **Commit conventions**: `.copilot-commit-message-instructions.md`
