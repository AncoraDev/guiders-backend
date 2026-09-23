# Story 1.3: Create CreateEmbedTokenCommand + POST /v2/integration/embed-start endpoint

Status: done

## Story

As a LeadCars backend system,
I want to POST to `/v2/integration/embed/start` with my Integration API Key and a target user ID,
So that I receive an embed token to authenticate that user in my frontend iframe.

## Acceptance Criteria

1. **Given** a valid `X-Api-Key` header for a tenant where `embedEnabled=true`
   **And** a request body `{ "userId": "<uuid>", "companyId": "<uuid>" }` where userId belongs to companyId
   **When** `POST /v2/integration/embed/start` is called
   **Then** the response is `200 OK` with `{ "token": "opaque-base64url", "expiresAt": "2026-06-12T22:32:00.000Z" }`

2. **Given** a valid API key but `embedEnabled=false` for the tenant
   **When** the endpoint is called
   **Then** the response is `403 Forbidden` with code `EMBED_DISABLED_FOR_TENANT`

3. **Given** a valid API key but `userId` does not belong to `companyId`
   **When** the endpoint is called
   **Then** the response is `403 Forbidden` with code `EMBED_USER_NOT_IN_TENANT`

4. **Given** an invalid or missing `X-Api-Key`
   **When** the endpoint is called
   **Then** the response is `401 Unauthorized`

5. **Given** the API key's `companyId` does not match the request body's `companyId`
   **When** the endpoint is called
   **Then** the response is `403 Forbidden` with code `EMBED_TENANT_MISMATCH`

## Tasks / Subtasks

