# Story 1.2: Implement opaque token generation in EmbedTokenService

Status: done

## Story

As a Guiders backend service,
I want a `EmbedTokenService` that generates cryptographically random opaque tokens and stores them in Redis with namespace `embed:*`,
So that the embed auth flow has a secure, revocable token mechanism without JWT signing overhead.

## Acceptance Criteria

1. **Given** a `companyId`, `userId`, and `roles`
   **When** `EmbedTokenService.createToken(companyId, userId, roles)` is called
   **Then** it generates a 256-bit random token using `crypto.randomBytes(32).toString('base64url')`
   **And** it stores in Redis: `SET embed:token:<token> '{"userId":"...","companyId":"...","roles":[...],"createdAt":"..."}' EX 28800`
   **And** it returns `{ token, expiresAt: ISOString }`
   **And** the token format is URL-safe (no `+`, `/`, `=` characters)

2. **Given** a token stored in Redis
   **When** `EmbedTokenService.validateToken(token)` is called
   **Then** it returns `{ userId, companyId, roles, createdAt }` if the token exists
   **And** it returns `err(EmbedTokenNotFoundError)` if the token does not exist or is expired

3. **Given** a refresh request
   **When** `EmbedTokenService.refreshToken(oldToken)` is called
   **Then** it generates a new token
   **And** it stores the new token in Redis
   **And** it deletes the old token
   **And** it returns the new `{ token, expiresAt }`

4. **Given** a token
   **When** `EmbedTokenService.revokeToken(token)` is called
   **Then** it deletes the token from Redis
   **And** subsequent `validateToken` calls return `err(EmbedTokenNotFoundError)`

## Tasks / Subtasks

