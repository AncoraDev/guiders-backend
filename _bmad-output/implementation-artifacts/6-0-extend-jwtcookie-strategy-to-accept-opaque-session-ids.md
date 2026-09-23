# Story 6.0: Extend JwtCookieStrategy to accept opaque BFF session IDs (was Story 2.6)

Status: review

> **Note**: Originally Story 2.6 (out of Epic 2 scope). Renumerada a **Story 6.0** (pre-Epic 6) per Sprint Change Proposal 2026-06-17. Es **CRITICAL** porque desbloquea Epic 6 (RBAC in Embed — el iframe no puede usar la cookie `access_token` contra endpoints `JwtCookieAuthGuard` sin esta extensión).

---

## Story

As a LeadCars iframe user with a valid BFF session established via `POST /embed/authenticate-session` (Story 2.1),
I want subsequent requests to admin endpoints (protected by `JwtCookieAuthGuard`) to be authenticated using the opaque BFF session ID stored in the `access_token` cookie,
So that the iframe can make authenticated calls to admin APIs without requiring the original Keycloak JWT (which is bound to the parent window, not the iframe).

## Acceptance Criteria

### AC1: New strategy supports opaque BFF session IDs

**Given** a request with `access_token` cookie containing a 43-char base64url opaque session ID (set by Story 2.1's `POST /embed/authenticate-session`)
**When** the request hits an endpoint protected by `JwtCookieAuthGuard`
**Then**:
1. The new strategy detects the opaque format (43 base64url chars, not 3-segment JWT)
2. It looks up the session in Redis via `BFF_SESSION_SERVICE.getSession(sessionId)`
3. If session exists and not expired → returns a user object with `{ sub: userId, companyId, roles }` from session data
4. The `JwtCookieAuthGuard.handleRequest` accepts the user → request proceeds

### AC2: Backward compat with Keycloak JWT

**Given** a request with `access_token` cookie containing a valid Keycloak JWT
**When** the request hits an endpoint protected by `JwtCookieAuthGuard`
**Then**:
1. The new strategy detects the JWT format (3 segments separated by `.`)
2. It delegates to the existing `JwtCookieStrategy` (Keycloak JWKS validation)
3. Returns the same user object as today (`{ sub, email, roles }`)
4. **No breaking change** — all existing console/admin users continue to work

### AC3: Invalid session returns 401

**Given** a request with `access_token` cookie containing an opaque ID that:
- Does NOT exist in Redis
- OR has expired
- OR has invalid format (not 43 base64url, not JWT)
**When** the request hits an endpoint protected by `JwtCookieAuthGuard`
**Then**:
1. The strategy returns no user → guard throws `UnauthorizedException`
2. HTTP response: **401 Unauthorized** (consistent with current behavior)
3. No audit log entry is created (this is a normal 401, not a security event)

### AC4: Multi-tenant defense-in-depth

**Given** an opaque session belongs to `companyId=A`
**When** the session is used to authenticate a request to an endpoint scoped to `companyId=B`
**Then** the controller should still validate the session's `companyId` against its own `companyId` (defense-in-depth, NOT the strategy's job — strategy only authenticates the user, the controller does the authorization)

**Note**: This is documented behavior, not implemented in this story. Story 6.1+ Epic 6 controllers will add `companyId` validation per endpoint.

### AC5: AI-4 compliance (audit context)

**Given** the new strategy uses `extractAuditContext(req)` to log session lookups
**When** the strategy processes an opaque session
**Then**:
1. Logs include `origin`, `ipAddress` (with IPv6-mapped IPv4 normalization), `userAgent` (truncated to 500 chars)
2. Logs are emitted via `tryPublish` helper (not raw `eventBus.publish`)

**Test coverage**:
- Unit: 1 test verifying audit context extraction
- E2E: 1 test verifying audit log persistence in MongoDB

### AC6: AI-3 compliance (specific assertions)

**Given** unit tests for the new strategy
**When** asserting error behavior
**Then**:
- Tests use `message.toContain(...)` or `instanceof BffSessionNotFoundError`
- **NEVER** `instanceof BaseError` (Story 2.1 retro AI-3)

## Tasks / Subtasks

### Task 1: Domain — New `BffSessionCookieStrategy`

- [ ] **1.1**: Create `src/context/auth/auth-user/infrastructure/strategies/bff-session-cookie.strategy.ts`:
  - Class `BffSessionCookieStrategy` extends `PassportStrategy(Strategy, 'bff-session-cookie')`
  - `jwtFromRequest` extractor: extract `request.cookies['access_token']`
  - Custom `validate` that detects format:
    - If JWT format (3 segments) → return `{ sub: sub, email: email, roles: roles }` (delegate to Keycloak verification)
    - If opaque format (43 base64url) → return `{ sub: userId, companyId: companyId, roles: roles }` from session
  - Inject `BFF_SESSION_SERVICE` for opaque session lookup
  - Inject `JWKS` (or call existing `JwtCookieStrategy` internals) for JWT verification