- [ ] Task 1: Define domain layer (AC: #1, #3, #5)
  - [ ] Subtask 1.1: Create `CreateEmbedTokenCommand` in `src/context/auth/integration-api-key/application/commands/create-embed-token.command.ts`
  - [ ] Subtask 1.2: Create `EmbedTokenForbiddenError` (extends `DomainError`) with code field — variants: `EMBED_DISABLED_FOR_TENANT`, `EMBED_USER_NOT_IN_TENANT`, `EMBED_TENANT_MISMATCH`
  - [ ] Subtask 1.3: Define `CreateEmbedTokenResult` interface (token, expiresAt)
- [ ] Task 2: Implement command handler (AC: #1, #2, #3, #5)
  - [ ] Subtask 2.1: Create `CreateEmbedTokenCommandHandler` with dependencies:
    - `IWhiteLabelConfigRepository` (to check `embedEnabled`)
    - `IUserAccountRepository` (to verify userId belongs to companyId)
    - `IEmbedTokenService` (to issue the token)
  - [ ] Subtask 2.2: Validate `embedEnabled=true` for the companyId — if false, return `err(EmbedTokenForbiddenError('EMBED_DISABLED_FOR_TENANT'))`
  - [ ] Subtask 2.3: Validate `userId` exists and belongs to `companyId` — if not, return `err(EmbedTokenForbiddenError('EMBED_USER_NOT_IN_TENANT'))`
  - [ ] Subtask 2.4: Extract roles from `UserAccount.roles` (via `toPrimitives()`) and pass to `embedTokens.createToken(companyId, userId, roles)`
  - [ ] Subtask 2.5: Return `ok({ token, expiresAt })` on success
- [ ] Task 3: Define DTO and request validation (AC: #1)
  - [ ] Subtask 3.1: Create `CreateEmbedTokenDto` in `src/context/auth/integration-api-key/application/dtos/create-embed-token.dto.ts`
  - [ ] Subtask 3.2: Fields: `userId: string` (@IsUUID), `companyId: string` (@IsUUID)
  - [ ] Subtask 3.3: Create `CreateEmbedTokenResponseDto` (token, expiresAt) with Swagger `@ApiProperty`
- [ ] Task 4: Create embed controller (AC: #1, #2, #3, #4, #5)
  - [ ] Subtask 4.1: Create `EmbedController` in `src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts`
  - [ ] Subtask 4.2: `@Controller('v2/integration/embed')` route
  - [ ] Subtask 4.3: `@Post('start')` with `@UseGuards(IntegrationApiKeyGuard)` (no @UseGuards RolesGuard — public to integrators)
  - [ ] Subtask 4.4: Handler signature: `@Body() dto: CreateEmbedTokenDto, @Req() req: IntegrationApiKeyRequest`
  - [ ] Subtask 4.5: Tenant mismatch check: `if (req.integrationApiKey.companyId !== dto.companyId)` → `403 EMBED_TENANT_MISMATCH`
  - [ ] Subtask 4.6: Call `CreateEmbedTokenCommandHandler.execute(new CreateEmbedTokenCommand(...))`
  - [ ] Subtask 4.7: Map `EmbedTokenForbiddenError` to HTTP 403 with code in body
  - [ ] Subtask 4.8: Map generic errors to HTTP 500
  - [ ] Subtask 4.9: Return `CreateEmbedTokenResponseDto` on success
- [ ] Task 5: Wire dependencies in module (AC: #1)
  - [ ] Subtask 5.1: Add `WHITE_LABEL_CONFIG_REPOSITORY` import to `IntegrationApiKeyModule`
  - [ ] Subtask 5.2: Add `USER_ACCOUNT_REPOSITORY` import to `IntegrationApiKeyModule`
  - [ ] Subtask 5.3: Register `CreateEmbedTokenCommandHandler` in `providers` array
  - [ ] Subtask 5.4: Register `EmbedController` in `controllers` array
  - [ ] Subtask 5.5: Import `WhiteLabelModule` and `AuthUserModule` in `IntegrationApiKeyModule.imports`
- [ ] Task 6: Write unit tests for command handler (AC: #1, #2, #3, #5)
  - [ ] Subtask 6.1: `create-embed-token.command-handler.spec.ts` with mocked repos + service
  - [ ] Subtask 6.2: Happy path — embed enabled, user belongs to company → ok with token+expiresAt
  - [ ] Subtask 6.3: `embedEnabled=false` → err with `EMBED_DISABLED_FOR_TENANT` code
  - [ ] Subtask 6.4: User not found → err with `EMBED_USER_NOT_IN_TENANT` code
  - [ ] Subtask 6.5: User belongs to different company → err with `EMBED_USER_NOT_IN_TENANT` code
  - [ ] Subtask 6.6: `white_label_configs` not found → err with `EMBED_DISABLED_FOR_TENANT` (safe default)
  - [ ] Subtask 6.7: Roles from user account are passed to `createToken` (verify mock call args)
- [ ] Task 7: Write e2e tests (AC: #1, #2, #3, #4, #5)
  - [ ] Subtask 7.1: `test/embed-start.e2e-spec.ts` with mocked repos and EmbedTokenService
  - [ ] Subtask 7.2: Override `IntegrationApiKeyGuard` to inject a mock `req.integrationApiKey`
  - [ ] Subtask 7.3: Override `WhiteLabelConfig` repository mock to return config with `embedEnabled=true`
  - [ ] Subtask 7.4: Override `UserAccount` repository mock to return user
  - [ ] Subtask 7.5: Mock `EmbedTokenService.createToken` to return deterministic token
  - [ ] Subtask 7.6: Test happy path → 200 with `{ token, expiresAt }`
  - [ ] Subtask 7.7: Test `embedEnabled=false` → 403 with `EMBED_DISABLED_FOR_TENANT`
  - [ ] Subtask 7.8: Test user not in company → 403 with `EMBED_USER_NOT_IN_TENANT`
  - [ ] Subtask 7.9: Test tenant mismatch (API key companyId ≠ body companyId) → 403 with `EMBED_TENANT_MISMATCH`
  - [ ] Subtask 7.10: Test invalid `X-Api-Key` → 401 (via guard, not controller logic)

## Dev Notes

### Architecture Patterns to Follow

- **DDD/CQRS:** Command pattern with handler + Result return
- **Result Pattern:** `Promise<Result<T, DomainError>>` — never throw
- **Symbol Token DI:** Inject via `@Inject(REPO_TOKEN)` / `@Inject(EMBED_TOKEN_SERVICE)`
- **Existing pattern:** Follow `create-integration-api-key.command-handler.ts` structure
- **Existing guard:** Reuse `IntegrationApiKeyGuard` (NFR-I1) — injects `req.integrationApiKey` with `{ id, companyId, environment }`
- **Tests with `Uuid.random().value`:** NEVER fake strings
- **Describe in Spanish:** Convention for test descriptions

### Security Boundaries

| Layer | Validates | Failure mode |
|-------|-----------|--------------|
| `IntegrationApiKeyGuard` | `X-Api-Key` header → SHA-256 hash → DB lookup → active status | 401 Unauthorized |
| Controller (tenant mismatch) | `req.integrationApiKey.companyId === dto.companyId` | 403 `EMBED_TENANT_MISMATCH` |
| CommandHandler (embed enabled) | `white_label_configs.embedEnabled === true` | 403 `EMBED_DISABLED_FOR_TENANT` |
| CommandHandler (user in tenant) | `user.companyId === dto.companyId` | 403 `EMBED_USER_NOT_IN_TENANT` |
| CommandHandler (token issue) | `embedTokens.createToken(...)` | 500 (Redis failure) |

### Source Tree Components to Touch

**New files to create:**

- `src/context/auth/integration-api-key/application/commands/create-embed-token.command.ts` — command class
- `src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler.ts` — handler with deps
- `src/context/auth/integration-api-key/application/commands/__tests__/create-embed-token.command-handler.spec.ts` — unit tests
- `src/context/auth/integration-api-key/application/dtos/create-embed-token.dto.ts` — request/response DTOs
- `src/context/auth/integration-api-key/domain/errors/embed-token.errors.ts` — ADD `EmbedTokenForbiddenError` (Story 1.2 already created the file with 4 errors; add 1 more)
- `src/context/auth/integration-api-key/infrastructure/controllers/embed.controller.ts` — REST endpoint
- `test/embed-start.e2e-spec.ts` — e2e tests

**Files to modify:**

- `src/context/auth/integration-api-key/infrastructure/integration-api-key.module.ts` — register handler + controller, import WhiteLabelModule + AuthUserModule

### Project Structure Notes

- All new files go inside the existing `auth/integration-api-key` context
- The embed controller lives in the SAME context as the API key guard — they're used together
- The `embed.controller.ts` route prefix is `v2/integration/embed` (not `v2/companies/:id/white-label` — that's for white-label config, different concern)
- NO new module needed — extend `IntegrationApiKeyModule`

### Code Reuse / Patterns to Follow

**From `create-integration-api-key.command-handler.ts` (existing pattern):**

```typescript
@Injectable()
export class CreateEmbedTokenCommandHandler {
  constructor(
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY)
    private readonly whiteLabelRepository: IWhiteLabelConfigRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    @Inject(EMBED_TOKEN_SERVICE)
    private readonly embedTokens: IEmbedTokenService,
  ) {}

  async execute(command: CreateEmbedTokenCommand): Promise<Result<CreateEmbedTokenResult, DomainError>> {
    // 1. Check embed enabled
    const configResult = await this.whiteLabelRepository.findByCompanyId(command.companyId);
    if (configResult.isErr() || !configResult.unwrap().embedEnabled) {
      return err(new EmbedTokenForbiddenError('EMBED_DISABLED_FOR_TENANT'));
    }

    // 2. Verify user in tenant
    const user = await this.userRepository.findById(command.userId);
    if (!user || user.companyId.value !== command.companyId) {
      return err(new EmbedTokenForbiddenError('EMBED_USER_NOT_IN_TENANT'));
    }

    // 3. Issue token
    const roles = user.roles.toPrimitives(); // UserAccountRoles.toPrimitives() returns string[]
    const tokenResult = await this.embedTokens.createToken(command.companyId, command.userId, roles);
    if (tokenResult.isErr()) return err(tokenResult.error);

    return ok({
      token: tokenResult.unwrap().token,
      expiresAt: tokenResult.unwrap().expiresAt,
    });
  }
}
```

**From `IntegrationApiKeyRequest` (existing):**

```typescript
export interface IntegrationApiKeyRequest extends Request {
  integrationApiKey: {
    id: string;
    companyId: string;
    environment: string;
  };
}
```

The controller uses `req.integrationApiKey.companyId` (populated by the guard).

### Project Context References

- **PRD NFR-S4, S5:** Tenant isolation — `IntegrationApiKey.companyId` must match `dto.companyId`; `userId` must belong to `companyId`
- **PRD NFR-I1:** Reuse `IntegrationApiKeyGuard` (no new guard)
- **Architecture A1, A2:** Token opaque in Redis, schema extension in `white_label_configs`
- **Story 1.1 (done):** Schema fields `embedEnabled` and `embedAllowedOrigins` in `white_label_configs`
- **Story 1.2 (done):** `EmbedTokenService` with `createToken(companyId, userId, roles)` method
- **Story 2.2 (out of scope):** `EmbedTokenAuthenticatedEvent` audit log persistence — this story does NOT emit events (consistent with Story 1.1/1.2 scope)

### Security Considerations (NFR-S1 to S5, S9, S10)

- **NFR-S1:** Tokens are opaque (256-bit base64url) — already implemented in Story 1.2
- **NFR-S4:** API key's `companyId` must match body's `companyId` (controller check)
- **NFR-S5:** `userId` must exist and belong to `companyId` (handler check)
- **NFR-S9:** Redis namespace `embed:*` is isolated from BFF sessions
- **NFR-SC2:** Embed endpoint doesn't share BFF login path (different Redis namespace)

### Multi-tenant Isolation (CRITICAL)

Every query in this endpoint MUST validate `companyId`:
- ✅ `IntegrationApiKeyGuard.companyId === dto.companyId` (controller)
- ✅ `user.companyId === dto.companyId` (handler)
- ✅ `white_label_configs.companyId === dto.companyId` (handler)
- ❌ NO direct lookups by `userId` alone — always paired with `companyId`

### Performance (NFR-P3)

- `< 200ms p95` for the endpoint
- 2 sequential DB calls (white_label_configs + user_accounts) + 1 Redis call
- Both DB calls are indexed by `companyId` (existing indexes)
- Redis is in-memory, ~1ms

### Out of Scope (deferred to other stories)

- **Story 1.4:** `POST /v2/integration/embed/refresh` endpoint
- **Story 2.1:** `POST /embed/authenticate-session` (BFF session from token)
- **Story 2.2:** `EmbedTokenAuthenticatedEvent` audit log persistence
- **Story 2.3:** Logout flow with token revocation
- **Story 2.4:** Rate limiting via `embed:refresh:<userId>` key

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-1.3] — original story definition with BDD ACs
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-S4-S5] — tenant isolation security NFRs
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-I1] — reuse IntegrationApiKeyGuard
- [Source: _bmad-output/planning-artifacts/architecture.md#A1-A2] — token schema, namespace
- [Source: src/context/auth/integration-api-key/infrastructure/integration-api-key.guard.ts] — `IntegrationApiKeyRequest` interface
- [Source: src/context/auth/integration-api-key/application/commands/create-integration-api-key.command-handler.ts] — handler pattern
- [Source: src/context/white-label/domain/white-label-config.repository.ts] — `IWhiteLabelConfigRepository` interface
- [Source: src/context/auth/auth-user/domain/user-account.repository.ts] — `UserAccountRepository` interface
- [Source: src/context/auth/auth-user/domain/user-account.aggregate.ts] — `UserAccount` (has `roles` and `companyId`)
- [Source: src/context/auth/integration-api-key/infrastructure/services/redis-embed-token.service.ts] — `EmbedTokenService.createToken()`
- [Source: _bmad-output/implementation-artifacts/1-2-implement-opaque-token-generation-in-embedtokenservice.md] — previous story learnings
- [Source: _bmad-output/implementation-artifacts/1-1-extend-white-label-configs-schema-for-embed.md] — Story 1.1 patterns

## Dev Agent Record

### Agent Model Used

MiniMax-M3 (MiniMax Coding Plan)

### Debug Log References

### Completion Notes List

### File List
