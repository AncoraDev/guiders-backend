# Story 4.1: Implement GET /embed/start HTML wrapper with inline branding CSS

Status: ready-for-dev

> **Origin**: First story of Epic 4 (White-Label Branding Application). Implements the public HTML wrapper that LeadCars iframes load — applies tenant branding as inline CSS BEFORE Angular boots, eliminating the "flash of unbranded content" (FOUC).
>
> **Backend scope**: New PUBLIC endpoint (no auth required) at `GET /embed/start?company={companyId}`. Returns an HTML string with inline `<style>` and security headers.
>
> **Frontend consumption**: Story 4.2 (BrandingService) will call this endpoint + apply additional runtime branding. Story 4.3 implements the in-memory cache.

---

## Story

As a LeadCars frontend when mounting the iframe,
I want `GET /embed/start?company=<id>` to return an HTML page with the tenant's branding applied as inline CSS in the `<head>`,
So that the user never sees the unbranded Guiders interface.

## Acceptance Criteria

### AC1 — Endpoint returns HTML with inline branding

**Given** a request to `GET /embed/start?company=leadcars-uuid`
**When** the controller handles the request
**Then**:
1. It reads `white_label_configs` for the `companyId` (with cache, TTL 60s — Story 4.3 dependency)
2. It generates an HTML page with:
   - `<!DOCTYPE html>`
   - `<html lang="es">`
   - `<head>` with `<title>Guiders Admin - {brandName}</title>`
   - `<style>:root { --gds-color-primary: {primary}; --gds-color-secondary: {secondary}; ... --gds-logo-url: url('{logoUrl}'); }</style>` (inlined, **before scripts**)
   - `<script src="...">` (Angular bundles, same as admin standalone)
   - `<body>` with `<admin-root></admin-root>`

**Spec citation**: From `epics.md` Story 4.1 AC1:
> "it generates an HTML page with: `<!DOCTYPE html>`, `<html lang="es">`, `<head>` with `<title>Guiders Admin - {brandName}</title>`, `<style>:root { --gds-color-primary: {primary}; ... }</style>` (inlined, before scripts), `<script src="...">`, `<body>` with `<admin-root></admin-root>`"

### AC2 — Security headers

**Given** a request to `GET /embed/start`
**When** the controller sends the response
**Then** these headers are set:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy: frame-ancestors {comma-separated embedAllowedOrigins}`

**Spec citation**: From `epics.md` Story 4.1 AC2:
> "security headers are set: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`"
> "`Content-Security-Policy` includes `frame-ancestors {comma-separated embedAllowedOrigins}`"

### AC3 — Fallback to default branding on MongoDB timeout

**Given** MongoDB is slow or unavailable (> 1s)
**When** the controller tries to read `white_label_configs`
**Then** it falls back to default Guiders branding (blue palette) after 1s timeout
**And** the response is still served (not delayed)

**Spec citation**: From `epics.md` Story 4.1 AC3:
> "it falls back to default Guiders branding (blue palette) after 1s timeout / the response is still served (not delayed)"

### AC4 — 403 when embedEnabled=false or companyId not found

**Given** the companyId in the query doesn't exist OR has `embedEnabled=false`
**When** the controller handles the request
**Then** it returns 403 with explanation

**Spec citation**: From `epics.md` Story 4.1 AC4:
> "it returns 403 with explanation"

### AC5 — AI-3 compliance (specific assertions)

**Given** unit tests for the embed-start controller
**When** asserting behavior
**Then**:
- Tests use specific HTML string assertions (`expect(html).toContain('<title>Guiders Admin - TestBrand</title>')`)
- Tests use `expect.objectContaining({ ... })` for header assertions
- Tests verify the timeout behavior explicitly (fake timer + jest.advanceTimersByTime)

### AC6 — AI-4 compliance (extract branding-to-CSS helper)

**Given** the branding-to-CSS conversion logic
**When** implemented
**Then**:
- The CSS string generation is extracted to a helper function `brandingToCssVariables(config)`
- The helper is **reused** by Story 4.2 (BrandingService) — same CSS variables in inline + runtime
- The HTML template generation is extracted to `embedStartHtml(config)` helper

