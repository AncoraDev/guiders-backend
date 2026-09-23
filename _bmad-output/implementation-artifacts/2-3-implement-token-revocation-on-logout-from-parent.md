# Story 2.3: HTTP-only logout with cascading revocation

Status: ready-for-dev

**Story ID**: 2.3
**Epic**: 2 — Embed Session Lifecycle & Audit (3/5 done)
**Type**: Backend HTTP endpoint (frontend logout UI deferred to Story 3.1)
**Estimated effort**: 3-4 hours (RED + GREEN + code review + TD-1/2/3 cleanup)
**Dependencies**: Story 2.1 (BFF session), Story 2.2 (audit log + tryPublish helper)

---

## Story

As a LeadCars iframe when the user logs out of the parent application,
I want the iframe to call `POST /bff/auth/logout` (new endpoint) which cascades revocation of both the BFF session and the originating embed token,
So that no stale session or token remains usable after logout, and the logout event is recorded in the audit log for security investigations.

**Scope decision (2026-06-17)**: HTTP-only — postMessage handshake and parent-unload detection deferred to **Story 3.1** (cross-epic dependency). This story delivers the **server-side cascading revocation + audit log integration**, which is the critical security path. The frontend wiring (postMessage listener, `/embed/login` navigation, "Connection lost" UI) is a frontend concern that will be addressed in Epic 3.

---

## Acceptance Criteria

### AC1: New endpoint `POST /bff/auth/logout` (cascading revocation)

**Given** a valid BFF session cookie (`access_token`) issued by Story 2.1
**When** `POST /bff/auth/logout` is called
**Then**:
1. The server reads `bff:session:<sessionId>` from Redis
2. The server extracts the `embedTokenRef` field from the session
3. The server deletes:
   - The BFF session key (`bff:session:<sessionId>`) → returns 1 if existed
   - The embed token key (`embed:token:<embedTokenRef>`) → returns 1 if existed
4. The server clears the `access_token` cookie (HttpOnly, Secure, SameSite=Lax, Path=/)
5. The server emits an `EmbedTokenAuthenticatedEvent` with `failureReason: LOGOUT_TRIGGERED` (or new value `LOGOUT_SUCCESS` — see Tech Note 1)
6. The server returns 200 OK with body `{ "loggedOut": true, "sessionId": "...", "embedTokenRevoked": true|false }`

**Test coverage**:
- Unit: handler emits success event when both Redis DELs succeed
- Unit: handler emits partial-success event when only one DEL succeeds
- E2E: full flow with real session in Redis

### AC2: Idempotency — logout is safe to call multiple times

**Given** a session that has already been logged out
**When** `POST /bff/auth/logout` is called again
**Then**:
1. The server returns 200 OK (NOT 404)
2. No error is emitted to the audit log (avoids alert noise)
3. The cookie is cleared (defensive — may already be absent)

**Test coverage**:
- Unit: handler returns ok even if `bff:session:<sessionId>` doesn't exist
- Unit: handler returns ok even if `embed:token:<embedTokenRef>` doesn't exist
- E2E: 2 consecutive logout calls both return 200

### AC3: Validation — 401 if no valid session

**Given** no `access_token` cookie OR an invalid session ID
**When** `POST /bff/auth/logout` is called
**Then**:
1. The server returns 401 Unauthorized with code `EMBED_SESSION_NOT_FOUND`
2. The server emits an `EmbedTokenAuthenticationFailedEvent` with `failureReason: EMBED_SESSION_NOT_FOUND`
3. No Redis operations are performed
4. No cookie is cleared (nothing to clear)

**Test coverage**:
- Unit: handler returns err if no session found
- E2E: 401 with no cookie
- E2E: 401 with invalid cookie value

### AC4: Multi-tenant isolation

**Given** a session belonging to `companyId=A`
**When** `POST /bff/auth/logout` is called
**Then** the cascading revocation only affects:
- `bff:session:<sessionId>` (the specific session)
- `embed:token:<embedTokenRef>` (the specific token, not all tokens for the user)