- [ ] Task 1: Define domain interface and errors (AC: #1, #2, #3, #4)
  - [ ] Subtask 1.1: Create `IEmbedTokenService` interface in `src/context/auth/integration-api-key/domain/services/embed-token.service.ts`
  - [ ] Subtask 1.2: Create `EmbedTokenNotFoundError` and `EmbedTokenError` in `src/context/auth/integration-api-key/domain/errors/embed-token.errors.ts`
  - [ ] Subtask 1.3: Define `EmbedTokenData` value object with `userId`, `companyId`, `roles[]`, `createdAt`
  - [ ] Subtask 1.4: Define `EMBED_TOKEN_SERVICE` Symbol for DI
- [ ] Task 2: Implement Redis-backed EmbedTokenService (AC: #1, #2, #3, #4)
  - [ ] Subtask 2.1: Create `RedisEmbedTokenService` in `src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts`
  - [ ] Subtask 2.2: Implement `createToken(companyId, userId, roles)` using `crypto.randomBytes(32).toString('base64url')` and `SET ... EX 28800`
  - [ ] Subtask 2.3: Implement `validateToken(token)` using `GET embed:token:<token>` and JSON.parse
  - [ ] Subtask 2.4: Implement `refreshToken(oldToken)` — validate old, generate new, atomic delete+set via MULTI
  - [ ] Subtask 2.5: Implement `revokeToken(token)` using `DEL embed:token:<token>`
  - [ ] Subtask 2.6: Implement `OnModuleInit`/`OnModuleDestroy` for Redis client lifecycle
- [ ] Task 3: Register service in IntegrationApiKeyModule (AC: #1)
  - [ ] Subtask 3.1: Add `RedisEmbedTokenService` to `providers` array
  - [ ] Subtask 3.2: Add `EMBED_TOKEN_SERVICE` provider mapping
  - [ ] Subtask 3.3: Export `EMBED_TOKEN_SERVICE` so other modules can inject it
- [ ] Task 4: Write unit tests (AC: #1, #2, #3, #4)
  - [ ] Subtask 4.1: `redis-embed-token.service.spec.ts` with InMemoryRedis mock (no external dep on redis lib)
  - [ ] Subtask 4.2: Test createToken — verify token format (base64url, 43 chars, no `+/=`)
  - [ ] Subtask 4.3: Test createToken — verify Redis SET with EX 28800
  - [ ] Subtask 4.4: Test validateToken — happy path returns parsed data
  - [ ] Subtask 4.5: Test validateToken — not found returns `err(EmbedTokenNotFoundError)`
  - [ ] Subtask 4.6: Test validateToken — malformed JSON returns `err(EmbedTokenError)`
  - [ ] Subtask 4.7: Test refreshToken — old token deleted, new token returned
  - [ ] Subtask 4.8: Test refreshToken — invalid old token returns `err(EmbedTokenNotFoundError)`
  - [ ] Subtask 4.9: Test revokeToken — DEL called, subsequent validate returns err

## Dev Notes

### Architecture Patterns to Follow

- **DDD/CQRS:** Service interface in `domain/services/`, implementation in `infrastructure/services/`
- **Result Pattern:** `Promise<Result<T, DomainError>>` in services, never throw for business errors
- **Symbol Token DI:** Inject via `@Inject(EMBED_TOKEN_SERVICE)`, never by class
- **Mappers in Infrastructure:** Never expose ORM entities or external lib types outside the persistence layer
- **Tests with `Uuid.random().value`:** NEVER fake strings for IDs
- **Describe in Spanish:** Convention for test descriptions
- **Redis namespace isolation:** Use prefix `embed:token:` for all keys (per NFR-SC1-SC4)
- **OnModuleInit/OnModuleDestroy:** Implement for clean Redis client lifecycle
- **No JWT here:** Opaque tokens only, NO JWT signing/verification overhead

### Token Format Specification

- **Algorithm:** `crypto.randomBytes(32).toString('base64url')` produces a 43-character string
- **Entropy:** 256 bits (32 bytes × 8 bits/byte)
- **Charset:** URL-safe base64 (`A-Z a-z 0-9 - _`) — no `+`, `/`, or `=` characters
- **Length:** 43 characters exactly (32 bytes encoded as base64url with padding stripped)

### Redis Key Schema

| Operation | Command | Key | Value | TTL |
|-----------|---------|-----|-------|-----|
| `createToken` | `SET` | `embed:token:<token>` | `{"userId":"...","companyId":"...","roles":[...],"createdAt":"..."}` | `EX 28800` (8 hours) |
| `validateToken` | `GET` | `embed:token:<token>` | (JSON string) | — |
| `refreshToken` | `MULTI` → `DEL` + `SET` | both `embed:token:<old>` and `embed:token:<new>` | old DEL'd, new SET'd | new: `EX 28800` |
| `revokeToken` | `DEL` | `embed:token:<token>` | — | — |

### Source Tree Components to Touch

**New files to create:**

- `src/context/auth/integration-api-key/domain/services/embed-token.service.ts` — interface
- `src/context/auth/integration-api-key/domain/errors/embed-token.errors.ts` — `EmbedTokenNotFoundError`, `EmbedTokenError`
- `src/context/auth/integration-api-key/domain/value-objects/embed-token-data.ts` — `EmbedTokenData` value object
- `src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts` — Redis impl
- `src/context/auth/integration-api-key/infrastructure/services/__tests__/redis-embed-token.service.spec.ts` — unit tests

**Files to modify:**

- `src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts` — register the service

### Project Structure Notes

- All new files go inside the existing `auth/integration-api-key` context (the embed feature is part of B2B integration, owned by the same subdomain)
- Follows the established pattern from `visitors-v2/infrastructure/connection/redis-visitor-connection.domain-service.ts` and `commercial/infrastructure/connection/redis-commercial-connection.domain-service.ts`
- No new module needed — extend `IntegrationApiKeyModule` providers

### Code Reuse / Patterns to Follow

**From `redis-visitor-connection.domain-service.ts`:**

```typescript
// Client initialization pattern
async onModuleInit() {
  this.client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });
  this.client.on('error', (err) =>
    this.logger.error('Error en cliente Redis', err),
  );
  await this.client.connect();
}

async onModuleDestroy() {
  if (this.client) {
    await this.client.quit();
  }
}
```

**From `integration-api-key-generator.service.ts`:**

```typescript
// Use crypto.randomBytes for secure random
import { randomBytes } from 'crypto';
const token = randomBytes(32).toString('base64url');
```

**From `integration-api-key.errors.ts`:**

```typescript
// Domain error pattern
import { DomainError } from 'src/context/shared/domain/domain.error';

export class EmbedTokenNotFoundError extends DomainError {
  constructor(token: string) {
    super(`Embed token no encontrado o expirado: ${token.substring(0, 8)}...`);
  }
}
```

### Testing Standards

- **Unit tests:** Use InMemoryRedis mock (Map<string, string>) — no external redis dependency for unit tests
- **Mock the Redis client:** Inject a mock `RedisClientType` with `get`, `set`, `del`, `multi`, `expire`, `exec` methods
- **Test naming:** `<file>.spec.ts` for unit tests
- **Test coverage:**
  - Happy paths for all 4 methods
  - Error paths for all 4 methods
  - Token format validation (length 43, base64url charset)
  - Redis key format validation (must start with `embed:token:`)
  - TTL value validation (must be 28800 for createToken)

### Security Considerations (NFR-S1, S2, S3, S4)

- **NFR-S1 (256-bit tokens):** Use `crypto.randomBytes(32)` — NOT `Math.random()`, NOT `Date.now()`
- **NFR-S2 (Redis namespace):** All keys prefixed with `embed:token:` to isolate from BFF sessions
- **NFR-S3 (8h TTL):** Hard-coded `EX 28800` (8 hours × 3600 seconds) — NOT configurable per token
- **NFR-S4 (no PII in token):** Token is opaque, contains NO user info — only the Redis value does
- **NFR-S10 (Redis authenticated):** Reuses existing `REDIS_URL` with credentials from env

### Multi-tenant Isolation

The `companyId` is stored INSIDE the token data (in the Redis value), NOT in the token itself. This means:
- A token is globally unique (no collision across tenants)
- `validateToken` returns the `companyId` so callers can enforce tenant checks
- Future Story 1.3 (`POST /v2/integration/embed/start`) will validate that the API key's `companyId` matches the token's `companyId`

### Out of Scope (deferred to other stories)

- **Story 1.3:** HTTP endpoint `POST /v2/integration/embed/start` (uses this service via the controller)
- **Story 1.4:** `POST /v2/integration/embed/refresh` (uses `refreshToken`)
- **Story 2.2:** `EmbedTokenAuthenticatedEvent` emission (audit log) — this story just provides the service
- **Story 2.3:** `revokeToken` called from logout flow

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.2] — original story definition with BDD ACs
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision-NFR-S1-S10] — security NFRs (256-bit tokens, namespace, TTL)
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision-NFR-SC1-SC4] — Redis namespace scalability decisions
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision-D5] — opaque tokens vs JWT rationale
- [Source: src/context/visitors-v2/infrastructure/connection/redis-visitor-connection.domain-service.ts] — Redis client lifecycle pattern
- [Source: src/context/auth/integration-api-key/infrastructure/integration-api-key-generator.service.ts] — `crypto.randomBytes` pattern
- [Source: src/context/auth/integration-api-key/domain/errors/integration-api-key.errors.ts] — DomainError pattern
- [Source: src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts] — module registration pattern
- [Source: _bmad-output/implementation-artifacts/1-1-extend-white-label-configs-schema-for-embed.md] — previous story learnings (defensive copy, strict validation, e2e tests)