## Tasks / Subtasks

### Task 1: Create branding-to-CSS helper (AI-4)

- [ ] **1.1**: Create `src/context/white-label/infrastructure/utils/branding-to-css.util.ts`:
  ```typescript
  /**
   * Converts WhiteLabelConfig primitives to CSS custom properties.
   * Used by:
   * - GET /embed/start (Story 4.1) — inline in <style>
   * - BrandingService (Story 4.2) — runtime document.documentElement.style.setProperty
   *
   * Spec: epics.md Story 4.1 AC1
   */
  export function brandingToCssVariables(
    primitives: WhiteLabelConfigPrimitives,
  ): string {
    return `:root {
      --gds-color-primary: ${primitives.colors.primary};
      --gds-color-secondary: ${primitives.colors.secondary};
      --gds-color-tertiary: ${primitives.colors.tertiary};
      --gds-color-background: ${primitives.colors.background};
      --gds-color-surface: ${primitives.colors.surface};
      --gds-color-text: ${primitives.colors.text};
      --gds-color-text-muted: ${primitives.colors.textMuted};
      --gds-font-family: ${primitives.typography.fontFamily};
      --gds-brand-name: '${primitives.branding.brandName}';
      --gds-logo-url: url('${primitives.branding.logoUrl ?? ''}');
      --gds-favicon-url: url('${primitives.branding.faviconUrl ?? ''}');
    }`;
  }
  ```
- [ ] **1.2**: Create `__tests__/branding-to-css.util.spec.ts`:
  - 5+ tests:
    - Includes all 7 color variables
    - Includes font-family
    - Includes brand name in quotes
    - Handles null logoUrl (empty string)
    - Handles null faviconUrl (empty string)

### Task 2: Create HTML template helper

