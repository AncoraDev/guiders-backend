# Story 2.2: Implement EmbedTokenAuthenticated event and audit log persistence

Status: done

## Story

As a Guiders support user investigating a ticket,
I want every embed authentication event (success or failure) to be persisted with tenant ID, user ID, origin, timestamp, IP, and user agent,
So that I can trace issues and detect abuse.

## Context (Why this story)

- **Story 2.1 delivered**: `POST /embed/authenticate-session` que valida un embed token contra Redis via `EmbedTokenService.validateToken` y crea una BFF session cookie. La auditoría es **el siguiente paso natural** para compliance (GDPR) y observabilidad.
- **Missing piece**: cada auth success/failure actualmente solo se loggea (o ni eso). No hay rastro persistente para que un agente de soporte investigue un ticket: "el usuario X de la empresa Y intentó autenticarse a las 14:32 con IP Z, falló porque su tenant desactivó embed a las 14:30".
- **What this story adds**:
  1. `EmbedTokenAuthenticatedEvent` (success) emitido por `AuthenticateEmbedSessionCommandHandler` (y por `CreateEmbedTokenCommandHandler` para cubrir todos los entry points)
  2. `EmbedTokenAuthenticationFailedEvent` (failure) emitido por todos los handlers cuando retornan error
  3. `PersistEmbedTokenAuthenticatedEventHandler` y `PersistEmbedTokenAuthenticationFailedEventHandler` que persisten a MongoDB
  4. MongoDB collection `embed_token_audit_log` con TTL index 12 meses (NFR-S7 GDPR)
  5. Query endpoints para que support team investigue (read-only, scoped por companyId)
- **What this story does NOT do** (deferred):
  - Real-time alerting (SSE/WebSocket) sobre eventos sospechosos
  - Rate limiting basado en audit log (relacionado con Story 1.4 F8)
  - GDPR data subject access request (DSAR) endpoint
  - Embedding de audit events en otros sistemas (Splunk, Datadog)
- **First story in embed namespace to introduce event publishing**. Story 1.3 y 1.4 NO emiten eventos (verifican embeds, no los crean). El patrón de `EventPublisher` existe en otros contextos (`accept-invite-command.handler.ts`, `update-user-avatar-command.handler.ts`) — los audit log handlers serán los primeros en el contexto embed.

## Acceptance Criteria

### AC1: Success event emitted with all required fields

**Given** a successful embed authentication via `POST /embed/authenticate-session`
**When** the auth completes (200 OK with session established)
**Then** an `EmbedTokenAuthenticatedEvent` is emitted with all fields:
- `companyId: string (UUID v4)`
- `userId: string (UUID v4)`
- `origin: string` (from `req.headers.origin` or `req.headers.referer`, whichever is present)
- `timestamp: ISO 8601 string`
- `ipAddress: string` (from `req.ip` or `req.headers['x-forwarded-for']` first value)
- `userAgent: string` (from `req.headers['user-agent']`, may be empty)
- `endpoint: string` (the endpoint that was authenticated, e.g., `/embed/authenticate-session`)
**And** the event is handled by `PersistEmbedTokenAuthenticatedEventHandler` which writes to MongoDB collection `embed_token_audit_log`
**And** the document is queryable by `companyId`, `userId`, or time range

### AC2: Failure events emitted with reason code

**Given** a failed embed authentication (any of: invalid token, expired token, token not found, user not in tenant, body mismatch, Mongo/Redis down)
**When** the auth attempt fails (401/403/503 response)
**Then** an `EmbedTokenAuthenticationFailedEvent` is emitted with:
- All fields from AC1
- `failureReason: string` (one of: `EMBED_TOKEN_EXPIRED`, `EMBED_TOKEN_INVALID`, `EMBED_TOKEN_MISSING`, `EMBED_BODY_TOKEN_MISMATCH`, `EMBED_DISABLED_FOR_TENANT`, `EMBED_USER_NOT_IN_TENANT`, `EMBED_TENANT_MISMATCH`, `EMBED_SERVICE_UNAVAILABLE`, `UNKNOWN_ERROR`)
- `failureDetail: string` (the error message, max 500 chars, sanitized of any sensitive data)
**And** the failure event is persisted to the same collection with `result: "failure"`

### AC3: TTL index 12 months for GDPR compliance

