# Tech Debt: TD-6 + TD-7 — CommandHandler decorators missing + IntegrationApiKeyEntity schema mismatch

Status: ready-for-dev

> **Origin**: Discovered during feat/embed-white-label end-to-end validation (2026-06-18). Two pre-existing bugs prevent the embed flow from working end-to-end with valid auth credentials.
>
> **TD-6**: `IntegrationApiKeyEntity` is decorated with `@Entity('integration_api_keys')` but the DB table is `api_key_entity` (legacy schema). When `IntegrationApiKeyGuard` calls `findByTokenHash()` with a non-existing token, TypeORM throws `EntityMetadataNotFoundError`.
>
> **TD-7**: `LogoutCommandHandler` is registered in `bff.module.ts` providers but is **missing the `@CommandHandler(LogoutCommand)` decorator** required by `@nestjs/cqrs` to register it with the `CommandBus`. Result: `CommandHandlerNotFoundException` when the controller calls `commandBus.execute(new LogoutCommand(...))`.

---

## TD-6: IntegrationApiKeyEntity schema mismatch

### Problem

```typescript
// src/context/auth/integration-api-key/infrastructure/integration-api-key.entity.ts:9
@Entity('integration_api_keys')
export class IntegrationApiKeyEntity {
  @Column(...) tokenHash: string;
  @Column(...) tokenPrefix: string;
  // ...
}
```

But the actual DB table is `api_key_entity` with columns: `id`, `apiKey`, `domain`, `publicKey`, `privateKey`, `kid`, `companyId`, `createdAt`.

When `IntegrationApiKeyOrmAdapter.findByTokenHash()` is called:

```typescript
async findByTokenHash(tokenHash: IntegrationApiKeyToken): Promise<IntegrationApiKey | null> {
  const entity = await this.repo.findOne({ where: { tokenHash: tokenHash.getValue() } });
  // ...
}
```

TypeORM looks for `integration_api_keys` table → not found → `EntityMetadataNotFoundError` → 500 Internal Server Error.

### Solution Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A** | Create migration to add `integration_api_keys` table | Correct schema, no legacy debt | Risky — may not match all features |
| **B** | Map `@Entity` to existing `api_key_entity` + adjust adapter to use legacy columns | No migration needed | Adapter must change (tokenHash → apiKey hash) |
| **C** | Skip TypeORM, use raw SQL via `DataSource.query()` | Most flexible | Loses type safety |

**Recommended**: **Option A** (migration) — create the `integration_api_keys` table with the schema the code expects. This is the cleanest fix.

### Acceptance Criteria (TD-6)

**AC1**: New TypeORM migration creates `integration_api_keys` table with columns: `id`, `companyId`, `name`, `tokenHash`, `tokenPrefix`, `environment`, `status`, `lastUsedAt`, `createdAt`, `updatedAt`.

**AC2**: Migration runs successfully: `npm run typeorm:migrate:run` → exits 0.

**AC3**: After migration, `IntegrationApiKeyGuard` works with invalid token → returns 401 Unauthorized (not 500).

**AC4**: Backward compat: existing `api_key_entity` table is NOT dropped.

---

## TD-7: LogoutCommandHandler missing `@CommandHandler` decorator

### Problem

```typescript
// src/context/auth/bff/application/commands/logout.command-handler.ts:59
@Injectable()
export class LogoutCommandHandler {  // ← MISSING @CommandHandler(LogoutCommand)
  // ...
}
```

When the controller calls `commandBus.execute(new LogoutCommand(...))`, NestJS CQRS looks up the handler in its internal registry. Without the `@CommandHandler(LogoutCommand)` decorator, the handler is NOT registered → `CommandHandlerNotFoundException`.

Sister classes in `auth-user/` (e.g., `UpdateUserAvatarCommand`) DO have the decorator → they work.

### Solution

Add the `@CommandHandler(LogoutCommand)` decorator to `LogoutCommandHandler` class. Apply the same pattern to all command handlers in `bff/` and `integration-api-key/` that are missing it.

### Acceptance Criteria (TD-7)

**AC1**: `@CommandHandler(LogoutCommand)` decorator is added to `LogoutCommandHandler` class.

**AC2**: `commandBus.execute(new LogoutCommand(...))` works correctly:
- With valid sessionId → returns ok with `LogoutCascadeResult`
- With invalid sessionId → returns err with `BffSessionNotFoundError`
- With missing cookie → controller catches and returns 401 (not 500)

**AC3**: Apply same fix to all missing decorators:
- `AuthenticateEmbedSessionCommandHandler` (bff)
- `CreateEmbedTokenCommandHandler` (integration-api-key)
- `RefreshEmbedTokenCommandHandler` (integration-api-key)
- `PersistEmbedTokenAuthenticatedEventHandler` (integration-api-key, but `@EventsHandler` for events)
- `PersistEmbedTokenAuthenticationFailedEventHandler` (integration-api-key)

**AC4**: All command handlers in `bff/` and `integration-api-key/` that use `@nestjs/cqrs` have the proper decorator.

---

## Tasks / Subtasks

### TD-6 Tasks