- [ ] **2.1**: Create `src/context/white-label/infrastructure/utils/embed-start-html.util.ts`:
  ```typescript
  /**
   * Generates the full HTML page for /embed/start.
   * Includes inline CSS (branding) BEFORE scripts to prevent FOUC.
   *
   * Spec: epics.md Story 4.1 AC1
   */
  export function embedStartHtml(
    cssVariables: string,
    brandName: string,
    scriptUrls: ReadonlyArray<string>,
  ): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Guiders Admin - ${escapeHtml(brandName)}</title>
  <style>${cssVariables}</style>
  ${scriptUrls.map(url => `<script src="${escapeHtml(url)}" defer></script>`).join('\n  ')}
</head>
<body>
  <admin-root></admin-root>
</body>
</html>`;
  }
  ```
- [ ] **2.2**: Add unit tests for escape + script URL injection

### Task 3: Create in-memory cache (Story 4.3 dependency)

> **Note**: This task implements the cache needed for AC1 + AC3 (fallback). Story 4.3 will extend this with metrics, but Story 4.1 implements the minimum.

- [ ] **3.1**: Create `src/context/shared/infrastructure/cache/in-memory-ttl-cache.ts`:
  ```typescript
  /**
   * Generic in-memory cache with TTL.
   * Used by WhiteLabelConfigService for hot-path embed reads.
   *
   * Spec: epics.md Story 4.3 AC1 (TTL 60s)
   */
  export class InMemoryTtlCache<K, V> {
    private readonly entries = new Map<K, { value: V; expiresAt: number }>();

    constructor(
      private readonly ttlMs: number = 60_000,
      private readonly clock: () => number = Date.now,
    ) {}

    get(key: K): V | undefined {
      const entry = this.entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < this.clock()) {
        this.entries.delete(key);
        return undefined;
      }
      return entry.value;
    }

    set(key: K, value: V): void {
      this.entries.set(key, {
        value,
        expiresAt: this.clock() + this.ttlMs,
      });
    }

    delete(key: K): void {
      this.entries.delete(key);
    }

    clear(): void {
      this.entries.clear();
    }

    size(): number {
      return this.entries.size;
    }
  }
  ```
- [ ] **3.2**: Unit tests `in-memory-ttl-cache.spec.ts`:
  - 8+ tests:
    - set + get returns value
    - expired entry returns undefined and is removed
    - TTL is honored
    - delete removes entry
    - clear removes all
    - size reflects count
    - Concurrent set on same key overwrites
    - Clock injection for deterministic tests

### Task 4: Create EmbedStartController (PUBLIC, no auth)

- [ ] **4.1**: Create `src/context/white-label/infrastructure/controllers/embed-start.controller.ts`:
  ```typescript
  @Controller('embed')
  export class EmbedStartController {
    constructor(
      private readonly whiteLabelService: WhiteLabelConfigService,
      private readonly cache: InMemoryTtlCache<string, WhiteLabelConfig>,
    ) {}

    @Get('start')
    async start(@Query('company') companyId: string, @Res() res: Response) {
      // AC4: validate companyId param
      if (!companyId) {
        return res.status(400).json({ code: 'EMBED_COMPANY_REQUIRED', ... });
      }

      // AC1: read from cache or MongoDB with 1s timeout (AC3 fallback)
      const config = await this.loadConfigWithFallback(companyId);

      // AC4: validate embedEnabled
      if (!config?.embedEnabled) {
        return res.status(403).json({ code: 'EMBED_DISABLED_FOR_TENANT', ... });
      }

      // Generate HTML
      const css = brandingToCssVariables(config.toPrimitives());
      const html = embedStartHtml(css, config.branding.brandName, SCRIPT_URLS);

      // AC2: security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Content-Security-Policy',
        `frame-ancestors ${config.embedAllowedOrigins.join(' ')}`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      return res.send(html);
    }

    private async loadConfigWithFallback(companyId: string) {
      try {
        // Try cache first
        const cached = this.cache.get(companyId);
        if (cached) return cached;

        // MongoDB with 1s timeout
        const result = await Promise.race([
          this.whiteLabelService.findByCompanyId(companyId),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 1000)
          ),
        ]);
        if (result) {
          this.cache.set(companyId, result);
          return result;
        }
      } catch {
        // AC3: fallback to default
      }
      return DEFAULT_WHITE_LABEL_CONFIG;
    }
  }
  ```
- [ ] **4.2**: Register controller in `WhiteLabelModule` with PUBLIC access (no auth guard)

### Task 5: Tests for EmbedStartController

- [ ] **5.1**: Unit tests `embed-start.controller.spec.ts`:
  - 8+ tests:
    - AC1: Returns HTML with `<title>Guiders Admin - {brandName}</title>`
    - AC1: HTML contains CSS variables in `<style>` block
    - AC1: HTML contains `<admin-root>` element
    - AC1: HTML contains script src tags
    - AC2: Sets all 4 security headers
    - AC2: CSP `frame-ancestors` includes embedAllowedOrigins
    - AC3: Falls back to default on MongoDB timeout
    - AC4: Returns 403 when company not found
    - AC4: Returns 403 when embedEnabled=false
    - 400 when company query param missing

### Task 6: Documentation (DOC-1)

- [ ] **6.1**: Update `src/context/white-label/AGENTS.md` with:
  - GET /embed/start endpoint documentation
  - HTML template structure
  - Security headers explanation
  - Cache behavior
- [ ] **6.2**: Update root `AGENTS.md` with new PUBLIC endpoint list

### Task 7: Code review (mandatory, 3 layers per TA-3 + AI-2 spec citation)

- [ ] **7.1**: PASS 1 (Blind Hunter) — architecture/code quality:
  - Focus: PUBLIC endpoint security (CSRF, rate limiting)
  - Focus: HTML injection (XSS via brandName or logoUrl)
  - Focus: CSP header correctly escapes embedAllowedOrigins
- [ ] **7.2**: PASS 2 (Edge Case Hunter) — boundary conditions:
  - Focus: Cache TTL race condition (clock drift)
  - Focus: Timeout cleanup (no leaked timers)
  - Focus: Unicode in brandName (escape properly)
  - Focus: Empty embedAllowedOrigins (CSP invalid → fallback)
- [ ] **7.3**: PASS 3 (Acceptance Auditor) with **AI-2 spec citation**:
  - Every AC (AC1-AC4) MUST cite literal text from `epics.md` Story 4.1
  - Verify spec text matches implementation

## Dev Notes

### Project Structure Notes

**New files**:
- `src/context/white-label/infrastructure/utils/branding-to-css.util.ts` (~30 lines)
- `src/context/white-label/infrastructure/utils/embed-start-html.util.ts` (~50 lines)
- `src/context/shared/infrastructure/cache/in-memory-ttl-cache.ts` (~50 lines)
- `src/context/white-label/infrastructure/controllers/embed-start.controller.ts` (~100 lines)
- Plus 4 spec files (8 + 6 + 8 + 10 tests = ~32 tests)

**Modified files**:
- `src/context/white-label/white-label.module.ts` (+ register `EmbedStartController`, `InMemoryTtlCache`)
- `src/context/white-label/AGENTS.md` (+ docs)

### Architecture Compliance

- **DDD layers**: Controller in `infrastructure/controllers/`, util in `infrastructure/utils/`
- **CQRS**: N/A (read-only endpoint)
- **Symbol DI**: Use existing `WHITE_LABEL_CONFIG_REPOSITORY` symbol
- **Result pattern**: Service returns `Promise<Result<T, DomainError>>`; controller translates to HTTP
- **PUBLIC endpoint**: NO auth guard (per spec, this is the iframe entry point)

### Library/Framework Requirements

- No new dependencies
- Uses existing `@nestjs/common` (`@Get`, `@Query`, `@Res`)
- Express `Response` for setting headers + sending HTML

### Testing Requirements

- **AI-1.5**: Use Pattern 0 (`npm run generate:red-tests`) — works for new helper files
- **AI-3**: Specific assertions, NO `toBeTruthy()` alone
- **AI-4**: Extract helpers to `infrastructure/utils/` (DRY)
- **AI-2**: PASS 3 audit MUST cite spec text literally

### Security Considerations (CRITICAL)

⚠️ **XSS Prevention**:
- All user-controlled data (`brandName`, `logoUrl`, `faviconUrl`) MUST be HTML-escaped
- Use a proper escape function: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`
- Don't trust MongoDB data — validate as defense-in-depth

