# Story 3.3: Add CORS origins for embed clients in main.ts

Status: ready-for-dev

> **Origin**: Third story of Epic 3 (Cross-Frame Auth Handshake). Configures CORS middleware to allow cross-origin requests from embed clients (e.g., LeadCars iframe embedding Guiders admin).
>
> **Current state**: `src/main.ts` already implements CORS via `CORS_ALLOWED_ORIGINS` env var (line 163-235). This story **extends** the existing implementation with:
> 1. A new dedicated env var `EMBED_ALLOWED_DEFAULT_ORIGINS` (spec-mandated name)
> 2. Hardcoded defaults: `https://app.leadcars.com`, `https://www.leadcars.com`
> 3. Clear separation between **embed** origins (cross-origin iframes) and **admin** origins (same-origin)

---

## Story

As a backend configuration,
I want `main.ts` to allow CORS requests from the configured embed client origins,
So that the iframe can make cross-origin requests with credentials (cookies).

## Acceptance Criteria

### AC1 — EMBED_ALLOWED_DEFAULT_ORIGINS env var

**Given** the application starts
**When** CORS middleware is initialized
**Then**:
1. The `origin` array includes:
   - `https://app.leadcars.com` (hardcoded default)
   - `https://www.leadcars.com` (hardcoded default)
   - Any other origin in `EMBED_ALLOWED_DEFAULT_ORIGINS` env var (comma-separated)
2. The `credentials: true` option is set (so cookies can be sent)
3. The `allowedHeaders` includes: `Content-Type`, `Authorization`, `X-Api-Key`

**Spec citation**: From `epics.md` Story 3.3 AC1:
> "the `origin` array includes: `https://app.leadcars.com`, `https://www.leadcars.com`, Any other origin in `EMBED_ALLOWED_DEFAULT_ORIGINS` env var (comma-separated) / the `credentials: true` option is set / the `allowedHeaders` includes: `Content-Type`, `Authorization`, `X-Api-Key`"

### AC2 — Non-allowed origin is rejected

**Given** a request from a non-allowed origin (e.g., `https://attacker.com`)
**When** the CORS middleware checks it
**Then** the request is rejected with a CORS error

**Spec citation**: From `epics.md` Story 3.3 AC2:
> "the request is rejected with CORS error"

### AC3 — Backward compat with CORS_ALLOWED_ORIGINS

**Given** `CORS_ALLOWED_ORIGINS` env var is set (legacy)
**And** `EMBED_ALLOWED_DEFAULT_ORIGINS` is NOT set
**When** CORS middleware initializes
**Then**:
- Origins from `CORS_ALLOWED_ORIGINS` are still allowed (backward compat)
- No regression in existing behavior

**Note**: This is added for backward compat — the spec mentions `EMBED_ALLOWED_DEFAULT_ORIGINS` but we don't want to break existing deployments.

### AC4 — AI-4 compliance (extract helper)

**Given** the CORS configuration logic
**When** implemented
**Then**:
- The origin-parsing logic is extracted to a helper function (`parseAllowedOrigins`)
- The helper is **reused** between `CORS_ALLOWED_ORIGINS` and `EMBED_ALLOWED_DEFAULT_ORIGINS` (no duplication)
- The default origins (`app.leadcars.com`, `www.leadcars.com`) are defined as a constant

### AC5 — AI-3 compliance (specific assertions)

**Given** unit tests for the CORS configuration
**When** asserting behavior
**Then**:
- Tests use `expect.arrayContaining([...])` for origin list assertions (NEVER `toBeTruthy()` alone)
- Tests verify each origin individually (no string comparison of full array)

## Tasks / Subtasks

### Task 1: Extract origin parsing to helper

