# Story 3.2: Implement embed mode detection and chrome hiding

Status: ready-for-dev

> **Origin**: Second story of Epic 3 (Cross-Frame Auth Handshake). Implements the visual chrome hiding that makes the Guiders admin feel integrated with the parent application (LeadCars).
>
> **Cross-repo implementation**: This story is implemented in **`../guiders-frontend`** (Angular repo), not in this backend repo.
>
> **Spec scope clarification**: The original `epics.md` AC mentions hiding "top bar" and "footer" but the current admin layout has **no global top bar or footer** — only a sidebar. This spec hides the sidebar (the only global chrome) and the page-headers of each feature (which are feature-specific but would still look out-of-place in an iframe).

---

## Story

As an embed user inside an iframe,
I want to NOT see the standalone Guiders navigation chrome (sidebar, page headers, footer),
So that the interface feels integrated with the parent application (LeadCars).

## Acceptance Criteria

### AC1 — Detection: window.self !== window.top OR ?embed=true

**Given** the admin application loads
**When** the `App` component initializes
**Then** it detects embed mode by:
- `window.self !== window.top` (running inside an iframe), OR
- URL query param `?embed=true` (explicit opt-in for testing)
**And** it sets the `isEmbedMode` signal accordingly
**And** the signal is `computed()` (derived from window.top comparison at init time)

**Spec citation**: From `epics.md` Story 3.2 AC1:
> "it detects embed mode by: `window.self !== window.top` OR query param `?embed=true`"

> **Discrepancy with epics.md**: The spec also mentions "persists `isEmbedMode` in `localStorage` as `guiders:embedMode=true`". **This is NOT safe in cross-origin iframe scenarios** — a `leadcars.com` iframe cannot write to `guiders.com` localStorage (different origin). **We skip localStorage persistence** and recompute on each page load.

### AC2 — Sidebar hidden in embed mode

**Given** `isEmbedMode === true`
**When** the app renders
**Then** the sidebar (`<guiders-sidebar>` in `app.html`) is hidden via:
- `*ngIf` / `@if` on the sidebar element, OR
- A CSS class that sets `display: none` on the sidebar
**And** only `<router-outlet>` content fills the full viewport width

**Spec citation**: From `epics.md` Story 3.2 AC2:
> "the sidebar (left navigation) is hidden via `*ngIf` or signal"

> **Note**: The original AC2 mentions "top bar with Guiders logo" and "footer". These elements **do not exist** in the current admin layout. Only the sidebar is hidden. The sidebar's internal `<header>` with the logo is also hidden because the entire sidebar is hidden.

### AC3 — Page headers hidden in embed mode

**Given** `isEmbedMode === true`
**When** the user navigates to `/embed/dashboard` or any feature route
**Then** each feature's `<header class="page-header">` is hidden via a global CSS rule
**And** the route resolves correctly
**And** the embed-specific layout applies (full-width content, no page title)

**Spec citation**: From `epics.md` Story 3.2 AC3:
> "the user navigates to `/embed/dashboard` or any `/embed/*` route / the route resolves correctly / the embed-specific layouts apply"

> **Note**: There is no separate `/embed/*` route structure currently. The detection is based on `isEmbedMode` signal (set at init), not the URL pattern. All routes work, just without chrome.

### AC4 — Standalone mode: chrome visible

**Given** the user is in standalone mode (NOT in iframe, no `?embed=true` query param)
**When** the app loads
**Then**:
- The sidebar is visible (normal Guiders admin layout)
- The page headers are visible (feature-specific)
- `isEmbedMode === false`

**Spec citation**: From `epics.md` Story 3.2 AC4:
> "the user is in standalone mode (not in iframe) / the sidebar, top bar, and footer are visible (normal Guiders admin) / `isEmbedMode === false`"

### AC5 — AI-3 compliance (specific assertions)

**Given** unit tests for the embed mode detection service
**When** asserting behavior
**Then**:
- Tests use `expect.objectContaining({...})` or specific message strings (NEVER `toBeTruthy()` alone)
- Mock `window.self` and `window.top` with explicit return values
- Mock URL query params via `URLSearchParams`
- Use Vitest's `vi.stubGlobal()` for window mocking

### AC6 — Embed mode persists within a session (in-memory)

**Given** the app is loaded in embed mode
**When** the user navigates between routes
**Then** `isEmbedMode` remains `true` throughout the session
**And** the chrome stays hidden

**Note**: We do NOT persist to localStorage (cross-origin issue). The signal is computed once at init and stays in memory.

## Tasks / Subtasks