⚠️ **CSP header**:
- `frame-ancestors` must be a valid directive
- If `embedAllowedOrigins` is empty, use `'none'` (most restrictive)
- Spaces in URLs must be encoded

⚠️ **Rate limiting**:
- This endpoint is PUBLIC — could be abused
- Add rate limit middleware in a follow-up story (out of scope for MVP)

⚠️ **Cache security**:
- Cache key includes `companyId` only — no user-specific data
- Cache is process-local — doesn't leak across tenants

### References

- Spec source: `_bmad-output/planning-artifacts/epics.md` (Epic 4 → Story 4.1)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (NFR-P1 to P6, NFR-SC1 to SC4)
- Backend pattern (existing): `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts`
- Story 1.1 (already done): `embedEnabled` + `embedAllowedOrigins` fields in schema
- Story 3.3 (already done): `EMBED_ALLOWED_DEFAULT_ORIGINS` env var
- Story 4.2 (next): BrandingService in Angular for runtime branding
- Story 4.3 (next): In-memory cache extension with metrics

### Open Questions

1. **Q1**: Should the HTML be cached or generated per-request?
   - **Recommendation**: Generated per-request (HTML is ~1KB, generation is fast)
   - The CSS variables ARE cached (Story 4.3)
2. **Q2**: What happens if the brand name contains HTML chars (e.g., `<script>`)?
   - **Recommendation**: Use `escapeHtml()` utility — strict HTML escape
3. **Q3**: Should we serve `index.html` directly or generate inline?
   - **Recommendation**: Generate inline (allows per-tenant branding injection)
   - Static `index.html` would require cache-busting per-tenant

## Dev Agent Record

### Agent Model Used

TBD

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
- [x] AI safeguards documented (AI-1.5, AI-2, AI-3, AI-4)
- [x] Test patterns identified (Pattern 0 from AI-X)
- [x] Cross-cutting helpers extracted (AI-4)
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: Run `bmad-dev-story` workflow.