- [ ] **1.1**: Create `src/context/shared/utils/cors-origins.util.ts`:
  ```typescript
  /**
   * Parses a comma-separated env var into a list of trimmed, non-empty origins.
   * Returns empty array if input is not a string or all values are empty.
   */
  export function parseAllowedOrigins(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Default origins that can embed the Guiders admin iframe.
   * These are hardcoded because LeadCars is our reference customer.
   * For other B2B integrators, add their origins via EMBED_ALLOWED_DEFAULT_ORIGINS.
   */
  export const DEFAULT_EMBED_ORIGINS: ReadonlyArray<string> = [
    'https://app.leadcars.com',
    'https://www.leadcars.com',
  ];
  ```
- [ ] **1.2**: Add unit tests `__tests__/cors-origins.util.spec.ts`:
  - 5+ tests:
    - Empty string → `[]`
    - Single origin `'https://a.com'` → `['https://a.com']`
    - Comma-separated `'a,b,c'` → 3 items
    - Whitespace `' a , b , '` → trimmed, empty filtered
    - Non-string input → `[]`

### Task 2: Update `main.ts` to use new helper

- [ ] **2.1**: Import `parseAllowedOrigins` and `DEFAULT_EMBED_ORIGINS` from new util
- [ ] **2.2**: Replace inline `parseAllowedOrigins` function (lines 167-176) with import
- [ ] **2.3**: Compute final allowed origins:
  ```typescript
  const embedOrigins = parseAllowedOrigins(process.env.EMBED_ALLOWED_DEFAULT_ORIGINS);
  const legacyOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const allowedOrigins = Array.from(
    new Set([...DEFAULT_EMBED_ORIGINS, ...embedOrigins, ...legacyOrigins])
  );
  ```
- [ ] **2.4**: Update CORS middleware to use `allowedOrigins` array
- [ ] **2.5**: Add log statement showing the final allowed origins (for ops visibility):
  ```typescript
  console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
  ```

### Task 3: Verify allowedHeaders includes spec requirements

- [ ] **3.1**: Verify `corsAllowedHeaders` constant includes:
  - `Content-Type` ✅ (already)
  - `Authorization` ✅ (already)
  - `X-Api-Key` (verify case matches; spec says `X-Api-Key` but current code has `X-API-Key`)
- [ ] **3.2**: Normalize to spec: use `X-Api-Key` (lowercase 'pi') for HTTP convention
- [ ] **3.3**: Verify `credentials: true` is set ✅ (already)

### Task 4: Update existing tests

- [ ] **4.1**: Search for existing CORS tests:
  ```bash
  grep -rn "enableCors\|CORS" src/ --include="*.spec.ts" --include="*.int-spec.ts" 2>&1
  ```
- [ ] **4.2**: Update any tests that depend on the old origin list
- [ ] **4.3**: Add new tests for `parseAllowedOrigins` (Task 1.2)

### Task 5: E2E CORS test (optional, separate scope)

- [ ] **5.1**: Add `test/cors-embed.e2e-spec.ts`:
  - Request from `https://app.leadcars.com` → CORS headers present, request succeeds
  - Request from `https://attacker.com` → CORS error
  - Request with `credentials: include` from allowed origin → cookies accepted

> **Scope decision**: E2E test is OUT OF SCOPE for this story if it requires complex setup. Unit tests on the helper are sufficient.

### Task 6: Documentation

- [ ] **6.1**: Update `AGENTS.md` (root, backend) with CORS configuration section:
  - Default origins
  - Env var priority (`EMBED_ALLOWED_DEFAULT_ORIGINS` > `CORS_ALLOWED_ORIGINS` > defaults)
  - How to add a new B2B integrator
- [ ] **6.2**: Add comment in `main.ts` explaining the env var precedence

### Task 7: Code review (mandatory, 2+ layers per TA-3 + AI-2 spec citation)

- [ ] **7.1**: PASS 1 (architecture/code quality):
  - Focus: no duplication between `CORS_ALLOWED_ORIGINS` and `EMBED_ALLOWED_DEFAULT_ORIGINS` (DRY)
  - Focus: helper extracted to shared utils (not inline in main.ts)
  - Focus: clear precedence order documented
