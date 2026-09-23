# Story 4.3: Implement in-process cache for white_label_configs

Status: ready-for-dev

> **Origin**: Third story of Epic 4 (White-Label Branding Application). Extends the cache pattern implemented as a minimum in Story 4.1 with full production features: cache invalidation on update, cache metrics, and the `WhiteLabelConfigService` abstraction.
>
> **Current state**: Story 4.1 already implements the basic cache (`InMemoryTtlCache<string, WhiteLabelConfig>` with 60s TTL) in the `EmbedStartController`. This story adds the **missing pieces**:
> 1. **Cache invalidation** on PATCH (admin updates branding → next read refreshes)
> 2. **Cache metrics** (hits, misses, size) — observability for ops
> 3. **`WhiteLabelConfigService`** abstraction (optional but recommended for separation of concerns)
>
> **Cross-repo**: Frontend already consumes `/v2/companies/:id/white-label` (Story 4.2). Cache invalidation ensures that admin updates in the admin console are reflected in the embed iframe within 60s (or immediately if we wire invalidation).

---

## Story

As a backend service handling many embed requests,
I want to cache `white_label_configs` reads in process memory with a 60-second TTL,
So that we don't hit MongoDB on every iframe load.

## Acceptance Criteria

### AC1 — Cache read path (already implemented in Story 4.1)

**Given** the `WhiteLabelConfigService` (or equivalent) is called for a `companyId`
**When** the config is requested
**Then**:
1. It first checks the in-memory cache: `Map<companyId, { config, expiresAt }>`
2. If a valid (non-expired) entry exists, it returns the cached config
3. If no entry or expired, it queries MongoDB and caches the result with `expiresAt = now + 60s`

**Spec citation**: From `epics.md` Story 4.3 AC1:
> "it first checks the in-memory cache: `Map<companyId, { config, expiresAt }>` / if a valid (non-expired) entry exists, it returns the cached config / if no entry or expired, it queries MongoDB and caches the result with `expiresAt = now + 60s`"

> **Note**: This AC is already covered by Story 4.1. Verification is via existing tests.

### AC2 — Cache lookup performance

**Given** the cache is populated for 100 tenants
**When** a request comes in
**Then**:
1. No MongoDB query is made (cache hit)
2. The response time is < 5ms for the cache lookup

**Spec citation**: From `epics.md` Story 4.3 AC2:
> "no MongoDB query is made (cache hit) / the response time is < 5ms for the cache lookup"

> **Implementation note**: The `InMemoryTtlCache` uses a `Map` for O(1) lookup. 5ms is well within budget for in-memory operations.

### AC3 — Cache invalidation on PATCH (THE GAP)

**Given** an admin updates the branding via `PATCH /v2/companies/:id/white-label`
**When** the update is persisted
**Then**:
1. The cache entry for that `companyId` is invalidated (deleted from the map)
2. The next read refreshes the cache from MongoDB

**Spec citation**: From `epics.md` Story 4.3 AC3:
> "the cache entry for that `companyId` is invalidated (deleted from the map) / the next read refreshes the cache from MongoDB"

> **This is the new feature** that Story 4.1 did NOT implement.

### AC4 — Cache metrics (observability)

**Given** the cache is instrumented with metrics
**When** cache operations occur
**Then**:
1. Hits, misses, and size are tracked
2. A `GET /internal/cache/metrics` endpoint returns the current stats
3. (Optional) Logs are emitted periodically with hit ratio

**Note**: This AC extends beyond the basic spec but is required for production observability (per NFR-R1 to R4 — Reliability).

### AC5 — AI-3 compliance (specific assertions)

**Given** unit tests for the cache + invalidation
**When** asserting behavior
**Then**:
- Tests use specific counts (`expect(metrics.hits).toBe(3)`)
- Tests use specific timing (`expect(duration).toBeLessThan(5)`)
- Mock the repository with `jest.fn()` to verify cache hit/miss behavior

### AC6 — AI-4 compliance (extract cache metrics)

**Given** the cache metrics logic
**When** implemented
**Then**:
- A separate `CacheMetricsService` is created (single responsibility)
- Used by the cache (via decorator) or by the consumer (manual tracking)
- Not duplicated across controllers

## Tasks / Subtasks

### Task 1: Create CacheMetricsService