### Task 1: Create EmbedModeService

- [ ] **1.1**: Create `libs/admin/features/embed/src/lib/embed-mode.service.ts`:
  - Inject `DOCUMENT` to read `window.self`, `window.top`, URL
  - Method `isEmbedMode()` returns `boolean`:
    - Read `window.self !== window.top` (catches iframe scenario)
    - OR parse `?embed=true` from URL query params
  - Use `computed()` signal (or `signal()` set once at constructor)
- [ ] **1.2**: Service is `providedIn: 'root'` (singleton)
- [ ] **1.3**: Add unit tests `embed-mode.service.spec.ts`:
  - 6+ tests covering:
    - Standalone (window.self === window.top, no query param) → false
    - Iframe (window.self !== window.top) → true
    - Query param `?embed=true` → true (even in standalone)
    - Query param `?embed=false` → false (explicit opt-out)
    - Query param `?embed=1` → false (must be exactly "true")
    - SSR-safe (no `window` access when document not available)

### Task 2: Update `App` component to use the service

- [ ] **2.1**: Modify `apps/admin/src/app/app.ts`:
  - Inject `EmbedModeService`
  - Expose `isEmbedMode` as a public signal on the component
- [ ] **2.2**: Modify `apps/admin/src/app/app.html`:
  - Wrap `<guiders-sidebar>` in `@if (!isEmbedMode())` (Angular 17+ control flow)
  - Add CSS class to `<div class="admin-main">` for full-width in embed mode

### Task 3: Global CSS rule for page headers in embed mode

- [ ] **3.1**: Modify `apps/admin/src/app/app.scss`:
  - Add `.embed-mode .page-header { display: none; }` (global rule)
  - Adjust `.admin-main` to use full width when embed mode
- [ ] **3.2**: Modify `App` component to add `.embed-mode` class to root container when `isEmbedMode === true`

### Task 4: Wire APP_INITIALIZER for EmbedBootstrapService

- [ ] **4.1**: Modify `apps/admin/src/app/app.config.ts`:
  - Add `APP_INITIALIZER` provider that calls `embedBootstrapService.bootstrap()` once at startup
  - This ensures the `guiders:v1:ready` message is sent before the parent might send `leadcars:v1:auth`
- [ ] **4.2**: Verify that `isEmbedMode` is detected BEFORE the bootstrap (so the bootstrap only runs in iframe mode)

### Task 5: Tests for App component embed mode

- [ ] **5.1**: Update `apps/admin/src/app/app.spec.ts` to test:
  - Sidebar visible when `isEmbedMode === false`
  - Sidebar hidden when `isEmbedMode === true`
  - `.embed-mode` class applied when in embed mode
- [ ] **5.2**: Mock `EmbedModeService` with `vi.spyOn()` to control behavior per test

### Task 6: README + documentation

- [ ] **6.1**: Update `libs/admin/features/embed/README.md` with:
  - Embed mode detection logic
  - Manual test instructions (run `npm run start` and open in iframe)
- [ ] **6.2**: Update `AGENTS.md` (frontend) with embed mode section

### Task 7: Code review (mandatory, 2+ layers per TA-3 + AI-2 spec citation)

- [ ] **7.1**: PASS 1 (architecture/code quality):
  - Focus: SSR-safety (no `window` access at import time)
  - Focus: signal/computed usage (Angular 17+ best practices)
  - Focus: CSS-only hiding (no DOM manipulation)
- [ ] **7.2**: PASS 2 (edge case hunter):
  - Focus: iframe inside iframe (window.self === window.top !== window.parent)
  - Focus: query param case sensitivity
  - Focus: race condition between init and parent postMessage
- [ ] **7.3**: PASS 3 (acceptance auditor) with **AI-2 spec citation**:
  - Every AC (AC1-AC4) MUST cite the literal text from `epics.md` Story 3.2
  - Verify spec text matches implementation behavior
  - Note the discrepancies (localStorage, top bar, footer) and confirm they're handled

## Dev Notes

### Cross-repo implementation

This story is implemented in **`../guiders-frontend`** (Angular repo), NOT in this backend repo.

```
guiders-backend/                    ← THIS REPO (specs only)
  _bmad-output/implementation-artifacts/3-2-...md  ← You are here

guiders-frontend/                   ← WHERE THE CODE GOES
  libs/admin/features/embed/src/lib/
    embed-mode.service.ts            ← NEW
    embed-mode.service.spec.ts       ← NEW
  apps/admin/src/app/
    app.ts                           ← MODIFIED (inject EmbedModeService)
    app.html                         ← MODIFIED (@if !isEmbedMode())
    app.scss                         ← MODIFIED (.embed-mode rules)
    app.config.ts                    ← MODIFIED (APP_INITIALIZER)
    app.spec.ts                      ← MODIFIED (test embed mode)
```

