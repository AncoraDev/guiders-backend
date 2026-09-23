# Story 3.1: Implement EmbedBootstrapService with versioned postMessage protocol

Status: ready-for-dev

> **Origin**: First story of Epic 3 (Cross-Frame Auth Handshake). Implements the front-end half of the postMessage handshake that allows LeadCars to mount the Guiders admin iframe and complete auth without cross-domain cookies.
>
> **Cross-repo implementation note**: This story's code lives in the **frontend repo** (`../guiders-frontend`), not in this backend repo. The spec lives here for BMad traceability. The dev agent must `cd ../guiders-frontend` before implementing.

---

## Story

As an embed iframe when it loads,
I want to send `postMessage('guiders:v1:ready')` to the parent and listen for `leadcars:v1:auth` from the parent,
So that we can complete the authentication handshake without any cross-domain cookies.

## Acceptance Criteria

### AC1 — Bootstrap sends ready event

**Given** the embed iframe is loaded in the parent (LeadCars)
**When** Angular bootstrap completes
**Then** the `EmbedBootstrapService` calls:
```typescript
window.parent.postMessage(
  { type: 'guiders:v1:ready', payload: { version: '1.0.0' } },
  '*'
)
```
**And** the service registers a `window.addEventListener('message', ...)` listener

**Spec citation**: From `epics.md` Story 3.1 AC1:
> "the `EmbedBootstrapService` calls `window.parent.postMessage({ type: 'guiders:v1:ready', payload: { version: '1.0.0' } }, '*')`"

### AC2 — Auth message with valid origin triggers authentication

**Given** a `postMessage` event arrives with `type: 'leadcars:v1:auth'`
**And** `event.origin` matches one of `embedAllowedOrigins` for the tenant
**When** the listener fires
**Then**:
1. The service extracts `payload.token` and `payload.userId`
2. It calls `POST /embed/authenticate-session` with the token
3. On success, it navigates to `/embed/dashboard` (or the configured initial path)

**Spec citation**: From `epics.md` Story 3.1 AC2:
> "the service extracts `payload.token` and `payload.userId` / it calls `POST /embed/authenticate-session` with the token / on success, it navigates to `/embed/dashboard`"

### AC3 — Invalid origin is silently rejected

**Given** a `postMessage` event arrives with `type: 'leadcars:v1:auth'`
**And** `event.origin` does NOT match any allowed origin
**When** the listener fires
**Then**:
1. The service silently rejects the message (no error response, no UI feedback)
2. The service logs a `WARN` to the console for debugging (with origin value but NOT the token)

**Spec citation**: From `epics.md` Story 3.1 AC3:
> "the service silently rejects the message (no error response, no UI feedback) / the service logs a warning to the console for debugging"

### AC4 — Unknown message type is silently ignored

**Given** a `postMessage` event arrives with a `type` that is not recognized (not `guiders:v1:*` and not `leadcars:v1:auth`)
**When** the listener fires
**Then** the service silently ignores it (no error, no processing)

**Spec citation**: From `epics.md` Story 3.1 AC4:
> "the service silently ignores it (no error, no processing)"

### AC5 — AI-3 compliance (specific assertions)

**Given** unit tests for `EmbedBootstrapService`
**When** asserting error behavior
**Then**:
- Tests use `expect.objectContaining({...})` or specific message strings (NEVER just `toBeTruthy()`)
- Mock `window.parent.postMessage` and `window.addEventListener` with `vitest.fn()`
- No reliance on actual browser APIs in unit tests

### AC6 — AI-4 compliance (audit context for backend integration)

**Given** the `POST /embed/authenticate-session` call from this service
**When** the request is made
**Then**:
- The HTTP client sends the `Origin` header (browser sets automatically)
- The request body includes `userId` if provided in the postMessage payload
- The response cookie (`access_token`) is stored by the browser and sent on subsequent requests
- No manual cookie handling needed (browser does it)

## Tasks / Subtasks

### Task 1: Define postMessage types (lib)