- [ ] **1.1**: Create migration file `src/migrations/TIMESTAMP-create-integration-api-keys-table.ts`:
  ```typescript
  export class CreateIntegrationApiKeysTableTIMESTAMP implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.createTable(new Table({
        name: 'integration_api_keys',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'companyId', type: 'uuid', isNullable: false },
          { name: 'name', type: 'varchar', length: '100', isNullable: false },
          { name: 'tokenHash', type: 'varchar', length: '255', isNullable: false, isUnique: true },
          { name: 'tokenPrefix', type: 'varchar', length: '50', isNullable: false },
          { name: 'environment', type: 'varchar', length: '10', isNullable: false, default: "'test'" },
          { name: 'status', type: 'varchar', length: '20', isNullable: false, default: "'active'" },
          { name: 'lastUsedAt', type: 'timestamp with time zone', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }));
    }
    public async down(queryRunner: QueryRunner): Promise<void> {
      await queryRunner.dropTable('integration_api_keys');
    }
  }
  ```
- [ ] **1.2**: Run `npm run typeorm:migrate:generate -- CreateIntegrationApiKeysTable` (verify it generates equivalent SQL)
- [ ] **1.3**: Run `npm run typeorm:migrate:run` → migration applied
- [ ] **1.4**: Restart server → verify `IntegrationApiKeyGuard` returns 401 on invalid token (not 500)

### TD-7 Tasks

- [ ] **2.1**: Add `@CommandHandler(LogoutCommand)` to `logout.command-handler.ts`:
  ```typescript
  import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
  
  @Injectable()
  @CommandHandler(LogoutCommand)
  export class LogoutCommandHandler implements ICommandHandler<LogoutCommand, Result<LogoutCascadeResult, DomainError>> {
    // ...
  }
  ```
- [ ] **2.2**: Add `@CommandHandler(AuthenticateEmbedSessionCommand)` to `authenticate-embed-session.command-handler.ts`
- [ ] **2.3**: Add `@CommandHandler(CreateEmbedTokenCommand)` to `create-embed-token.command-handler.ts`
- [ ] **2.4**: Add `@CommandHandler(RefreshEmbedTokenCommand)` to `refresh-embed-token.command-handler.ts`
- [ ] **2.5**: Audit all command handlers in `bff/` and `integration-api-key/` — add missing decorators
- [ ] **2.6**: Run `npm run test:unit -- src/context/auth/bff/ src/context/auth/integration-api-key/` → no regressions

### Combined Validation

- [ ] **3.1**: Start server clean (`EMAIL_SENDER=mock`)
- [ ] **3.2**: Test embed flow E2E with valid API key:
  - `POST /api/v2/integration/embed/start` → 200 with token
  - `POST /api/embed/authenticate-session` with Bearer → 200 with cookie
  - `GET /api/v2/integration/embed/audit-log` → 200 with audit entries
  - `POST /api/bff/auth/logout/embed` with cookie → 200 with cascade result
- [ ] **3.3**: Test invalid scenarios:
  - Invalid API key → 401 (not 500)
  - Invalid token → 401 (not 500)
  - Logout without cookie → 401 (not 500)

## Dev Notes

### Project Structure Notes

**Modified files (TD-6)**:
- `src/migrations/TIMESTAMP-create-integration-api-keys-table.ts` (NEW)
- Database schema (auto-generated by migration)

**Modified files (TD-7)**:
- `src/context/auth/bff/application/commands/logout.command-handler.ts` (+ decorator)
- `src/context/auth/bff/application/commands/authenticate-embed-session.command-handler.ts` (+ decorator)
- `src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler.ts` (+ decorator)
- `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler.ts` (+ decorator)
- Possibly others (audit each)

### Architecture Compliance

- **DDD layers**: Command handlers in `application/commands/` (correct)
- **CQRS**: Use `@nestjs/cqrs` decorators (`@CommandHandler` + `ICommandHandler<TCommand, TResult>`)
- **Symbol DI**: Unchanged
- **Result pattern**: All command handlers return `Promise<Result<T, DomainError>>`

### Library/Framework Requirements

- No new dependencies
- Uses existing `@nestjs/cqrs` (already in `package.json`)

### Testing Requirements

- **AI-3**: All new tests use specific assertions (`message.toContain`, `instanceof SpecificError`)
- **AI-1.5**: Use Pattern 0 (`npm run generate:red-tests`) for any new tests
- Existing tests should continue to pass (298+ tests)

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Migration fails on existing DB | LOW | HIGH | Test on dev DB first; backup before applying |
| Missing decorators break command bus | LOW | MEDIUM | All existing tests should catch this |
| Both fixes interact unexpectedly | LOW | LOW | They're independent (DB + decorator) |

## Dev Agent Record

### Agent Model Used

TBD

### Debug Log References

TBD

### Completion Notes List

TBD

### File List

TBD (filled by dev agent)

---

## Ready for Dev Checklist

- [x] Story spec is complete (2 TD items, 5 ACs, 3 task groups)
- [x] Root cause identified for each bug
- [x] Solution options evaluated with trade-offs
- [x] Affected files enumerated
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: Run `bmad-dev-story` workflow to implement both fixes.