### Discrepancies with `epics.md` (resolved)

| epics.md says | Reality | Resolution |
|---------------|---------|-----------|
| Persist `isEmbedMode` to `localStorage` | Cross-origin iframe can't write to parent's localStorage | **Skip localStorage**. Recompute on each load. |
| Hide "top bar with Guiders logo" | No global top bar; logo is inside sidebar | **Hide entire sidebar** (logo disappears too) |
| Hide "footer" | No global footer | **N/A** (nothing to hide) |
| `/embed/*` route structure | No separate routes; embed mode is global | **All routes work in embed mode**, just without chrome |
| `<header class="page-header">` | Exists in each feature | **Global CSS rule hides them all** when `.embed-mode` class is present |

### Project Structure Notes

- **New file**: `libs/admin/features/embed/src/lib/embed-mode.service.ts`
- **New file**: `libs/admin/features/embed/src/lib/embed-mode.service.spec.ts`
- **Modified files**:
  - `libs/admin/features/embed/src/index.ts` (export `EmbedModeService`)
  - `apps/admin/src/app/app.ts` (inject service, expose `isEmbedMode` signal)
  - `apps/admin/src/app/app.html` (`@if (!isEmbedMode())` around sidebar)
  - `apps/admin/src/app/app.scss` (`.embed-mode` rules)
  - `apps/admin/src/app/app.config.ts` (APP_INITIALIZER for EmbedBootstrapService from Story 3.1)
  - `apps/admin/src/app/app.spec.ts` (test embed mode)

### Architecture Compliance

- **Standalone components**: Use `inject()` not constructor injection
- **Signals**: Use Angular signals for reactive state (already the pattern in `app.ts`)
- **SSR-safety**: Use `inject(DOCUMENT)` to access window, not `window` directly
- **No DOM manipulation**: Use CSS rules for hiding, not `display: none` via TS

### Library/Framework Requirements

- **Angular 17+**: `@if`, `@for` control flow (not `*ngIf`, `*ngFor`)
- **No new dependencies**
- **Vitest** for testing (already configured)

### Testing Requirements (AI-3)

- **Specific assertions**: `expect.objectContaining({...})`, exact string match
- **Mock window**: Use `vi.stubGlobal('window', { ... })` or `Object.defineProperty(window, ...)`
- **No `toBeTruthy()` alone**

### Security Considerations

- **No localStorage writes** from cross-origin iframe (security + privacy)
- **URL query param** as opt-in for testing (not for production detection)
- **window.self !== window.top** is the only reliable production detection

### References

- Spec source: `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.2)
- Backend spec (related): `_bmad-output/implementation-artifacts/3-1-implement-embedbootstrapservice-with-versioned-postmessage-protocol.md`
- Story 3.1 implementation: `../guiders-frontend/libs/admin/features/embed/src/lib/embed-bootstrap.service.ts`
- Existing patterns: `../guiders-frontend/apps/admin/src/app/app.ts`

### Open Questions

1. **Q1**: Should the embed mode be toggleable via UI (e.g., a "switch to standalone" button)?
   - **Recommendation**: NO for MVP — if iframe parent wants to switch, it should reload the iframe without `?embed=true` or change the URL
2. **Q2**: How does the embed mode interact with auth (Story 2.1 BFF session)?
   - **Recommendation**: No special handling — the BFF session cookie is set by the iframe's response from `POST /embed/authenticate-session`. The browser sends it on subsequent requests automatically (same-origin from Guiders' perspective).
3. **Q3**: Should we have a `/embed` URL prefix for routes?
   - **Recommendation**: NO for MVP — embed mode is detected via signal, not URL. Adding `/embed` prefix would require route duplication.

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

- [x] Story spec is complete (6 ACs, 7 tasks, dev notes, security considerations)
- [x] All ACs cite literal spec text from `epics.md` (AI-2 ready)
- [x] Discrepancies with epics.md documented (localStorage, top bar, footer)
- [x] AI safeguards documented (AI-1.5, AI-2, AI-3)
- [x] Cross-repo implementation clarified
- [x] Test patterns identified (Vitest + Angular 17+ control flow)
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml
- [ ] Tech debt items updated (if any new items)

**Next step**: Run `bmad-dev-story` workflow with cross-repo context.