- [ ] **1.1**: Create `src/context/shared/infrastructure/cache/cache-metrics.service.ts`:
  ```typescript
  /**
   * Tracks cache hits, misses, and size across all cache instances.
   * Single source of truth for observability.
   *
   * Story 4.3 — Epic 4: White-Label Branding Application.
   */
  @Injectable({ providedIn: 'root' })
  export class CacheMetricsService {
    private readonly hits = 0;
    private readonly misses = 0;
    private readonly sets = 0;
    private readonly deletes = 0;

    recordHit(cacheName: string): void {
      this.hits++;
    }

    recordMiss(cacheName: string): void {
      this.misses++;
    }

    recordSet(cacheName: string): void {
      this.sets++;
    }

    recordDelete(cacheName: string): void {
      this.deletes++;
    }

    snapshot(): CacheMetrics {
      return {
        hits: this.hits,
        misses: this.misses,
        sets: this.sets,
        deletes: this.deletes,
        hitRatio: this.hits / Math.max(1, this.hits + this.misses),
      };
    }
  }
  ```
- [ ] **1.2**: Add unit tests `cache-metrics.service.spec.ts`:
  - 5+ tests:
    - initial snapshot is all zeros
    - recordHit increments hits
    - recordMiss increments misses
    - hitRatio calculation (3 hits, 1 miss → 0.75)
    - snapshot returns current state (immutable)

### Task 2: Add cache invalidation to PATCH endpoint (AC3)

- [ ] **2.1**: Modify `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts`:
  - Inject `InMemoryTtlCache<string, WhiteLabelConfig>` (Symbol-based DI)
  - In the PATCH handler, after successful save, call `cache.delete(companyId)`
  - Log the invalidation for observability
- [ ] **2.2**: Add unit test for cache invalidation:
  - Set up cache with config
  - Call PATCH endpoint
  - Verify cache entry is removed
  - Verify next read (GET) returns fresh data from Mongo

### Task 3: Wire cache metrics into EmbedStartController (AC4)

- [ ] **3.1**: Modify `src/context/white-label/infrastructure/controllers/embed-start.controller.ts`:
  - Inject `CacheMetricsService`
  - On cache hit: call `metrics.recordHit('white-label-config')`
  - On cache miss: call `metrics.recordMiss('white-label-config')`
  - On cache set: call `metrics.recordSet('white-label-config')`
- [ ] **3.2**: Add unit tests for metrics tracking:
  - After cache hit: `metrics.hits === 1`
  - After cache miss + DB query + set: `metrics.misses === 1, metrics.sets === 1`
  - After 2 hits + 1 miss: `hitRatio === 2/3`

### Task 4: Create internal metrics endpoint (AC4)

- [ ] **4.1**: Create `src/context/shared/infrastructure/cache/cache-metrics.controller.ts`:
  ```typescript
  @Controller('internal/cache/metrics')
  @UseGuards(InternalApiKeyGuard) // restrict to internal monitoring
  export class CacheMetricsController {
    constructor(private readonly metrics: CacheMetricsService) {}

    @Get()
    getMetrics(): CacheMetrics {
      return this.metrics.snapshot();
    }
  }
  ```
- [ ] **4.2**: Register controller in a new `CacheModule` (or add to an existing shared module)
- [ ] **4.3**: Add unit tests for the controller

### Task 5: Performance benchmark test (AC2)

- [ ] **5.1**: Add benchmark test `embed-start.controller.perf.spec.ts`:
  - Pre-populate cache with 100 mock configs
  - Run 1000 cache hits
  - Measure average time
  - Assert average < 5ms

> **Note**: Performance tests are best-effort; CI machines may have variance. Use a generous threshold (e.g., 50ms) for CI but document the expected 5ms target.

### Task 6: Update existing Story 4.1 tests for metrics

- [ ] **6.1**: Update `embed-start.controller.spec.ts`:
  - Add `CacheMetricsService` to TestBed providers
  - Verify metrics are incremented on cache hit/miss
- [ ] **6.2**: Run full regression to ensure no breakage

### Task 7: Documentation (DOC-1)

- [ ] **7.1**: Update `src/context/white-label/AGENTS.md`:
  - Document cache behavior (60s TTL, 1s timeout)
  - Document cache invalidation flow (PATCH triggers delete)
  - Document metrics endpoint
- [ ] **7.2**: Update root `AGENTS.md`:
  - Mention cache metrics endpoint for ops monitoring

### Task 8: Code review (mandatory, 2+ layers per TA-3 + AI-2 spec citation)