- [ ] **7.2**: PASS 2 (edge case hunter):
  - Focus: empty env var → no crash
  - Focus: malformed comma-separated string (`a,,b,` → handles empty)
  - Focus: case sensitivity in origin matching (`https://LeadCars.com` vs `https://leadcars.com`)
  - Focus: trailing slash in origin (`https://app.leadcars.com/` vs `https://app.leadcars.com`)
- [ ] **7.3**: PASS 3 (acceptance auditor) with **AI-2 spec citation**:
  - Every AC (AC1-AC2) MUST cite the literal text from `epics.md` Story 3.3
  - Verify spec text matches implementation behavior

## Dev Notes

### Project Structure Notes

- **New file**: `src/context/shared/utils/cors-origins.util.ts` (~30 lines)
- **New file**: `src/context/shared/utils/__tests__/cors-origins.util.spec.ts` (~60 lines, 5+ tests)
- **Modified file**: `src/main.ts` (replace inline function with import, add new env var)

### Architecture Compliance

- **DDD layers**: Util is in `shared/utils/` (cross-cutting concern, infrastructure)
- **Symbol DI**: N/A (pure function, no DI needed)
- **Result pattern**: N/A (returns array, not Result)

### Library/Framework Requirements

- No new dependencies
- Uses existing `@nestjs/common` CORS support

### Testing Requirements

- **AI-1.5**: Use Pattern 0 (`npm run generate:red-tests`) — but this is a simple helper, can write manually
- **AI-3**: Use `expect.arrayContaining([...])` for list assertions
- **AI-2**: PASS 3 audit MUST cite spec text literally

### Backward Compatibility

| Existing | New | Action |
|----------|-----|--------|
| `CORS_ALLOWED_ORIGINS` env var | `EMBED_ALLOWED_DEFAULT_ORIGINS` env var | Both supported, merged |
| Default origins hardcoded | `DEFAULT_EMBED_ORIGINS` constant | Same behavior + spec defaults |
| `parseAllowedOrigins` inline function | Same function extracted to util | Refactor, no behavior change |

### Security Considerations

- **Strict origin matching**: case-sensitive (per `EmbedAllowedOriginsService` pattern from frontend Story 3.1)
- **No wildcards**: each origin is exact match
- **Credentials only with explicit origins**: `credentials: true` is set BUT origins are validated (not `origin: true` which would be insecure)

### References

- Spec source: `_bmad-output/planning-artifacts/epics.md` (Epic 3 → Story 3.3)
- Current CORS implementation: `src/main.ts:160-235`
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (FR-NFR-S7 — cross-origin security)
- Frontend spec (related): `_bmad-output/implementation-artifacts/3-1-...md` (origin validation in JS)

### Open Questions

1. **Q1**: Should `https://localhost:4201` (frontend dev) be in defaults?
   - **Recommendation**: NO — production defaults only. Dev origins go in `.env` via `EMBED_ALLOWED_DEFAULT_ORIGINS`.
2. **Q2**: Should we strip trailing slashes from origins?
   - **Recommendation**: NO — origin comparison is exact. Documents say to use `https://app.leadcars.com` (no slash). Browsers send `Origin` header without trailing slash.
3. **Q3**: Should CORS log every rejected origin?
   - **Recommendation**: YES if `CORS_DEBUG=true`, NO otherwise (avoid log spam from attackers)

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

- [x] Story spec is complete (5 ACs, 7 tasks, dev notes, security considerations)
- [x] All ACs cite literal spec text from `epics.md` (AI-2 ready)
- [x] Backward compat documented (CORS_ALLOWED_ORIGINS still supported)
- [x] AI safeguards documented (AI-1.5, AI-2, AI-3, AI-4)
- [x] Test patterns identified (Pattern 0 from AI-X)
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: Run `bmad-dev-story` workflow.