# Tech Debt: Fix `RedisBffSessionService` constructor DI incompatibility (TD-4)

Status: ready-for-dev

> **Origin**: Discovered during manual smoke test of feat `embed-white-label` (2026-06-18). The `npm run start:dev` command fails with `Nest can't resolve dependencies of the RedisBffSessionService (?). Please make sure that the argument at index [0] is available in the current module.` This blocks the server from starting in dev mode, blocking manual E2E testing.
>
> **Introduced in**: PR #115 (commit `5305967`, Story 2.3 cascade revoke hotfix). NOT in feat `embed-white-label` directly, but introduced in the same Epic 2 batch.
>
> **Priority**: HIGH — blocks server start in dev mode, blocks manual QA of any embed feature.

---

## Problem Statement

`RedisBffSessionService` (`src/context/auth/bff/infrastructure/services/redis-bff-session.service.ts:54-70`) has a constructor signature that is incompatible with NestJS DI:

```typescript
@Injectable()
export class RedisBffSessionService
  implements IBffSessionService, OnModuleInit, OnModuleDestroy
{
  private client: RedisClientType;

  constructor(clientOverride?: RedisClientType) {  // ← BAD
    if (clientOverride) {
      this.client = clientOverride;
    }
  }
  // ...
}
```

When NestJS tries to instantiate this provider via reflection metadata, it sees:
- 1 constructor parameter of type `RedisClientType`
- No `@Inject()` or `@Optional()` decorator
- `RedisClientType` is a TypeScript type only — erased at runtime, no DI token available

Result: **NestJS throws `UnknownDependenciesException`** at startup, preventing the server from booting.

This works in unit tests because the test bypasses DI and calls the constructor directly with a mock client. But it fails in production when NestJS attempts to construct the provider.

## Root Cause

The class was designed to support both production (create client in `onModuleInit`) and testing (inject mock client via constructor). However, mixing these two responsibilities in a single constructor breaks NestJS DI.

The sister class `RedisEmbedTokenService` (`src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts:70-75`) correctly uses **constructor without args** + `onModuleInit` for client creation:

```typescript
@Injectable()
export class RedisEmbedTokenService
  implements IEmbedTokenService, OnModuleInit, OnModuleDestroy
{
  private client: RedisClientType;

  // NO CONSTRUCTOR — NestJS instantiates without args

  async onModuleInit(): Promise<void> {
    this.client = createClient({ url: process.env.REDIS_URL, ... });
    // ...
  }
}
```

## Solution

Apply the same pattern as `RedisEmbedTokenService` to `RedisBffSessionService`:

1. **Remove** `clientOverride?: RedisClientType` from constructor
2. **Add** an `internalSetClient()` method (package-private) for tests to inject a mock
3. **Modify** `onModuleInit` to skip client creation if already set (via the internal setter)
4. **Update** unit tests to use `internalSetClient()` instead of constructor injection

## Acceptance Criteria

### AC1: Server starts in dev mode

**Given** the Guiders backend NestJS application
**When** `npm run start:dev` is executed
**Then**:
1. Application bootstraps successfully
2. `RedisBffSessionService` is instantiated without DI errors
3. `/health` (or any other endpoint) responds with 2xx/4xx (not 500)
4. No `UnknownDependenciesException` in the startup logs

### AC2: Existing unit tests still pass

**Given** the existing test suite (`src/context/auth/bff/infrastructure/services/__tests__/redis-bff-session.service.spec.ts`)
**When** `npm run test:unit -- src/context/auth/bff/` is executed
**Then**:
1. All 122+ existing tests pass (currently 123)
2. Tests use `internalSetClient()` instead of constructor injection
3. No test is deleted or skipped

### AC3: Production behavior unchanged

**Given** the production environment with `REDIS_URL` env var set
**When** the application starts
**Then**:
1. `RedisBffSessionService.onModuleInit()` creates a real `redis` client
2. Connects to `process.env.REDIS_URL || 'redis://localhost:6379'`
3. Reuses the existing reconnect strategy (5000ms timeout, exponential backoff)
4. The `error` event handler still logs Redis errors

### AC4: AI-4 compliance (no inline duplication)

**Given** the fix
**When** applied
**Then**:
1. The `internalSetClient()` method is documented as `@internal` (JSDoc)
2. Only used by tests in `__tests__/`
3. Not exported by `bff.module.ts`

### AC5: Module wiring verified

**Given** the fix is applied
**When** `npm run build` is executed
**Then**:
1. 0 build errors
2. `bff.module.ts` doesn't need changes (provider class is unchanged from module perspective)

## Tasks / Subtasks

### Task 1: Refactor RedisBffSessionService (15 min)