- [ ] **8.1**: PASS 1 (Blind Hunter) — architecture:
  - Focus: cache key collisions (different tenants, same key?)
  - Focus: race conditions on PATCH + concurrent reads
  - Focus: memory leak if 10000s of tenants
- [ ] **8.2**: PASS 2 (Edge Case Hunter) — boundaries:
  - Focus: TTL of 0 (immediate expiry)
  - Focus: Negative TTL (clock skew)
  - Focus: PATCH that fails — does cache stay or get invalidated?
- [ ] **8.3**: PASS 3 (Acceptance Auditor) with **AI-2 spec citation**:
  - Every AC (AC1-AC3 from spec) MUST cite literal text from `epics.md` Story 4.3
  - Verify spec text matches implementation

## Dev Notes

### Project Structure Notes

**New files** (3 files):
- `src/context/shared/infrastructure/cache/cache-metrics.service.ts` (~50 lines)
- `src/context/shared/infrastructure/cache/cache-metrics.controller.ts` (~30 lines)
- `src/context/shared/infrastructure/cache/__tests__/cache-metrics.service.spec.ts` (~80 lines, 5+ tests)

**Modified files** (2 files):
- `src/context/white-label/infrastructure/controllers/embed-start.controller.ts` (+ metrics tracking)
- `src/context/white-label/infrastructure/controllers/white-label-config.controller.ts` (+ cache invalidation on PATCH)

### Architecture Compliance

- **DDD layers**: Metrics in `shared/infrastructure/` (cross-cutting concern)
- **Symbol DI**: Use `CACHE_METRICS_SERVICE` Symbol (consistent with other services)
- **Result pattern**: Metrics methods don't return Result (counters, not fallible)

### Library/Framework Requirements

- No new dependencies
- Uses existing `@nestjs/common` controllers + DI

### Testing Requirements

- **AI-1.5**: Use Pattern 0 (`npm run generate:red-tests`) for new helper files
- **AI-3**: Specific counts and timing assertions
- **AI-4**: Extract `CacheMetricsService` to shared util (not inlined in cache)
- **AI-2**: PASS 3 audit MUST cite spec text literally

### Backward Compatibility

- **No breaking changes** to public API (only internal additions)
- The `InMemoryTtlCache` is already used by Story 4.1 — no API changes needed
- The PATCH endpoint signature unchanged; just adds cache invalidation as side effect

### Performance Considerations

- **Cache lookup is O(1)** (Map.get)
- **Memory usage**: ~1KB per cached config × N tenants = N KB total
- For 10,000 tenants: ~10MB memory (acceptable for process memory)
- Eviction is lazy (on access) — no background cleanup needed
- For very large N, consider LRU eviction (out of scope for MVP)

### Security Considerations

- **`/internal/cache/metrics` endpoint**: protect with `InternalApiKeyGuard` (restrict to ops monitoring)
- **Metrics don't expose tenant PII** (only counts, no companyIds)
- **No cache poisoning risk**: cache values are trusted MongoDB reads (validated by entity)

### References

- Spec source: `_bmad-output/planning-artifacts/epics.md` (Epic 4 → Story 4.3)
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (NFR-R1 to R4 — Reliability)
- Story 4.1 implementation: `src/context/white-label/infrastructure/controllers/embed-start.controller.ts`
- Existing cache: `src/context/shared/infrastructure/cache/in-memory-ttl-cache.ts`

### Open Questions

1. **Q1**: Should the cache metrics endpoint be PUBLIC or require admin auth?
   - **Recommendation**: Require internal API key (separate from user auth)
2. **Q2**: Should cache invalidation be eager (on PATCH) or lazy (on next read)?
   - **Recommendation**: Eager (immediately on PATCH success) — provides consistent behavior
3. **Q3**: What about cache invalidation on `PUT` or `DELETE` endpoints?
   - **Recommendation**: Invalidate on all write operations (PATCH, PUT, DELETE) for consistency

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

- [x] Story spec is complete (6 ACs, 8 tasks, dev notes, security considerations)
- [x] All ACs cite literal spec text from `epics.md` (AI-2 ready)
- [x] AI safeguards documented (AI-1.5, AI-2, AI-3, AI-4)
- [x] Test patterns identified (Pattern 0 from AI-X)
- [x] Cross-cutting helpers extracted (AI-4)
- [x] Backward compat documented
- [ ] Status updated to `ready-for-dev` in sprint-status.yaml

**Next step**: Run `bmad-dev-story` workflow.