- [ ] **1.2**: Implement format detection helper:
  - `function isJwtFormat(token: string): boolean` — returns true if `token.split('.').length === 3`
  - `function isOpaqueFormat(token: string): boolean` — returns true if `/^[A-Za-z0-9_-]{43}$/.test(token)`
  - Default → treat as invalid (return no user)
- [ ] **1.3**: Implement Redis session lookup with error handling:
  - `getSession(sessionId)` → if `BffSessionNotFoundError` → log WARN + return no user (401, no audit log)
  - If `BffSessionServiceUnavailableError` (Redis down) → log ERROR + return no user (401, no audit log — same as today's JWT verify failure)
  - If `BffSessionCorruptedError` (N6 fix from PR #115) → log WARN with "Data corruption" + return no user

### Task 2: Application — Update `JwtCookieAuthGuard`

- [ ] **2.1**: Modify `src/context/shared/infrastructure/guards/jwt-cookie-auth.guard.ts`:
  - Replace `extends AuthGuard('jwt-cookie')` with a **dual-auth guard** that:
    1. First tries `JwtCookieStrategy` (JWT validation)
    2. If JWT fails AND token is opaque format → tries `BffSessionCookieStrategy` (session lookup)
    3. If both fail → 401
  - This is the "**dual-auth guard**" pattern mentioned in `dual-auth.guard.ts` (if it exists)

### Task 3: Module wiring

- [ ] **3.1**: Register `BffSessionCookieStrategy` in `bff.module.ts`:
  - Add to `providers` array
  - Ensure `BFF_SESSION_SERVICE` is importable from `IntegrationApiKeyModule` (already exported per Story 2.1)
- [ ] **3.2**: Update `auth-user.module.ts` (if needed) to register the new strategy
- [ ] **3.3**: Run `npm run build` and verify 0 errors BEFORE writing tests

### Task 4: Tests (unit + e2e)

- [ ] **4.1**: Unit test `bff-session-cookie.strategy.spec.ts` (Pattern A from AI-1.5):
  - **Happy path**: opaque session ID valid → returns user with sub/companyId/roles
  - **JWT passthrough**: JWT valid → returns user with sub/email/roles (delegated to Keycloak)
  - **Opaque not found**: session doesn't exist → returns no user
  - **Opaque expired**: session past TTL → returns no user
  - **Invalid format**: token with 42 chars or non-base64url → returns no user
  - **JWT invalid**: token with bad signature → returns no user
  - **Audit context extraction**: uses `extractAuditContext` (mock Request)
- [ ] **4.2**: E2E test `test/jwt-cookie-opaque-session.e2e-spec.ts` (Pattern B):
  - Full flow: create BFF session via `POST /embed/authenticate-session`, then `GET /bff/auth/me` (or similar protected endpoint) with the cookie → 200
  - Backward compat: send valid Keycloak JWT cookie → 200
  - Invalid opaque ID → 401
  - Expired session → 401
  - Multi-tenant: opaque session A used to access endpoint scoped to companyId B → endpoint validates (controller-level, not strategy)
- [ ] **4.3**: Update existing `embed-authenticate-session.e2e-spec.ts` to add a follow-up authenticated request test (verifies the integration end-to-end)
- [ ] **4.4**: Run all regression tests: `npm run test:e2e -- --testPathPattern="embed-(start|refresh|authenticate-session|token-audit-log)"`

### Task 5: Module wiring verification (AI-2 checklist)

- [ ] **5.1**: Verify `bff.module.ts` has:
  - `CqrsModule` in imports
  - `JwtCookieStrategy` (existing) registered
  - `BffSessionCookieStrategy` (new) registered
  - `BFF_SESSION_SERVICE` importable from `IntegrationApiKeyModule`
- [ ] **5.2**: Run `npm run build` → 0 errors
- [ ] **5.3**: Run `npx jest --config ./jest-unit.json src/context/auth/auth-user/` → 0 regressions

### Task 6: Documentation (DOC-1 from retro)

- [ ] **6.1**: Update `src/context/auth/bff/AGENTS.md`:
  - Move Story 2.1 "Out of Scope" entry from "future Story 2.6" to "DONE — see auth-user/AGENTS.md"
  - Document the dual-auth pattern (JWT + opaque session ID)
- [ ] **6.2**: Update `src/context/auth/auth-user/AGENTS.md`:
  - Add new section "Opaque BFF Session Cookie Strategy (Story 6.0)"
  - Document the format detection logic
  - Reference `bff/AGENTS.md` for the session lookup side
- [ ] **6.3**: Update `AGENTS.md` (root) — add note in AI Safeguards that the strategy is backward compatible (referencing AC2)

### Task 7: Code review (mandatory, 3+ layers per TA-3 + AI-2 spec citation)

- [ ] **7.1**: Run PASS 1 (architecture/code quality) using `bmad-code-review` skill
  - Focus: format detection edge cases (43-char JWT? 2-segment opaque? etc.)
  - Focus: backward compat — does existing console/admin flow still work?
- [ ] **7.2**: Run PASS 2 (edge case hunter) using `bmad-review-edge-case-hunter`
  - Focus: session lookup race conditions
  - Focus: Redis-down behavior
  - Focus: PII in audit logs
- [ ] **7.3**: Run PASS 3 (acceptance auditor) with **AI-2 spec citation check**:
  - Every AC must cite the spec text literally (no inferred ACs)
  - Verify AC1-AC6 against this spec
- [ ] **7.4**: Apply patches from review
- [ ] **7.5**: Run final regression: all tests + lint + build

## Dev Notes

### Project Structure Notes

- **New file**: `src/context/auth/auth-user/infrastructure/strategies/bff-session-cookie.strategy.ts` (~80 lines)
- **Modified file**: `src/context/shared/infrastructure/guards/jwt-cookie-auth.guard.ts` (dual-auth logic, ~40 lines)
- **Modified file**: `src/context/auth/bff/infrastructure/bff.module.ts` (register new strategy, ~5 lines)
- **New test file**: `src/context/auth/auth-user/infrastructure/strategies/__tests__/bff-session-cookie.strategy.spec.ts` (~250 lines, 8+ tests)
- **New e2e file**: `test/jwt-cookie-opaque-session.e2e-spec.ts` (~150 lines, 4+ tests)

### Architecture Compliance

- **DDD layers**: Strategy lives in `infrastructure/strategies/` (correct — passport strategies are infrastructure)
- **Symbol DI**: `BFF_SESSION_SERVICE` is already exported by `IntegrationApiKeyModule` (Story 2.1) — reuse the symbol
- **Result pattern**: strategy returns `null` for invalid (not `Result` — passport convention is to throw or return null)
- **tryPublish helper**: any eventBus emission MUST use `tryPublish` (TA-4)
- **extractAuditContext**: use for audit context (AI-4)

### Library/Framework Requirements

- **passport-jwt**: already in package.json (used by JwtCookieStrategy)
- **passport-custom-strategy**: MAY be needed if we want a fully separate strategy (consider if dual-auth in same guard is simpler)
- **@nestjs/passport**: provides `PassportStrategy` base class
- **No new dependencies required** — all needed packages are present

### Testing Requirements (AI-1.5, AI-3, AI-2)

- **AI-1.5**: If subagent `@tdd-generator` returns empty → use Pattern A/B/C fallback from `.opencode/skills/try-tdd-generator.md`
- **AI-3**: `message.toContain(...)` or `instanceof BffSessionNotFoundError` (NEVER `instanceof BaseError`)
- **AI-2**: PASS 3 audit MUST cite spec text literally

### Previous Story Intelligence

- **Story 2.1** (BFF session): created the opaque session format and `BFF_SESSION_SERVICE`. Story 6.0 builds on it.
- **Story 2.3** (logout): used `cascadeRevoke` Lua pattern — not directly relevant to Story 6.0 but shows the pattern for atomic operations.
- **PR #115 review N6 fix**: `BffSessionCorruptedError` → `EMBED_SERVICE_UNAVAILABLE` — apply same pattern here for corruption cases.
- **AI-4** (`extractAuditContext`): mandatory for the new strategy (no duplicate extraction).

### References

- Sprint Change Proposal: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-06-17.md` (Change 2)
- Story 2.1 spec: `_bmad-output/implementation-artifacts/2-1-implement-post-embed-authenticate-session-to-create-bff-session-from-token.md` (Known Limitation section)
- `bff/AGENTS.md` (Known Limitation Story 2.6)
- `auth-user/AGENTS.md` (JwtCookieStrategy current docs)
- `jwt-cookie.strategy.ts` (reference implementation)
- `bff-session.service.ts` (interface to consume)
- AGENTS.md root (AI Safeguards section)

### Open Questions

1. **Q1**: Should we also extend `JwtCookieAuthGuard` to support BFF session lookup directly, OR create a separate `BffSessionCookieAuthGuard` and have the controller choose which one? **Recommendation**: dual-auth in same guard (avoids controller-level changes, more elegant).
2. **Q2**: What is the priority of session vs JWT when both could be valid? **Recommendation**: JWT first (faster — local cryptographic check, no Redis round-trip), then session as fallback.
3. **Q3**: For multi-tenant defense-in-depth (AC4), should the strategy add `companyId` to the user object for controller-level checks? **Recommendation**: YES — add `companyId` to user object so controllers can use it for authorization.

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

## Ready for Dev Checklist

- [x] Story spec is complete (6 ACs, 7 tasks, dev notes, tech notes)
- [x] Dependencies are met (Story 2.1 + 2.2 + 2.3 merged)
- [x] AI-1.5 wrapper active (try-tdd-generator SOP)
- [x] AI-2 spec citation check documented in SOP Step 6
- [x] AI-3 test patterns documented in retro
- [x] Sprint Change Proposal referenced (Change 2)
- [x] Open questions answered by recommended defaults
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: `bmad-dev-story` workflow with `try-tdd-generator` skill (Pattern A/B/C).