**Cross-tenant test**: session A logout MUST NOT revoke other sessions/tokens of the same user in company B.

**Test coverage**:
- Unit: handler does not iterate over multiple sessions
- E2E: setup 2 sessions for different companies, logout one, verify other still valid

### AC5: Cascading failure — partial revocation

**Given** a valid session with `embedTokenRef`
**And** the embed token has been manually deleted from Redis (race condition)
**When** `POST /bff/auth/logout` is called
**Then**:
1. The BFF session is deleted successfully
2. The embed token DEL returns 0 (already gone)
3. The handler returns ok (not err) — partial success is acceptable
4. An audit log entry is recorded with `result: success` and `failureDetail: 'partial: token already revoked'`

**Test coverage**:
- Unit: handler with token that doesn't exist returns ok
- E2E: delete token manually, call logout, verify 200 + audit log

### AC6: Audit log integration

**Given** any of the AC1-AC5 outcomes
**When** the handler completes
**Then** an `EmbedTokenAuthenticatedEvent` (success path) or `EmbedTokenAuthenticationFailedEvent` (failure path) is published to the event bus
**And** the existing `PersistEmbedTokenAuthenticatedEventHandler` persists the event to MongoDB `embed_token_audit_logs` collection.

**New event attributes required**:
- `logoutTimestamp: string` (ISO 8601)
- `cascadingResult: 'success' | 'partial' | 'failure'`
- `embedTokenRevoked: boolean`

**Test coverage**:
- Unit: handler emits event with new attributes
- Integration: event reaches MongoDB collection (covered by Story 2.2 regression)

---

## Tasks / Subtasks

### Pre-story: Tech debt cleanup (1.5h, parallel-safe)

These are Story 2.2 retro TD items that should be fixed BEFORE Story 2.3 to avoid contaminating the new code. Each is a separate commit for clean history.

#### TD-1: Fix timestamps conflict (Mongoose `timestamps: true` vs manual `createdAt`/`updatedAt`)

- [ ] **TD-1.1**: Inspect `src/context/auth/integration-api-key/infrastructure/schemas/embed-token-audit-log.schema.ts` — verify `timestamps: true` is set
- [ ] **TD-1.2**: Remove manual `createdAt: now()` / `updatedAt: now()` from `persist-embed-token-authenticated.event-handler.ts` (let Mongoose handle)
- [ ] **TD-1.3**: Remove manual `timestamp: event.attributes.timestamp` from the persistence primitives (keep `timestamp` as business timestamp, add Mongoose `createdAt` for indexing)
- [ ] **TD-1.4**: Update unit tests that asserted on `createdAt`/`updatedAt` from primitives
- [ ] **TD-1.5**: Verify TTL index uses `createdAt` (Mongoose-managed) not `timestamp` (business) — apply migration if needed

#### TD-2: Use `$facet` for atomic pagination in `findByQuery`

- [ ] **TD-2.1**: Refactor `mongo-embed-token-audit-log.repository.impl.ts:findByQuery` to use `aggregate([{ $facet: { total: [...], events: [...] } }])`
- [ ] **TD-2.2**: Update unit tests (mock `model.aggregate`)
- [ ] **TD-2.3**: Verify e2e tests still pass (audit log endpoint regression)

#### TD-3: Trust proxy + IPv6 normalization

