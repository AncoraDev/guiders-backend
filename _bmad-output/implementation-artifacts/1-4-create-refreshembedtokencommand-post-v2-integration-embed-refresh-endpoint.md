# Story 1.4: Create RefreshEmbedTokenCommand + POST /v2/integration/embed/refresh endpoint

Status: done

## Story

As a LeadCars frontend iframe,
I want to POST to `/v2/integration/embed/refresh` with my current token before it expires,
So that the user's session can be extended without re-authenticating.

## Acceptance Criteria

1. **Given** a valid embed token in `Authorization: Bearer <token>` header
   **When** `POST /v2/integration/embed/refresh` is called
   **Then** the response is `200 OK` with `{ "token": "new-opaque-base64url", "expiresAt": "..." }`
   **And** the old token is deleted from Redis
   **And** the new token is stored with TTL 8h

2. **Given** an expired or invalid token
   **When** the endpoint is called
   **Then** the response is `401 Unauthorized` with code `EMBED_TOKEN_EXPIRED` or `EMBED_TOKEN_INVALID`

3. **Given** a request to refresh a token that was issued for a different user
   **When** the endpoint is called
   **Then** the response is `403 Forbidden` with code `EMBED_TOKEN_USER_MISMATCH`

## Tasks / Subtasks

- [ ] Task 1: Define domain layer (AC: #1, #2, #3)
  - [ ] Subtask 1.1: Create `RefreshEmbedTokenCommand` in `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command.ts` (just the `token: string` field — no body)
  - [ ] Subtask 1.2: Create `EmbedTokenErrorCode` types if not exists: `EMBED_TOKEN_EXPIRED`, `EMBED_TOKEN_INVALID`, `EMBED_TOKEN_USER_MISMATCH`
  - [ ] Subtask 1.3: Reuse existing `RefreshEmbedTokenResult` shape from Story 1.2 (`{ token, expiresAt }`)
- [ ] Task 2: Implement command handler (AC: #1, #2, #3)
  - [ ] Subtask 2.1: Create `RefreshEmbedTokenCommandHandler` in `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler.ts`
  - [ ] Subtask 2.2: Inject dependencies: `IEmbedTokenService`, `IWhiteLabelConfigRepository` (to verify embed enabled for the token's companyId)
  - [ ] Subtask 2.3: Call `embedTokens.validateToken(oldToken)` to get `{ userId, companyId, roles, createdAt, refreshedAt? }`
  - [ ] Subtask 2.4: If `validateToken` returns `EmbedTokenNotFoundError` → return `err(EmbedTokenExpiredError)` (distinguish expired vs invalid)
  - [ ] Subtask 2.5: If `validateToken` returns `EmbedTokenInvalidFormatError` or `EmbedTokenCorruptedError` → return `err(EmbedTokenInvalidError)`
  - [ ] Subtask 2.6: If `validateToken` returns `EmbedTokenError` (generic) → return `err(EmbedTokenInvalidError)`
  - [ ] Subtask 2.7: Verify `embedEnabled=true` for the token's `companyId` (white_label_configs lookup) — if disabled, return `err(EmbedTokenExpiredError)` (revoke flow: tenant no longer allows embed)
  - [ ] Subtask 2.8: If `embedEnabled` check passes, call `embedTokens.refreshToken(oldToken)` (atomic Lua script)
  - [ ] Subtask 2.9: Return `ok({ token: newToken, expiresAt })` on success
- [ ] Task 3: Define request/response DTOs (AC: #1, #2)
  - [ ] Subtask 3.1: Add `RefreshEmbedTokenResponseDto` in `src/context/auth/integration-api-key/application/dtos/refresh-embed-token.dto.ts` (token, expiresAt)
  - [ ] Subtask 3.2: Add `EmbedTokenErrorResponseDto` (code, message, statusCode) for 401/403 — extends existing `EmbedTokenForbiddenResponseDto` from Story 1.3
  - [ ] Subtask 3.3: NO body DTO needed (token comes from `Authorization: Bearer` header, not body)
- [ ] Task 4: Add refresh endpoint to embed controller (AC: #1, #2, #3)
  - [ ] Subtask 4.1: Add `@Post('refresh')` handler to existing `EmbedController` (from Story 1.3)
  - [ ] Subtask 4.2: Use custom guard that extracts `Authorization: Bearer <token>` and validates format — `@UseGuards(EmbedTokenGuard)` (NEW)
  - [ ] Subtask 4.3: Handler signature: `@Req() req: EmbedTokenRequest` (with `req.embedToken: string` populated by guard)
  - [ ] Subtask 4.4: Call `RefreshEmbedTokenCommandHandler.execute(new RefreshEmbedTokenCommand(req.embedToken))`
  - [ ] Subtask 4.5: Map `EmbedTokenExpiredError` → 401 with `code: EMBED_TOKEN_EXPIRED`
  - [ ] Subtask 4.6: Map `EmbedTokenInvalidError` → 401 with `code: EMBED_TOKEN_INVALID`
  - [ ] Subtask 4.7: Map `EmbedTokenUserMismatchError` → 403 with `code: EMBED_TOKEN_USER_MISMATCH`
  - [ ] Subtask 4.8: Map generic errors → 500
  - [ ] Subtask 4.9: Return `RefreshEmbedTokenResponseDto` on success
- [ ] Task 5: Create `EmbedTokenGuard` (NEW — does not exist)
  - [ ] Subtask 5.1: Create `EmbedTokenGuard` in `src/context/auth/integration-api-key/infrastructure/guards/embed-token.guard.ts`
  - [ ] Subtask 5.2: Extract `Authorization: Bearer <token>` from headers
  - [ ] Subtask 5.3: Validate token format with `/^[A-Za-z0-9_-]{43}$/`
  - [ ] Subtask 5.4: If header missing → throw `UnauthorizedException` with code `EMBED_TOKEN_MISSING`
  - [ ] Subtask 5.5: If format invalid → throw `UnauthorizedException` with code `EMBED_TOKEN_INVALID`
  - [ ] Subtask 5.6: Inject validated token into `req.embedToken`
  - [ ] Subtask 5.7: Return `true`
- [ ] Task 6: Define new error classes (AC: #2, #3)
  - [ ] Subtask 6.1: `EmbedTokenExpiredError extends DomainError` with `code: 'EMBED_TOKEN_EXPIRED'` (in `embed-token.errors.ts`)
  - [ ] Subtask 6.2: `EmbedTokenInvalidError extends DomainError` with `code: 'EMBED_TOKEN_INVALID'`
  - [ ] Subtask 6.3: `EmbedTokenUserMismatchError extends DomainError` with `code: 'EMBED_TOKEN_USER_MISMATCH'`
  - [ ] Subtask 6.4: Update `EmbedTokenForbiddenCode` type to include new codes (or create separate `EmbedTokenErrorCode` type)
- [ ] Task 7: Wire dependencies in module (AC: #1)
  - [ ] Subtask 7.1: Add `RefreshEmbedTokenCommandHandler` to `providers` array
  - [ ] Subtask 7.2: Add `EmbedTokenGuard` to `providers` array
  - [ ] Subtask 7.3: Export `EmbedTokenGuard` for use in other modules (Story 2.1 will need it)
- [ ] Task 8: Write unit tests for command handler (AC: #1, #2, #3)
  - [ ] Subtask 8.1: `refresh-embed-token.command-handler.spec.ts` with mocked EmbedTokenService + WhiteLabelConfigRepository
  - [ ] Subtask 8.2: Happy path — valid token + embed enabled → ok with new token+expiresAt
  - [ ] Subtask 8.3: Token not found / expired → err with `EMBED_TOKEN_EXPIRED`
  - [ ] Subtask 8.4: Token format invalid → err with `EMBED_TOKEN_INVALID`
  - [ ] Subtask 8.5: Token corrupted (malformed JSON) → err with `EMBED_TOKEN_INVALID`
  - [ ] Subtask 8.6: Embed disabled for token's companyId → err with `EMBED_TOKEN_EXPIRED` (revoke)
  - [ ] Subtask 8.7: `EmbedTokenService.refreshToken` returns err (Redis Lua failed) → err propagates
  - [ ] Subtask 8.8: New token has different value than old token
  - [ ] Subtask 8.9: New token's createdAt is preserved from old token (Story 1.2 decision)
- [ ] Task 9: Write e2e tests (AC: #1, #2, #3)
  - [ ] Subtask 9.1: Add new describe blocks to existing `test/embed-start.e2e-spec.ts` (or create `test/embed-refresh.e2e-spec.ts` — preferred for separation)
  - [ ] Subtask 9.2: Mock `EmbedTokenGuard` to inject `req.embedToken = '<token>'`
  - [ ] Subtask 9.3: Mock `EmbedTokenService.validateToken` to return ok or err per scenario
  - [ ] Subtask 9.4: Mock `EmbedTokenService.refreshToken` to return new token
  - [ ] Subtask 9.5: Test happy path → 200 with `{ token: newToken, expiresAt }`
  - [ ] Subtask 9.6: Test missing Authorization header → 401 (via guard, with `EMBED_TOKEN_MISSING` code)
  - [ ] Subtask 9.7: Test invalid format in header → 401 (via guard, with `EMBED_TOKEN_INVALID` code)
  - [ ] Subtask 9.8: Test token not found in Redis → 401 (via handler, with `EMBED_TOKEN_EXPIRED` code)
  - [ ] Subtask 9.9: Test token format OK but corrupted JSON in Redis → 401 (with `EMBED_TOKEN_INVALID`)
  - [ ] Subtask 9.10: Test embed disabled for token's companyId → 401 (with `EMBED_TOKEN_EXPIRED`)

## Dev Notes

### Architecture Patterns to Follow

- **DDD/CQRS:** Command pattern with handler + Result return (follows Story 1.3 pattern)
- **Result Pattern:** `Promise<Result<T, DomainError>>` — never throw
- **Symbol Token DI:** Inject via `@Inject(EMBED_TOKEN_SERVICE)` / `@Inject(WHITE_LABEL_CONFIG_REPOSITORY)`
- **Existing pattern:** Follow `create-embed-token.command-handler.ts` from Story 1.3 — same structure
- **Tests with `Uuid.random().value`:** NEVER fake strings
- **Describe in Spanish:** Convention for test descriptions

### Security Boundaries

| Layer | Validates | Failure mode |
|-------|-----------|--------------|
| `EmbedTokenGuard` (NEW) | `Authorization: Bearer <token>` header → base64url format | 401 with `EMBED_TOKEN_MISSING` or `EMBED_TOKEN_INVALID` |
| CommandHandler (validateToken) | Token exists in Redis + JSON shape | 401 with `EMBED_TOKEN_EXPIRED` or `EMBED_TOKEN_INVALID` |
| CommandHandler (embed enabled) | `white_label_configs.embedEnabled === true` for token's companyId | 401 with `EMBED_TOKEN_EXPIRED` (revoke flow) |
| `EmbedTokenService.refreshToken` | Atomic Lua script GETDEL + SET EX | 500 (Redis failure) |

**Note**: AC#3 says "request to refresh a token that was issued for a different user → 403 EMBED_TOKEN_USER_MISMATCH". This scenario only applies if the controller receives a `userId` in body to compare against the token's userId. The spec doesn't mention body fields for refresh. The most likely interpretation is that this AC is defensive — if the implementation ever accepts a body userId for cross-checking, it should return 403. For Story 1.4, we can:
  - **Option A**: Add a body DTO with `userId` (optional) and check it against the token's userId
  - **Option B**: Drop this AC as "not applicable" and document it (the spec doesn't require it)
  - **Recommended**: Option A — defensive, matches spec literally, easy to add.

### Source Tree Components to Touch

**New files to create:**

- `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command.ts` — command class (just `token: string`)
- `src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler.ts` — handler with deps
- `src/context/auth/integration-api-key/application/commands/__tests__/refresh-embed-token.command-handler.spec.ts` — unit tests
- `src/context/auth/integration-api-key/application/dtos/refresh-embed-token.dto.ts` — response DTOs
- `src/context/auth/integration-api-key/infrastructure/guards/embed-token.guard.ts` — NEW guard
- `test/embed-refresh.e2e-spec.ts` — e2e tests

**Files to modify:**

- `src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts` — add `@Post('refresh')` handler
- `src/context/auth/integration-api-key/domain/errors/embed-token.errors.ts` — add 3 new error classes + `EmbedTokenErrorCode` type
- `src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts` — register handler + guard

### Project Structure Notes

- New `EmbedTokenGuard` lives in `infrastructure/guards/` (not `infrastructure/controllers/`)
- Story 1.3's `EmbedController` already exists — just add a new handler to it
- NO new module needed — extend `IntegrationApiKeyModule`
- Export `EmbedTokenGuard` so Story 2.1 (`POST /embed/authenticate-session`) can reuse it

### Code Reuse / Patterns to Follow

**From Story 1.3 (`create-embed-token.command-handler.ts`):**

```typescript
@Injectable()
export class RefreshEmbedTokenCommandHandler {
  constructor(
    @Inject(EMBED_TOKEN_SERVICE) private readonly embedTokens: IEmbedTokenService,
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY) private readonly whiteLabelRepository: IWhiteLabelConfigRepository,
  ) {}

  async execute(command: RefreshEmbedTokenCommand): Promise<Result<RefreshEmbedTokenResult, DomainError>> {
    // 1. Validate token (returns EmbedTokenData with userId, companyId, roles)
    const tokenData = await this.embedTokens.validateToken(command.token);
    if (tokenData.isErr()) {
      const err = tokenData.error;
      if (err instanceof EmbedTokenNotFoundError) {
        return err(new EmbedTokenExpiredError()); // 401
      }
      if (err instanceof EmbedTokenInvalidFormatError || err instanceof EmbedTokenCorruptedError) {
        return err(new EmbedTokenInvalidError()); // 401
      }
      return err(new EmbedTokenInvalidError()); // 401 generic
    }

    // 2. Verify embed enabled for the token's companyId
    const configResult = await this.whiteLabelRepository.findByCompanyId(tokenData.unwrap().companyId);
    if (configResult.isErr() || !configResult.unwrap().embedEnabled) {
      return err(new EmbedTokenExpiredError()); // 401, revoke
    }

    // 3. Refresh the token
    const refreshResult = await this.embedTokens.refreshToken(command.token);
    if (refreshResult.isErr()) return err(refreshResult.error);

    return ok({
      token: refreshResult.unwrap().token,
      expiresAt: refreshResult.unwrap().expiresAt,
    });
  }
}
```

**From Story 1.2 (`redis-embed-token.service.ts`):**

- `refreshToken` already does the atomic Lua script (GETDEL + SET EX)
- Preserves `createdAt` from old token, adds `refreshedAt` (per code review decision F12)
- Returns `{ token, expiresAt }` matching the spec

### Project Context References

- **PRD NFR-S1, S3:** Tokens opaque 256-bit, 8h TTL (sliding window per Story 1.2 decision F16)
- **PRD NFR-S9:** Redis namespaced `embed:*` (Story 1.2 implementation)
- **PRD NFR-S2:** Origin verification strict (handled by parent via postMessage, not by this endpoint)
- **PRD NFR-R2:** If Redis down, return 503 — this story handles via EmbedTokenError mapping
- **Story 1.2 (done):** `EmbedTokenService.refreshToken()` with atomic Lua script
- **Story 1.3 (done):** `EmbedController` with `POST /start` — add new handler to it
- **Architecture D1:** Token storage in Redis with namespace `embed:*`
- **Architecture D5:** Opaque tokens, not JWT

### Multi-tenant Isolation

The token's `companyId` comes from the Redis value (validated at `validateToken`). The handler MUST:
- Re-check `embedEnabled` for that `companyId` (defense in depth: token valid but tenant disabled embed = revoke)
- Trust the token's `companyId` (no body companyId to compare against; the body is empty for refresh)
- Not allow any other `companyId` to refresh a token (Lua script only operates on the token key, no cross-tenant access)

### Out of Scope (deferred to other stories)

- **Story 2.1:** `POST /embed/authenticate-session` (BFF session from token) — will reuse `EmbedTokenGuard`
- **Story 2.3:** Logout flow with `revokeToken` — different endpoint
- **Story 2.4:** Rate limiting via `embed:refresh:<userId>` key
- **Story 2.2:** `EmbedTokenRefreshedEvent` audit log (parallel to `EmbedTokenAuthenticatedEvent`)

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.4] — original story definition with BDD ACs
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-S1-S3] — security NFRs (opaque tokens, 8h TTL)
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-R2] — Redis-down → 503
- [Source: src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts] — `refreshToken()` impl (atomic Lua)
- [Source: src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts] — `EmbedController` from Story 1.3 (add new handler here)
- [Source: src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler.ts] — handler pattern to follow
- [Source: src/context/auth/integration-api-key/domain/errors/embed-token.errors.ts] — existing error types to extend
- [Source: src/context/auth/integration-api-key/infrastructure/integration-api-key.guard.ts] — `IntegrationApiKeyRequest` interface (similar pattern for `EmbedTokenRequest`)
- [Source: _bmad-output/implementation-artifacts/1-3-create-createembedtokencommand-post-v2-integration-embed-start-endpoint.md] — previous story patterns and learnings
- [Source: _bmad-output/implementation-artifacts/1-2-implement-opaque-token-generation-in-embedtokenservice.md] — Story 1.2 code review patches (F12: createdAt preserved, F16: sliding window)

## Dev Agent Record

### Agent Model Used

MiniMax-M3 (MiniMax Coding Plan)

### Debug Log References

### Completion Notes List

### File List