**Given** the `embed_token_audit_log` collection exists
**When** documents are inserted
**Then** each document has an `expiresAt: Date` field set to `now + 365 * 24 * 3600 * 1000` (12 months)
**And** a TTL index on `expiresAt` with `expireAfterSeconds: 0` causes MongoDB to auto-delete documents after the retention period
**And** the index is created at application startup (idempotent, no-op if exists)

### AC4: EmbedTokenAuthenticated events also emitted from refresh

**Given** a successful token refresh via `POST /v2/integration/embed/refresh` (Story 1.4)
**When** the refresh completes (200 OK with new token)
**Then** an `EmbedTokenAuthenticatedEvent` is emitted (NOT a separate RefreshedEvent — it's the same event class with the new token as part of the auth flow)
**And** `endpoint: "/v2/integration/embed/refresh"` is included in the event

### AC5: EmbedTokenAuthenticated events from POST /v2/integration/embed/start

**Given** a successful token issuance via `POST /v2/integration/embed/start` (Story 1.3)
**When** the token is created (200 OK with token)
**Then** an `EmbedTokenAuthenticatedEvent` is emitted
**And** `endpoint: "/v2/integration/embed/start"` is included

### AC6: Query endpoint for support team

**Given** the audit log collection has events
**When** a support team member calls `GET /v2/integration/embed/audit-log` with query params:
- `companyId: UUID v4 (required)` — scope to tenant
- `userId: UUID v4 (optional)` — filter by user
- `fromDate: ISO 8601 (optional)` — start of time range
- `toDate: ISO 8601 (optional)` — end of time range
- `result: "success" | "failure" (optional)` — filter by outcome
- `limit: number (default 100, max 1000)` — pagination
- `skip: number (default 0)` — pagination
**Then** the response is `200 OK` with `{ events: [...], total: number }` containing matching events in **chronological order** (most recent first)
**And** only events for the requested `companyId` are returned (multi-tenant isolation)
**And** the endpoint requires `IntegrationApiKeyGuard` (server-to-server only, NOT embed iframe)

### AC7: Event publishing doesn't break the main flow

**Given** any of the auth endpoints (`start`, `refresh`, `authenticate-session`)
**When** the event publisher throws or Mongo is down
**Then** the HTTP response still succeeds (or fails with the same status code as before — the auth flow is not affected by audit log failures)
**And** a WARN log is emitted with the event payload (for manual recovery)
**And** the audit failure is **NOT** surfaced to the caller (no information leak about Mongo health)

### AC8: PII sanitization

**Given** any event is about to be persisted
**When** the event payload is written to MongoDB
**Then** the `ipAddress` field is hashed with SHA-256 (first 16 chars of the hex digest) to avoid storing raw PII (GDPR Art. 4(1) — IP is personal data)
**And** the `userAgent` field is truncated to 500 chars max
**And** the `failureDetail` field is truncated to 500 chars and stripped of any token-like patterns (`/[A-Za-z0-9_-]{40,}/g`)

## Tasks / Subtasks

- [ ] **Task 1: Domain events for embed token authentication** (AC: 1, 2)
  - [ ] 1.1 Create `src/context/auth/integration-api-key/domain/events/embed-token-authenticated.event.ts` exporting `EmbedTokenAuthenticatedEvent` extending `DomainEvent<{ companyId, userId, origin, timestamp, ipAddress, userAgent, endpoint }>`. Add `static EVENT_NAME = 'EmbedTokenAuthenticatedEvent'`.
  - [ ] 1.2 Create `src/context/auth/integration-api-key/domain/events/embed-token-authentication-failed.event.ts` exporting `EmbedTokenAuthenticationFailedEvent` extending `DomainEvent<{ companyId, userId, origin, timestamp, ipAddress, userAgent, endpoint, failureReason, failureDetail }>`. Add `static EVENT_NAME = 'EmbedTokenAuthenticationFailedEvent'`.
  - [ ] 1.3 Create `src/context/auth/integration-api-key/domain/events/embed-auth-failure-reason.enum.ts` exporting `EmbedAuthFailureReason` enum: `EMBED_TOKEN_EXPIRED | EMBED_TOKEN_INVALID | EMBED_TOKEN_MISSING | EMBED_BODY_TOKEN_MISMATCH | EMBED_DISABLED_FOR_TENANT | EMBED_USER_NOT_IN_TENANT | EMBED_TENANT_MISMATCH | EMBED_SERVICE_UNAVAILABLE | UNKNOWN_ERROR`.
  - [ ] 1.4 Add unit test for event class instantiation (attributes accessible, `_eventName` = class name).

- [ ] **Task 2: MongoDB schema + repository** (AC: 3)
  - [ ] 2.1 Create `src/context/auth/integration-api-key/infrastructure/schemas/embed-token-audit-log.schema.ts`:
    - `id: string` (UUID, unique, indexed)
    - `companyId: string` (indexed)
    - `userId: string` (indexed, sparse)
    - `origin: string`
    - `timestamp: Date` (indexed with TTL)
    - `ipAddressHash: string` (SHA-256 first 16 chars)
    - `userAgent: string` (max 500 chars)
    - `endpoint: string` (indexed)
    - `result: 'success' | 'failure'` (indexed)
    - `failureReason?: string` (sparse indexed)
    - `failureDetail?: string` (max 500 chars)
    - `createdAt: Date` (auto-generated by Mongoose timestamps)
    - TTL index on `timestamp` with `expireAfterSeconds: 31536000` (12 months) — note: this differs from the `expiresAt: 0` pattern in `web-content-cache.schema.ts`; here we use a `timestamp` field with absolute seconds for simplicity since the retention period is constant. **Decision: use `expireAfterSeconds: 31536000` on `timestamp` because retention is fixed at 12 months for all records** (no per-record expiry needed).
  - [ ] 2.2 Create `src/context/auth/integration-api-key/domain/repositories/embed-token-audit-log.repository.ts` exporting `IEmbedTokenAuditLogRepository` interface with methods:
    - `save(event: EmbedTokenAuditLogPrimitives): Promise<Result<void, DomainError>>`
    - `findByQuery(query: EmbedTokenAuditLogQuery): Promise<Result<{ events: EmbedTokenAuditLogPrimitives[]; total: number }, DomainError>>`
  - [ ] 2.3 Export `EMBED_TOKEN_AUDIT_LOG_REPOSITORY = Symbol('EmbedTokenAuditLogRepository')`.
  - [ ] 2.4 Create `src/context/auth/integration-api-key/infrastructure/persistence/mongo-embed-token-audit-log.repository.impl.ts` implementing `IEmbedTokenAuditLogRepository` with `Model<EmbedTokenAuditLogDocument>` from `@nestjs/mongoose`.
  - [ ] 2.5 Create `src/context/auth/integration-api-key/infrastructure/persistence/__tests__/mongo-embed-token-audit-log.repository.spec.ts` using `mongodb-memory-server` (or in-memory model mock if memory-server is unavailable in CI).

- [ ] **Task 3: Event handlers for persistence** (AC: 1, 2, 7)
  - [ ] 3.1 Create `src/context/auth/integration-api-key/application/events/persist-embed-token-authenticated.event-handler.ts`:
    - `@Injectable()`, `@EventsHandler(EmbedTokenAuthenticatedEvent)`
    - Inject `EMBED_TOKEN_AUDIT_LOG_REPOSITORY`
    - In `handle()`: convert event attributes to `EmbedTokenAuditLogPrimitives`, call `repository.save()`. On error, log WARN with event payload (no throw — AC7).
  - [ ] 3.2 Create `src/context/auth/integration-api-key/application/events/persist-embed-token-authentication-failed.event-handler.ts`:
    - Same pattern as 3.1 but for failed event.
  - [ ] 3.3 Create unit test for each handler:
    - `debe persistir el evento correctamente (mocks del repository)`
    - `debe retornar ok aun si el repository falla (AC7: no throw)`
    - `debe loggear WARN con el payload si el repository falla`

- [ ] **Task 4: Emit events from CreateEmbedTokenCommandHandler (Story 1.3)** (AC: 5, 7)
  - [ ] 4.1 Modify `src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler.ts`:
    - Inject `EventPublisher` from `@nestjs/cqrs` (existing pattern in `accept-invite-command.handler.ts:36`)
    - In `execute()`, on success: merge the (no aggregate) event via `this.publisher.mergeObjectContext({...})` with `commit()`. Note: since CreateEmbedToken doesn't use an aggregate, use direct `publish()` from `EventBus` instead — see existing pattern in Story 1.4 if any. **Decision: use `EventBus.publish(event)`** (simpler, no aggregate required).
    - On error (EmbedTokenForbiddenError, etc.): publish `EmbedTokenAuthenticationFailedEvent` with the appropriate `failureReason`.
    - Add params to command: `origin`, `ipAddress`, `userAgent`, `endpoint` (passed from controller, see Task 6).
  - [ ] 4.2 Add unit tests:
    - `debe emitir EmbedTokenAuthenticatedEvent en success`
    - `debe emitir EmbedTokenAuthenticationFailedEvent con EMBED_DISABLED_FOR_TENANT si embed está deshabilitado`
    - `debe emitir EmbedTokenAuthenticationFailedEvent con EMBED_USER_NOT_IN_TENANT si el user no pertenece`
    - `debe emitir EmbedTokenAuthenticationFailedEvent con EMBED_TENANT_MISMATCH si hay mismatch`

- [ ] **Task 5: Emit events from RefreshEmbedTokenCommandHandler (Story 1.4)** (AC: 4, 7)
  - [ ] 5.1 Modify `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler.ts`:
    - Inject `EventBus` from `@nestjs/cqrs`
    - In `execute()`, on success: publish `EmbedTokenAuthenticatedEvent` with `endpoint: '/v2/integration/embed/refresh'`. **Important: use the NEW token's userId/companyId, not the old one** (to detect session-takeover via refresh).
    - On error: publish `EmbedTokenAuthenticationFailedEvent` with the appropriate reason.
    - Add params to command: `origin`, `ipAddress`, `userAgent` (passed from controller).
  - [ ] 5.2 Add unit tests for emit behavior.

- [ ] **Task 6: Emit events from AuthenticateEmbedSessionCommandHandler (Story 2.1)** (AC: 1, 2, 7)
  - [ ] 6.1 Modify `src/context/auth/bff/application/commands/authenticate-embed-session.command-handler.ts`:
    - Inject `EventBus` from `@nestjs/cqrs`
    - In `execute()`, on success: publish `EmbedTokenAuthenticatedEvent` with `endpoint: '/embed/authenticate-session'`.
    - On error: publish `EmbedTokenAuthenticationFailedEvent` with the appropriate reason.
    - Add params to command: `origin`, `ipAddress`, `userAgent` (passed from controller).
  - [ ] 6.2 Update `AuthenticateEmbedSessionCommand` to include `origin`, `ipAddress`, `userAgent`.
  - [ ] 6.3 Update `EmbedSessionController.authenticate()` to extract these from the request and pass to the command.
  - [ ] 6.4 Add unit tests for emit behavior.

- [ ] **Task 7: Query endpoint for support team** (AC: 6)
  - [ ] 7.1 Create `src/context/auth/integration-api-key/application/dtos/query-embed-token-audit-log.dto.ts` exporting `QueryEmbedTokenAuditLogDto` with all query params + class-validator decorators.
  - [ ] 7.2 Create `src/context/auth/integration-api-key/application/dtos/embed-token-audit-log-response.dto.ts` exporting `EmbedTokenAuditLogEntryDto` (one event) + `EmbedTokenAuditLogListResponseDto` (`{ events: [...], total: number }`).
  - [ ] 7.3 Create `src/context/auth/integration-api-key/application/queries/find-embed-token-audit-log.query.ts` + `find-embed-token-audit-log.query-handler.ts`:
    - `@QueryHandler(FindEmbedTokenAuditLogQuery)`, inject `IEmbedTokenAuditLogRepository`
    - `execute()` returns `Result<{ events, total }, DomainError>` sorted by `timestamp: -1` (most recent first)
  - [ ] 7.4 Modify `src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts` (or create new controller) to add `GET /v2/integration/embed/audit-log`:
    - `@UseGuards(IntegrationApiKeyGuard)` at method level (NOT class level — Story 1.4 F2 lesson)
    - Validate `companyId` matches `req.integrationApiKey.companyId` (tenant mismatch check, same as `/start`)
    - Returns the query result.
  - [ ] 7.5 Add unit + e2e tests.

- [ ] **Task 8: PII sanitization utility** (AC: 8)
  - [ ] 8.1 Create `src/context/auth/integration-api-key/application/utils/pii-sanitizer.util.ts` exporting:
    - `hashIp(ip: string): string` — SHA-256 first 16 chars
    - `truncateUserAgent(ua: string): string` — max 500 chars
    - `sanitizeFailureDetail(detail: string): string` — truncate to 500 + strip token-like patterns
  - [ ] 8.2 Use these utilities in the event handlers (Task 3) before persisting.
  - [ ] 8.3 Add unit tests for each utility (boundary conditions, regex cases).

- [ ] **Task 9: Module wiring** (AC: 1, 7)
  - [ ] 9.1 Modify `src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts`:
    - Add `MongooseModule.forFeature([{ name: EmbedTokenAuditLogSchema.name, schema: EmbedTokenAuditLogSchemaDefinition }])` to `imports`
    - Add `PersistEmbedTokenAuthenticatedEventHandler` and `PersistEmbedTokenAuthenticationFailedEventHandler` to `providers`
    - Add `MongoEmbedTokenAuditLogRepositoryImpl` to `providers` with `EMBED_TOKEN_AUDIT_LOG_REPOSITORY` symbol
    - Add `FindEmbedTokenAuditLogQueryHandler` to `providers`
    - Add `EmbedTokenAuditLogSchemaDefinition` (call `.index(...)` for TTL + indexes in module init)
  - [ ] 9.2 Add new controller endpoint to `controllers` array.
  - [ ] 9.3 **CRITICAL** (Epic 1 lesson): verify with `npm run build` that all providers/handlers are correctly wired. The build is the only check that detects module wiring bugs.

- [ ] **Task 10: Unit tests (TDD — RED first)** (AC: 1-8)
  - [ ] 10.1 `embed-token-authenticated.event.spec.ts` and `embed-token-authentication-failed.event.spec.ts` (4-6 tests each, instantiation + attribute access)
  - [ ] 10.2 `mongo-embed-token-audit-log.repository.spec.ts` (8-10 tests, save + findByQuery with various filters)
  - [ ] 10.3 `persist-embed-token-authenticated.event-handler.spec.ts` + failed version (4 tests each, happy path + WARN on repo failure)
  - [ ] 10.4 `create-embed-token.command-handler.spec.ts` — add 4 tests for event emission (success + 3 failure reasons)
  - [ ] 10.5 `refresh-embed-token.command-handler.spec.ts` — add 4 tests for event emission
  - [ ] 10.6 `authenticate-embed-session.command-handler.spec.ts` — add 4 tests for event emission
  - [ ] 10.7 `find-embed-token-audit-log.query-handler.spec.ts` (5 tests, all filter combinations)
  - [ ] 10.8 `pii-sanitizer.util.spec.ts` (8 tests, hashing determinism, truncation, regex cases)
  - [ ] 10.9 **AI-3 lesson applied**: ALL error tests use `expect(error.message).toContain('specific')` or `expect(error).toBeInstanceOf(SpecificClass)`, NEVER `instanceof BaseError`.

- [ ] **Task 11: Integration / e2e tests** (AC: 1-7)
  - [ ] 11.1 `test/embed-token-audit-log.e2e-spec.ts`:
    - **AC1**: Real MongoDB (or mongodb-memory-server). Boot full app. Call `/embed/authenticate-session` with valid token. Query MongoDB collection directly — assert document exists with all 7 fields.
    - **AC2**: Same but with invalid token. Assert document with `result: 'failure'` and the appropriate `failureReason`.
    - **AC3**: Insert document, verify TTL index exists with `expireAfterSeconds: 31536000` (use `db.collection.getIndexes()`).
    - **AC4-5**: Call `/start` and `/refresh` — assert events emitted with correct endpoints.
    - **AC6**: Call `GET /v2/integration/embed/audit-log?companyId=...&limit=10` — assert response shape and chronological order.
    - **AC7**: Stop MongoDB or mock repository failure — assert HTTP response still succeeds and WARN log is emitted.
    - **AC8**: Assert `ipAddressHash` is hex (not raw IP), `userAgent` is truncated, `failureDetail` is sanitized.

- [ ] **Task 12: Lint, format, build** (verification — CRITICAL per Story 2.1 lessons)
  - [ ] 12.1 `npm run lint -- --fix src/context/auth/integration-api-key/`
  - [ ] 12.2 `npm run format`
  - [ ] 12.3 `npm run build` — verify zero TypeScript errors (build is the only check that catches module wiring bugs)
  - [ ] 12.4 `npm run test:unit -- src/context/auth/integration-api-key/` — all green
  - [ ] 12.5 `npm run test:e2e -- test/embed-token-audit-log.e2e-spec.ts` — all green

- [ ] **Task 13: Update documentation**
  - [ ] 13.1 Update `src/context/auth/integration-api-key/AGENTS.md` with new section "Embed Token Audit Log" covering:
    - MongoDB schema (with TTL)
    - Event types and when they fire
    - Query endpoint
    - PII sanitization rules
  - [ ] 13.2 Move "Story 2.2" from "Out of Scope" to "DONE" in `integration-api-key/AGENTS.md`
  - [ ] 13.3 Update `_bmad-output/implementation-artifacts/sprint-status.yaml` story 2-2 to `done`

## Dev Notes

### Relevant architecture patterns and constraints

1. **Result pattern (CRITICAL)** — `src/context/shared/AGENTS.md`. All repository/handler methods return `Promise<Result<T, DomainError>>`. NEVER `throw new Error()` for expected validation failures.

2. **Symbol-based DI (CRITICAL)** — `shared/AGENTS.md` "Inyección de dependencias por `Symbol` token, nunca clase directa". Use `@Inject(EMBED_TOKEN_AUDIT_LOG_REPOSITORY)` etc.

3. **Event publishing patterns** — The codebase uses `@nestjs/cqrs`:
   - `EventBus.publish(event)` for direct publishing (no aggregate)
   - `EventPublisher.mergeObjectContext(aggregate)` + `aggregate.commit()` for aggregate-rooted events
   - For this story, use `EventBus.publish(event)` (no aggregate involved)

4. **TTL index pattern** — Use `SchemaFactory.createForClass()` + `.index({ field: 1 }, { expireAfterSeconds: 31536000 })`. **Decision rationale**: 12 months is a fixed retention for all records; using `expireAfterSeconds: 0` + per-record `expiresAt` (web-content-cache pattern) adds complexity without value here.

5. **PII sanitization (GDPR)** — IPs are personal data under GDPR Art. 4(1). Use SHA-256 hash prefix (16 chars hex) for `ipAddressHash` instead of raw IP. Truncate `userAgent` to 500 chars. Sanitize `failureDetail` to strip any token-like patterns.

6. **AI-2 lesson (Story 2.1 mini-retro)** — "Module wiring must-dos" checklist:
   - [ ] Provider registered in `providers`
   - [ ] Handler imported and registered
   - [ ] Guards at method level, not class level (if multi-endpoint)
   - [ ] `onModuleDestroy` resets mutable state
   - [ ] `npm run build` passes (build is the only check that detects module wiring bugs)
   - [ ] Symbols exported from the defining module

7. **AI-3 lesson** — ALL error tests use `expect(error.message).toContain('specific')` or `expect(error).toBeInstanceOf(SpecificClass)`, NEVER `instanceof BaseError`.

8. **Story 2.1 known limitation (deferred)** — Cookie name `access_token` collides with OIDC. Not relevant for this story (no cookie work).

### Source tree components to touch

| File | Change |
|------|--------|
| `src/context/auth/integration-api-key/domain/events/embed-token-authenticated.event.ts` | NEW |
| `src/context/auth/integration-api-key/domain/events/embed-token-authentication-failed.event.ts` | NEW |
| `src/context/auth/integration-api-key/domain/events/embed-auth-failure-reason.enum.ts` | NEW |
| `src/context/auth/integration-api-key/infrastructure/schemas/embed-token-audit-log.schema.ts` | NEW |
| `src/context/auth/integration-api-key/domain/repositories/embed-token-audit-log.repository.ts` | NEW |
| `src/context/auth/integration-api-key/infrastructure/persistence/mongo-embed-token-audit-log.repository.impl.ts` | NEW |
| `src/context/auth/integration-api-key/application/events/persist-embed-token-authenticated.event-handler.ts` | NEW |
| `src/context/auth/integration-api-key/application/events/persist-embed-token-authentication-failed.event-handler.ts` | NEW |
| `src/context/auth/integration-api-key/application/utils/pii-sanitizer.util.ts` | NEW |
| `src/context/auth/integration-api-key/application/dtos/query-embed-token-audit-log.dto.ts` | NEW |
| `src/context/auth/integration-api-key/application/dtos/embed-token-audit-log-response.dto.ts` | NEW |
| `src/context/auth/integration-api-key/application/queries/find-embed-token-audit-log.query.ts` | NEW |
| `src/context/auth/integration-api-key/application/queries/find-embed-token-audit-log.query-handler.ts` | NEW |
| `src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler.ts` | MODIFY (emit events) |
| `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler.ts` | MODIFY (emit events) |
| `src/context/auth/bff/application/commands/authenticate-embed-session.command-handler.ts` | MODIFY (emit events) |
| `src/context/auth/bff/application/commands/authenticate-embed-session.command.ts` | MODIFY (add origin/ipAddress/userAgent fields) |
| `src/context/auth/bff/infrastructure/controllers/embed-session.controller.ts` | MODIFY (extract headers, pass to command) |
| `src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts` | MODIFY (add GET /audit-log endpoint) |
| `src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts` | MODIFY (register all new providers, MongooseModule.forFeature, exports) |
| `src/context/auth/integration-api-key/AGENTS.md` | MODIFY (new section + status update) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | MODIFY (story 2-2 → done) |

### Testing standards summary

- **Unit tests** (`*.spec.ts` in `__tests__/`): mock all dependencies with `jest.Mocked<T>`. Use `Uuid.random().value`. Spanish `describe`/`it`. Assert with `result.isOk()`/`isErr()` + `if (result.isErr()) { ... }` narrowing.
- **AI-3 (CRITICAL)**: never `instanceof BaseError` in tests. Always specific message or subclass.
- **E2E tests** (`test/*.e2e-spec.ts`): real HTTP via supertest. Real MongoDB via `mongodb-memory-server` (the project may need to install this — check first).
- **Coverage target**: 100% line coverage on new handler/service/controller files.

### Project Structure Notes

- **Event handlers live in `application/events/`** — same as `accept-invite-command.handler.ts` and `user-account-created.event-handler.ts` patterns.
- **MongoDB schemas live in `infrastructure/schemas/`** — Mongoose `SchemaFactory.createForClass()` pattern.
- **MongooseModule.forFeature** must be added to the module imports for the schema to be registered with DI.
- **No new npm dependencies** — `@nestjs/cqrs`, `@nestjs/mongoose`, `mongoose`, `crypto` are all already installed.
- **Mongo memory server**: if not in package.json, add `mongodb-memory-server` as a devDependency. Verify before starting work: `grep "mongodb-memory-server" package.json`. If absent, add and document in the story completion.

### Open Questions (to confirm before Task 7.4)

- **Mongo memory server**: is it already in the dev dependencies? If not, this story will need to add it (small npm install).
- **Query endpoint location**: add to `embed.controller.ts` (existing controller) or create new `audit-log.controller.ts`? **Recommendation: extend `embed.controller.ts`** — same prefix `/v2/integration/embed/`, same auth model (`IntegrationApiKeyGuard`).
- **Story 2.6 priority**: should this story be BLOCKED on Story 2.6 (cookie name fix) or ship independently? **Recommendation: ship independently** — Story 2.2 doesn't touch cookies or the auth flow (only observability).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 2.2` — original story and ACs]
- [Source: `_bmad-output/planning-artifacts/prd.md#FR22-FR24` — audit trail FRs]
- [Source: `_bmad-output/planning-artifacts/prd.md#NFR-S7` — 12 months retention]
- [Source: `src/context/auth/integration-api-key/AGENTS.md#Embed Token Service` — existing embed service context]
- [Source: `src/context/auth/auth-user/domain/events/user-account-created-event.ts` — DomainEvent pattern]
- [Source: `src/context/auth/api-key/application/events/create-api-key-on-company-created-event.handler.ts` — EventsHandler pattern]
- [Source: `src/context/leads/infrastructure/persistence/schemas/crm-sync-record.schema.ts` — Mongoose schema pattern with indexes]
- [Source: `src/context/llm/infrastructure/schemas/web-content-cache.schema.ts:64-67` — TTL index pattern (alternative: `expireAfterSeconds: 0`)]
- [Source: `src/context/shared/AGENTS.md#Critical Pattern: Result<T, E>` — Result pattern usage]
- [Source: `_bmad-output/implementation-artifacts/2-1-implement-post-embed-authenticate-session-to-create-bff-session-from-token.md` — Story 2.1 code review lessons (F1, F2, AI-2, AI-3)]
- [Source: `_bmad-output/implementation-artifacts/story-2-1-retro-2026-06-16.md` — Mini-retro: AI-1/AI-2/AI-3 action items, code review mandatory]

## Dev Agent Record

### Agent Model Used

TBD (filled by dev-story agent)

### Debug Log References

TBD

### Completion Notes List

TBD

### File List

TBD (filled by dev-story agent at end)