## Dev Agent Record

### Agent Model Used

MiniMax-M3 (MiniMax Coding Plan)

### Debug Log References

- RED phase: tests fallaron por 3 módulos no encontrados (esperado)
- Tras implementar: 16/16 tests passing
- Suite completa: 193/193 unit suites + 1662 tests, 0 regresiones
- Lint: 0 errors, 0 warnings en archivos modificados

### Completion Notes List

- **Domain (3 archivos nuevos):**
  - `IEmbedTokenService` interface + `EMBED_TOKEN_SERVICE` Symbol DI
  - `EmbedTokenData` + `EmbedTokenIssued` interfaces (value objects livianos)
  - `EmbedTokenNotFoundError` + `EmbedTokenError`
- **Infrastructure (1 archivo nuevo):**
  - `RedisEmbedTokenService` — implementa los 4 métodos con:
    - `crypto.randomBytes(32).toString('base64url')` para tokens 256-bit
    - `SET ... EX 28800` (8h TTL) con valor JSON
    - `MULTI` + `DEL` + `SET` + `EXPIRE` para refresh atómico
    - `DEL` para revocación idempotente
    - `OnModuleInit`/`OnModuleDestroy` para lifecycle del cliente Redis
    - Validación de formato de token (43 chars) en validateToken
- **Module (1 archivo modificado):**
  - Registra `EMBED_TOKEN_SERVICE` provider
  - Exporta el token para uso en otros contexts (Stories 1.3, 1.4, 2.1+)
- **Tests (1 archivo nuevo):**
  - 16 tests con InMemoryRedisClient mock (sin dep externa de redis lib)
  - Cubre happy paths + error paths + formato de token + namespace prefix + TTL

### File List

- `src/context/auth/integration-api-key/domain/services/embed-token.service.ts` (new)
- `src/context/auth/integration-api-key/domain/errors/embed-token.errors.ts` (new)
- `src/context/auth/integration-api-key/domain/value-objects/embed-token-data.ts` (new)
- `src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts` (new)
- `src/context/auth/integration-api-key/infrastructure/services/__tests__/redis-embed-token.service.spec.ts` (new)
- `src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts` (modified)

### Change Log

- 2026-06-12 15:15 — Story 1.2 implementada con TDD. Status: review.