- [ ] **TD-3.1**: Verify `main.ts:281` has `app.set('trust proxy', 1)` (already confirmed in PR #111 review)
- [ ] **TD-3.2**: Update `pii-sanitizer.util.ts:hashIp()` to normalize `::ffff:192.168.1.1` → `192.168.1.1` before hashing
- [ ] **TD-3.3**: Add unit tests for IPv6 normalization (4 cases: pure IPv4, IPv6-mapped, pure IPv6, malformed)

### Main story: HTTP-only logout

#### Task 1: Domain layer — value objects and errors

- [ ] **1.1**: Create `src/context/auth/bff/domain/value-objects/logout-cascade-result.ts`:
  - `LogoutCascadeResult` enum: `SUCCESS`, `PARTIAL`, `FAILURE`
  - `CascadeResultValue` class with factory methods
- [ ] **1.2**: Add to `src/context/auth/bff/domain/errors/bff-session.errors.ts`:
  - `BffSessionLogoutError` (parent) → 500
  - `BffSessionLogoutRedisError` → 503 EMBED_SERVICE_UNAVAILABLE
- [ ] **1.3**: Add to `src/context/auth/integration-api-key/domain/events/embed-auth-failure-reason.enum.ts`:
  - `LOGOUT_TRIGGERED` (new value, distinct from `UNKNOWN_ERROR`)

#### Task 2: Application layer — `LogoutCommand` and handler

- [ ] **2.1**: Create `src/context/auth/bff/application/commands/logout.command.ts`:
  ```typescript
  class LogoutCommand {
    constructor(
      public readonly sessionId: string,
      public readonly ipAddress: string,
      public readonly userAgent: string,
      public readonly origin: string,
    ) {}
  }
  ```
- [ ] **2.2**: Create `src/context/auth/bff/application/commands/logout.command-handler.ts`:
  - Inject `BFF_SESSION_SERVICE`, `EMBED_TOKEN_SERVICE`, `EMBED_TOKEN_AUDIT_LOG_REPOSITORY` (read-only, for `embedTokenRef`)
  - Inject `EventBus` for `tryPublish` events
  - Method `execute(command) → Result<LogoutCascadeResult, DomainError>`
  - Algorithm:
    1. Read `bff:session:<sessionId>` from Redis
    2. If not found → return ok(`NOT_FOUND`, emit failure event with `EMBED_SESSION_NOT_FOUND`)
    3. Extract `embedTokenRef` from session
    4. Delete BFF session (returns 1 if existed)
    5. Delete embed token (returns 1 if existed, 0 if already revoked)
    6. If both 1 → return ok(SUCCESS)
    7. If 1 + 0 → return ok(PARTIAL) with audit detail
    8. If 0 → return ok(NOT_FOUND, but already returned in step 2)
  - Use `tryPublish` for ALL event emissions (TA-4)
- [ ] **2.3**: Create `src/context/auth/bff/application/dtos/logout.dto.ts`:
  - `LogoutRequestDto` (empty body, just reads cookie)
  - `LogoutResponseDto`: `{ loggedOut: boolean, sessionId?: string, embedTokenRevoked: boolean, cascadingResult: 'success' | 'partial' | 'not_found' }`

#### Task 3: Infrastructure layer — controller endpoint

- [ ] **3.1**: Add `POST /bff/auth/logout` to `bff-auth.controller.ts` (or new `bff-logout.controller.ts` — see Tech Note 2):
  - `@PublicEndpoint()` (no JWT guard, but session cookie required)
  - Read `access_token` cookie via `readCookieEnv('admin').sessionName` (currently hardcoded — see Story 2.1 note)
  - Call `LogoutCommandHandler`
  - Map errors to HTTP status (success → 200, session not found → 401, Redis down → 503)
  - Clear `access_token` cookie on success
- [ ] **3.2**: Update `bff.module.ts`:
  - Register `LogoutCommandHandler` in `providers` + `exports` (for testing)
  - Verify `BFF_SESSION_SERVICE` is importable (Story 2.1 — yes, exported)
  - Verify `EMBED_TOKEN_SERVICE` is importable (Story 1.2 — yes, exported by `IntegrationApiKeyModule`)
- [ ] **3.3**: Update `integration-api-key.module.ts` to ensure `EMBED_TOKEN_AUDIT_LOG_REPOSITORY` is exported (currently NOT exported — see Tech Note 3)

#### Task 4: Tests

- [ ] **4.1**: Unit test `logout.command-handler.spec.ts` (Pattern A from AI-1.5):
  - Happy path: both DELs return 1 → SUCCESS event emitted
  - Partial: BFF DEL=1, token DEL=0 → PARTIAL event with `failureDetail: 'token already revoked'`
  - Not found: BFF session doesn't exist → ok with NOT_FOUND + failure event
  - AI-3: assertions use `message.toContain('token already revoked')` not `instanceof BaseError`
  - AI-1.5 Pattern A: mocks are `const`, `buildApp` before `mockResolvedValue`
- [ ] **4.2**: E2E test `test/bff-logout.e2e-spec.ts` (Pattern B from AI-1.5):
  - Full flow: create BFF session via `/embed/authenticate-session`, call `/bff/auth/logout`, verify 200 + cookie cleared + audit log entry
  - Idempotency: 2 consecutive calls both return 200
  - No cookie: 401 EMBED_SESSION_NOT_FOUND
  - Multi-tenant: 2 sessions for different companies, logout one, other still valid
  - AI-1.5: mocks are `const`, `app = await buildApp(...)` before `mockResolvedValue`
- [ ] **4.3**: Audit log regression: verify the new events appear in MongoDB `embed_token_audit_logs` collection
- [ ] **4.4**: Story 1.3/1.4/2.1/2.2 regression: existing tests must still pass

#### Task 5: Module wiring verification (AI-2 checklist)

- [ ] **5.1**: Verify `bff.module.ts` has:
  - `CqrsModule` in imports (or global, check `app.module.ts`)
  - `IntegrationApiKeyModule` in imports (already)
  - `LogoutCommandHandler` in providers
  - `BFF_SESSION_SERVICE` provided (already, from Story 2.1)
- [ ] **5.2**: Verify `integration-api-key.module.ts` exports `EMBED_TOKEN_AUDIT_LOG_REPOSITORY` (new export for this story)
- [ ] **5.3**: Run `npm run build` and verify 0 errors BEFORE running tests
- [ ] **5.4**: Run `npx jest --config ./jest-unit.json src/context/auth/bff/` and verify 0 regressions

#### Task 6: Documentation

- [ ] **6.1**: Update `src/context/auth/bff/AGENTS.md`:
  - Add section "Logout flow (Story 2.3)" documenting the endpoint, cascade logic, and event types
  - Update the "Known Limitation" section to note that Story 2.3 mitigates the cookie-name collision risk
- [ ] **6.2**: Update `src/context/auth/integration-api-key/AGENTS.md`:
  - Add `LOGOUT_TRIGGERED` to the `EmbedAuthFailureReason` enum documentation
  - Document the new `EmbedTokenAuthenticatedEvent.logoutTimestamp` and `cascadingResult` attributes

#### Task 7: Code review (mandatory, 3+ layers per TA-3)

- [ ] **7.1**: Run PASS 1 (architecture/code quality) using the `bmad-code-review` skill
- [ ] **7.2**: Run PASS 2 (edge case hunter) using `bmad-review-edge-case-hunter`
- [ ] **7.3**: Run PASS 3 (acceptance auditor) using the AI-2 check:
  - Every AC must be cited literally from the spec
  - Any deviation = bug (not enhancement)
  - **AI-2 guard**: re-run `detectSpecCitationGap()` on the audit report before accepting
- [ ] **7.4**: Run PASS 4 (test reviewer) using `bmad-testarch-test-review`:
  - Verify AI-3 compliance: no `instanceof BaseError` in tests
  - Verify AI-1.5 compliance: mocks are `const`, buildApp before mockResolvedValue
  - Verify e2e tests use realistic UUIDs (`Uuid.random().value`)
- [ ] **7.5**: Triage all findings, patch critical/high, defer medium/low to follow-up

---

## Dev Notes

### Architecture Patterns (MUST follow)

- **Result pattern**: `Promise<Result<T, E>>` for all command handlers (AGENTS.md critical pattern)
- **Symbol-based DI**: Use `BFF_SESSION_SERVICE`, `EMBED_TOKEN_SERVICE`, `EMBED_TOKEN_AUDIT_LOG_REPOSITORY` symbols
- **tryPublish helper**: `tryPublish(this.eventBus, event, this.logger, 'logout')` for ALL event emissions (TA-4)
- **Cascading operations**: use a single Lua script for atomic BFF+token delete (or accept eventual consistency with audit log)

### File Structure (MUST follow)

```
src/context/auth/bff/
├── domain/
│   ├── value-objects/
│   │   └── logout-cascade-result.ts          [NEW]
│   ├── errors/
│   │   └── bff-session.errors.ts             [MODIFY: +LogoutError, +LogoutRedisError]
│   └── services/
│       └── bff-session.service.ts            [unchanged]
├── application/
│   ├── commands/
│   │   ├── logout.command.ts                 [NEW]
│   │   └── logout.command-handler.ts         [NEW]
│   └── dtos/
│       └── logout.dto.ts                     [NEW]
└── infrastructure/
    ├── controllers/
    │   ├── bff-auth.controller.ts            [MODIFY: +POST logout endpoint]
    │   └── (or new bff-logout.controller.ts) [see Tech Note 2]
    └── bff.module.ts                          [MODIFY: +LogoutCommandHandler]

src/context/auth/integration-api-key/
├── domain/
│   ├── events/
│   │   └── embed-auth-failure-reason.enum.ts [MODIFY: +LOGOUT_TRIGGERED]
│   └── events/
│       └── embed-token-authenticated.event.ts [MODIFY: +logoutTimestamp, +cascadingResult]
└── infrastructure/
    └── integration-api-key.module.ts         [MODIFY: export EMBED_TOKEN_AUDIT_LOG_REPOSITORY]
```

### Testing Standards

- **Unit tests**: `*.spec.ts` in `__tests__/` next to source
- **E2E tests**: `test/*.e2e-spec.ts` in `test/` directory
- **Test naming**: Spanish `describe` blocks, `Uuid.random().value` for IDs
- **Mock pattern**: `const` mocks (not `let`), `buildApp` BEFORE `mockResolvedValue` (AI-1.5)
- **Error assertions**: `message.toContain('...')` or `instanceof SpecificSubclass`, NEVER `instanceof BaseError` (AI-3)
- **Acceptance auditors**: Every AC must cite the spec literally (AI-2)

### Tech Notes (decisions to make)

#### Tech Note 1: New event value or reuse existing?

**Decision needed**: Should we add a new value `LOGOUT_TRIGGERED` to `EmbedAuthFailureReason` (which is semantically a SUCCESS, not a failure), or add a new field `eventType: 'logout'` to `EmbedTokenAuthenticatedEvent`?

**Recommendation**: Add a new value `LOGOUT_TRIGGERED` to `EmbedAuthFailureReason`. Rationale: the enum already distinguishes success/failure paths, and `LOGOUT_TRIGGERED` is a "successful security event" (similar to how `LOGOUT_SUCCESS` would be modeled in other systems). This keeps the schema simple.

**Alternative**: Reuse the existing success path and add a `logoutTimestamp` field to differentiate logout events from initial authentication.

#### Tech Note 2: New controller or extend existing?

**Decision needed**: Add `POST /bff/auth/logout` to existing `bff-auth.controller.ts`, or create a new `bff-logout.controller.ts`?

**Recommendation**: Add to `bff-auth.controller.ts`. Rationale: the existing `doLogout` method is for OIDC/Keycloak logout. We need a NEW method (e.g., `logoutEmbed`) that handles embed session revocation. Same controller, different method, same DTO namespace (`/bff/auth/logout`).

**Alternative**: New controller `bff-logout.controller.ts` for separation of concerns. More files but cleaner.

#### Tech Note 3: Export `EMBED_TOKEN_AUDIT_LOG_REPOSITORY`?

**Decision needed**: `IntegrationApiKeyModule` currently does NOT export `EMBED_TOKEN_AUDIT_LOG_REPOSITORY`. Story 2.3 needs it from `BffModule` to look up `embedTokenRef` for cascading.

**Recommendation**: Export it. It's already a `@Inject()` symbol, so the export is just adding it to the `exports` array. No security risk (it's read-only — only `findByQuery` is used).