- [ ] **1.1**: Remove `constructor(clientOverride?: RedisClientType)` from `RedisBffSessionService`
- [ ] **1.2**: Add `@internal` `internalSetClient(client: RedisClientType)` method
  ```typescript
  /**
   * @internal Only for unit tests. Production code MUST NOT call this.
   * In production, the client is created in onModuleInit() from REDIS_URL.
   */
  internalSetClient(client: RedisClientType): void {
    this.client = client;
  }
  ```
- [ ] **1.3**: Modify `onModuleInit()` to skip client creation if already set
  ```typescript
  async onModuleInit(): Promise<void> {
    if (this.client) return; // ← Skip if test injected a client
    // ... existing logic
  }
  ```
- [ ] **1.4**: Verify no other files in `src/` import or call the constructor with args

### Task 2: Update unit tests (15 min)

- [ ] **2.1**: Replace `new RedisBffSessionService(client as ...)` with:
  ```typescript
  service = new RedisBffSessionService();
  service.internalSetClient(client as unknown as RedisClientType);
  await service.onModuleInit();
  ```
- [ ] **2.2**: Update all 5 instantiation sites (lines 114, 378, 526, 555, 651)
- [ ] **2.3**: Run tests: `npm run test:unit -- src/context/auth/bff/`

### Task 3: Verification (10 min)

- [ ] **3.1**: Run `npm run build` → 0 errors
- [ ] **3.2**: Run `npm run test:unit -- src/context/auth/` → 245+ tests pass
- [ ] **3.3**: Run `npm run start:dev` → server starts without `UnknownDependenciesException`
- [ ] **3.4**: Curl `/health` → responds 200 (or 404 if not implemented, but no 500)
- [ ] **3.5**: Run `bash scripts/test-feat-embed-white-label.sh` → all suites pass

### Task 4: Documentation (5 min)

- [ ] **4.1**: Update `src/context/auth/bff/AGENTS.md` with note about the constructor pattern
- [ ] **4.2**: Update `sprint-status.yaml`: TD-4 marked as `done`

## Dev Notes

### Project Structure Notes

- **Modified file**: `src/context/auth/bff/infrastructure/services/redis-bff-session.service.ts` (lines 54-70)
- **Modified file**: `src/context/auth/bff/infrastructure/services/__tests__/redis-bff-session.service.spec.ts` (5 instantiation sites)

### Architecture Compliance

- **DDD layers**: Service is in `infrastructure/services/` (correct — Redis is an external adapter)
- **Symbol DI**: `BFF_SESSION_SERVICE` Symbol is used by other modules; unchanged
- **Result pattern**: All service methods return `Promise<Result<T, E>>`; unchanged
- **NestJS conventions**: `@Injectable()` + `OnModuleInit` + `OnModuleDestroy`; unchanged

### Library/Framework Requirements

- No new dependencies required
- No breaking changes to public API (`IBffSessionService` interface unchanged)

### Testing Requirements

- AI-3: Tests still use specific assertions (`message.toContain`, `instanceof SpecificError`)
- No new tests required (existing 123 tests cover the behavior)
- Replay-style verification: run `npm run test:feat-smoke` after fix

### Previous Story Intelligence

- **Story 2.3** (PR #115): Introduced the cascade revoke hotfix which required `cascadeRevoke` to work. The constructor was likely added for testing convenience during the hotfix, breaking NestJS DI.
- **Tech debt F6** (Epic 2 retro): `OnModuleDestroy` was implemented in `MongoEmbedTokenAuditLogRepositoryImpl` (sister pattern). This is the equivalent for BFF session.
- **RedisEmbedTokenService** (Story 1.2): The reference implementation for correct constructor pattern. Apply the same approach.

### References

- Sister class: `src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts:70-88`
- NestJS DI docs: https://docs.nestjs.com/providers
- `@internal` JSDoc convention: https://api-extractor.com/pages/tsdoc/tag_internal/

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Other modules break due to constructor signature change | LOW | HIGH | Module exports `BFF_SESSION_SERVICE` Symbol, not the class — DI uses Symbol |
| Unit tests fail due to `internalSetClient` not being public | LOW | MEDIUM | Make it `public` but document as `@internal` |
| Production client creation behavior changes | LOW | HIGH | Explicit `if (this.client) return` early return preserves backward compat |

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

- [x] Story spec is complete (5 ACs, 4 tasks, dev notes, risk assessment)
- [x] Root cause is clear (constructor with non-decorated optional param)
- [x] Sister class reference provided (`RedisEmbedTokenService`)
- [x] All affected files identified (1 service + 1 test file)
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: Run `bmad-dev-story` workflow (Pattern 0 from Story AI-X) to generate failing tests, then implement the fix.