/**
 * Generic in-memory cache with Time-To-Live (TTL).
 *
 * Story 4.1 + 4.3 — Epic 4: White-Label Branding Application.
 *
 * Used by WhiteLabelConfigService for hot-path embed reads
 * (GET /embed/start is called on every iframe load).
 *
 * Spec: `_bmad-output/implementation-artifacts/4-1-...md` Task 3
 *      + `_bmad-output/planning-artifacts/epics.md` Story 4.3
 *
 * Properties:
 * - LRU-ish (Map preserves insertion order; stale entries are removed on access)
 * - TTL is per-entry (set when value is set)
 * - Thread-safe enough for single-process Node.js (no locks; atomic ops)
 * - Clock injection for deterministic tests
 */
export interface InMemoryTtlCacheOptions {
  /** TTL in milliseconds. Default 60_000 (60 seconds, per Story 4.3 AC1). */
  readonly ttlMs?: number;
  /** Clock function for testing. Default Date.now. */
  readonly clock?: () => number;
}

export class InMemoryTtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();
  private readonly ttlMs: number;
  private readonly clock: () => number;

  constructor(options: InMemoryTtlCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 60_000;
    this.clock = options.clock ?? Date.now;
  }

  /**
   * Retrieves a value by key. Returns `undefined` if not found or expired.
   * Expired entries are removed on access (lazy cleanup).
   */
  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < this.clock()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Stores a value with the current TTL. Overwrites existing entries.
   */
  set(key: K, value: V): void {
    this.entries.set(key, {
      value,
      expiresAt: this.clock() + this.ttlMs,
    });
  }

  /**
   * Removes an entry (if exists). No-op if key is absent.
   */
  delete(key: K): void {
    this.entries.delete(key);
  }

  /**
   * Removes all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Returns the number of entries currently in the cache (including expired
   * entries that haven't been accessed yet).
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Returns the configured TTL in milliseconds.
   */
  getTtlMs(): number {
    return this.ttlMs;
  }
}