**Alternative**: Pass `embedTokenRef` through the BFF session payload instead of looking it up. The current schema already stores `embedTokenRef` in the session, so we don't need a separate lookup. **This is the better alternative** — no module change needed.

### Open Questions

1. **Q1**: Should the logout endpoint be rate-limited (Story 2.4 introduces rate limiting — is logout a candidate)?
2. **Q2**: For multi-device scenarios (user has 2 browser tabs with embed open), should logout revoke ALL sessions for the user, or only the current one?
3. **Q3**: Should the audit log entry include the `embedTokenRef` (43 chars) or just the `companyId` + `userId`?

**Default answers** (if user doesn't clarify):
- Q1: No rate limit for now (Story 2.4 will introduce `embed:refresh:<userId>` rate limiting; logout is a one-shot action)
- Q2: Only the current session (cascading is per-`embedTokenRef`, not per-user; if the user wants to revoke all, they call logout N times)
- Q3: Include `embedTokenRef` (it's needed for incident investigation; the audit log already stores it for other events)

---

## Dev Agent Record

### Agent Model Used

TBD (Claude Sonnet 4.6 or equivalent)

### Debug Log References

TBD

### Completion Notes List

TBD

### File List

TBD (will be filled by dev agent when implementation completes)

---

## References

- **Story spec source**: `_bmad-output/planning-artifacts/epics.md` (lines 254-274, Story 2.3 section)
- **Story 2.3 spec implementation notes**: To be created at `_bmad-output/implementation-artifacts/2-3-implement-token-revocation-on-logout-from-parent.md` (this file)
- **Story 2.2 retro** (action items, tech debt): `_bmad-output/implementation-artifacts/story-2-2-retro-2026-06-16.md`
- **BFF context AGENTS.md**: `src/context/auth/bff/AGENTS.md` (existing, requires update)
- **Integration API Key AGENTS.md**: `src/context/auth/integration-api-key/AGENTS.md` (existing, requires update)
- **tryPublish helper**: `src/context/shared/events/try-publish.ts` (created in Story 2.2)
- **BFF session service**: `src/context/auth/bff/domain/services/bff-session.service.ts`
- **Embed token service**: `src/context/auth/integration-api-key/domain/services/embed-token.service.ts`
- **Audit log repository**: `src/context/auth/integration-api-key/domain/repositories/embed-token-audit-log.repository.ts`
- **AI-1.5 SOP (try-tdd-generator)**: `.opencode/skills/try-tdd-generator.md`
- **AI-2 spec citation check**: `try-tdd-generator.md` Step 6
- **PR #111** (merged): https://github.com/RogerPugaRuiz/guiders-backend/pull/111 (Epic 1 + 2.1 + 2.2 baseline)

---

## Ready for Dev Checklist

- [x] Story spec is complete (AC1-AC6, 7 tasks, dev notes, tech notes)
- [x] Dependencies are met (Story 2.1 + 2.2 merged)
- [x] AI-1.5 wrapper is in place (`try-tdd-generator` SOP)
- [x] AI-2 check is documented in SOP Step 6
- [x] AI-3 test patterns are documented in retro
- [x] Tech debt (TD-1, TD-2, TD-3) is scoped as pre-tasks
- [x] Scope decision documented (HTTP-only, defer postMessage to Story 3.1)
- [ ] Open questions answered by user (Q1-Q3 — defaults will apply)
- [ ] Story status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: `bmad-dev-story` workflow with `try-tdd-generator` skill (Pattern A/B/C from AI-1.5 SOP).