- [ ] **1.1**: Create `libs/shared/types/src/lib/embed.types.ts`:
  ```typescript
  export type EmbedMessageType = 'guiders:v1:ready' | 'leadcars:v1:auth' | 'leadcars:v1:logout';

  export interface EmbedReadyMessage {
    type: 'guiders:v1:ready';
    payload: { version: '1.0.0' };
  }

  export interface EmbedAuthMessage {
    type: 'leadcars:v1:auth';
    payload: { token: string; userId?: string };
  }

  export interface EmbedLogoutMessage {
    type: 'leadcars:v1:logout';
    payload: Record<string, never>;
  }

  export type EmbedMessage = EmbedReadyMessage | EmbedAuthMessage | EmbedLogoutMessage;
  ```
- [ ] **1.2**: Export from `libs/shared/types/src/index.ts`
- [ ] **1.3**: Add a vitest spec for the type guards (type-narrowing helper)

### Task 2: Create EmbedBootstrapService

- [ ] **2.1**: Create `libs/admin/features/embed/src/lib/embed-bootstrap.service.ts`:
  - Inject `Window` (via Angular's `DOCUMENT` or platform check)
  - Method `bootstrap()`:
    1. Register `message` listener
    2. Send `guiders:v1:ready` to `window.parent`
  - Private method `handleMessage(event: MessageEvent)`:
    1. Validate origin against allowed origins
    2. If invalid → silent reject + WARN log
    3. If valid + `leadcars:v1:auth` → call `authenticate(token, userId)`
    4. If valid + `leadcars:v1:logout` → call logout (Story 3.2 scope)
    5. If unknown type → silent ignore
  - Private method `authenticate(token, userId)`:
    1. POST to `/embed/authenticate-session`
    2. On 200 → navigate to `/embed/dashboard`
    3. On error → log error (no UI feedback per AC3)
- [ ] **2.2**: Service must be `providedIn: 'root'` (singleton)
- [ ] **2.3**: Service must be `OnDestroy`-aware (unregister listener on Angular destroy)

### Task 3: Create EmbedAllowedOriginsService

- [ ] **3.1**: Create `libs/admin/features/embed/src/lib/embed-allowed-origins.service.ts`:
  - Holds the allowed origins for the current tenant
  - Method `isAllowed(origin: string): boolean`
  - Method `setAllowed(origins: string[])`
- [ ] **3.2**: Source the allowed origins from:
  - URL query param `?allowedOrigins=https://...` (dev/testing)
  - OR hardcoded default (production: from white-label config fetched in Story 4.x)

> **Note**: Story 4.x will integrate the full white-label config flow. For Story 3.1, the allowed origins come from a URL query param (dev) or an explicit `setAllowed()` call (test/prod).

### Task 4: Wire EmbedBootstrapService to Angular bootstrap

- [ ] **4.1**: In `apps/admin/src/app/app.config.ts`, add `APP_INITIALIZER` provider:
  ```typescript
  {
    provide: APP_INITIALIZER,
    multi: true,
    deps: [EmbedBootstrapService],
    useFactory: (svc: EmbedBootstrapService) => () => svc.bootstrap(),
  }
  ```
- [ ] **4.2**: OR call `bootstrap()` in `App.ngOnInit()` (whichever the dev prefers — discuss in PR)

### Task 5: Unit tests with Vitest

- [ ] **5.1**: `libs/admin/features/embed/src/lib/embed-bootstrap.service.spec.ts`:
  - **AC1 test**: mock `window.parent.postMessage`, call `bootstrap()`, assert called with `{type: 'guiders:v1:ready', payload: {version: '1.0.0'}}`
  - **AC1 test**: mock `window.addEventListener`, call `bootstrap()`, assert registered with `'message'` event
  - **AC2 test**: simulate MessageEvent with type `leadcars:v1:auth` + valid origin → assert `POST /embed/authenticate-session` called + navigate called
  - **AC3 test**: simulate MessageEvent with invalid origin → assert NO HTTP call + NO navigate + console.warn called (with origin in args, NOT token)
  - **AC3 test**: assert message with INVALID origin does NOT log the token (security check)
  - **AC4 test**: simulate MessageEvent with `type: 'unknown:v1:foo'` → assert NO HTTP call
  - **AC5 test**: use `expect.objectContaining({...})` for specific assertions (no `toBeTruthy()`)
  - **AC6 test**: mock `HttpClient.post` → assert correct URL + body shape + headers
  - Total: 8+ tests

- [ ] **5.2**: `libs/admin/features/embed/src/lib/embed-allowed-origins.service.spec.ts`:
  - `isAllowed('https://leadcars.com')` returns `true` if in list
  - `isAllowed('https://attacker.com')` returns `false`
  - `setAllowed([...])` updates the list
  - Total: 3+ tests

### Task 6: E2E test with Playwright (optional, separate PR)

- [ ] **6.1**: `apps/admin-e2e/src/embed/postmessage-handshake.spec.ts`:
  - Load parent page with mock iframe
  - Assert `guiders:v1:ready` message sent
  - Trigger `leadcars:v1:auth` from parent
  - Assert iframe navigates to `/embed/dashboard`

> **Scope decision**: E2E test is OUT OF SCOPE for this story. Story 7.x covers Playwright E2E setup for the embed flow.

### Task 7: Code review (mandatory, 2+ layers per TA-3 + AI-2 spec citation)

- [ ] **7.1**: PASS 1 (architecture/code quality):
  - Focus: silent rejection of invalid origins (security)
  - Focus: token NEVER logged (PII)
  - Focus: listener cleanup on destroy (memory leak prevention)
- [ ] **7.2**: PASS 2 (edge case hunter):
  - Focus: postMessage with null `event.data`
  - Focus: postMessage from same-origin (`window.self`)
  - Focus: rapid duplicate auth messages (race)
  - Focus: postMessage sent during Angular destroy
- [ ] **7.3**: PASS 3 (acceptance auditor) with **AI-2 spec citation**:
  - Every AC (AC1-AC4) MUST cite the literal text from `epics.md` Story 3.1
  - Verify spec text matches implementation behavior

### Task 8: Documentation

- [ ] **8.1**: Create `libs/admin/features/embed/README.md`:
  - Architecture diagram (iframe ↔ parent)
  - Message flow diagram
  - Security considerations (origin validation, token handling)
- [ ] **8.2**: Update `libs/shared/types/README.md` with embed types section

## Dev Notes

### Cross-repo implementation

This story is implemented in **`../guiders-frontend`** (Angular repo), NOT in this backend repo.

```
guiders-backend/                    ← THIS REPO (specs only)
  _bmad-output/implementation-artifacts/3-1-...md  ← You are here

guiders-frontend/                   ← WHERE THE CODE GOES
  libs/admin/features/embed/src/lib/
    embed-bootstrap.service.ts
    embed-allowed-origins.service.ts
    embed-bootstrap.service.spec.ts
    embed-allowed-origins.service.spec.ts
  libs/shared/types/src/lib/
    embed.types.ts
  apps/admin/src/app/
    app.config.ts (or app.ts)
```

**Dev workflow**:
```bash
cd /Users/rogerpugaruiz/Proyectos/guiders-frontend
# Then implement + test
```

### Project Structure Notes

- **New lib**: `libs/admin/features/embed/` (Nx library)
- **New types file**: `libs/shared/types/src/lib/embed.types.ts`
- **Modified files**:
  - `libs/shared/types/src/index.ts` (export new types)
  - `apps/admin/src/app/app.config.ts` (or `app.ts`) — wire `EmbedBootstrapService`

### Architecture Compliance

- **Standalone components**: Service uses `inject()` not constructor injection (Angular 17+ style)
- **Signals**: Use Angular signals for reactive state (e.g., `isAuthenticated = signal(false)`)
- **Result pattern**: N/A (this is frontend, not NestJS CQRS)
- **Symbol DI**: N/A (Angular uses class-based DI)

### Library/Framework Requirements

- **Angular**: already in `package.json` (version ~18)
- **@angular/common/http**: already in `package.json` (for HttpClient)
- **Vitest**: already in `package.json` (test runner)
- **@analogjs/vitest-angular**: already in `package.json` (Angular testing utilities)
- **No new dependencies required**

### Testing Requirements

- **AI-1.5**: Use Pattern 0 (`npm run generate:red-tests`) for backend story; for this **frontend** story, write tests directly using Vitest patterns from existing dashboard spec
- **AI-3**: Use `expect.objectContaining({...})` or specific message strings; NEVER `toBeTruthy()` alone
- **AI-2**: PASS 3 audit MUST cite spec text literally

### Previous Story Intelligence

- **Story 1.1** (backend): `embedEnabled` + `embedAllowedOrigins` fields added to white-label schema
- **Story 1.3** (backend): `POST /v2/integration/embed/start` returns token
- **Story 2.1** (backend): `POST /embed/authenticate-session` is what this frontend service calls
- **Architecture decision 3** (architecture.md): "rechazo silencioso de orígenes no listados, sin enviar mensaje de error al potential attacker" → AC3
- **Architecture decision 4**: "inline CSS en `<head>` ANTES de `<script src=...>`" → Story 4.x (branding application)

### Security Considerations (CRITICAL)

⚠️ **Token handling**:
- NEVER log the token value (only the origin, only the event type)
- NEVER include the token in error messages shown to UI
- NEVER store the token in localStorage / sessionStorage
- The token is held by the browser via the `Set-Cookie` response header (handled automatically)

⚠️ **Origin validation**:
- Strict exact match (case-sensitive)
- No wildcard origins
- No regex (predictable matches only)
- Silent rejection (no error feedback to potential attacker)

⚠️ **Listener cleanup**:
- Remove the `message` listener on Angular destroy (memory leak prevention)
- Use `takeUntilDestroyed()` from `@angular/core/rxjs-interop` or explicit `removeEventListener`

### References

- Spec source: `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.1)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (decisions 3, 4, 7)
- PRD: `_bmad-output/planning-artifacts/prd.md` (FR6, FR7, FR8, FR35, FR36)
- Backend spec: `_bmad-output/implementation-artifacts/2-1-implement-post-embed-authenticate-session-to-create-bff-session-from-token.md`
- Existing patterns: `../guiders-frontend/libs/admin/features/dashboard/src/lib/dashboard.spec.ts`
- Angular inject pattern: `../guiders-frontend/apps/admin/src/app/app.ts`

### Open Questions

1. **Q1**: Should `EmbedBootstrapService.bootstrap()` be called via `APP_INITIALIZER` or in `App.ngOnInit()`?
   - **Recommendation**: `APP_INITIALIZER` — runs before Angular routes are loaded, so the message listener is ready when the parent might immediately send `leadcars:v1:auth`
2. **Q2**: Where does the allowed origins list come from in production?
   - **Recommendation**: Story 4.x (white-label branding) will fetch from the backend. For Story 3.1, use URL query param `?allowedOrigins=...` as a fallback
3. **Q3**: How does the service know it's running in embed mode (vs. standalone)?
   - **Recommendation**: Detect via `window.self !== window.top` (Story 3.2 scope). For Story 3.1, the service just registers the listener — no harm if it never receives a message

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

- [x] Story spec is complete (6 ACs, 8 tasks, dev notes, security considerations)
- [x] All ACs cite literal spec text from `epics.md` (AI-2 ready)
- [x] AI safeguards documented (AI-1.5, AI-2, AI-3)
- [x] Cross-repo implementation clarified
- [x] Test patterns identified (Vitest + @analogjs/vitest-angular)
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml
- [ ] Tech debt items updated (if any new items)

**Next step**: Run `bmad-dev-story` workflow with cross-repo context.