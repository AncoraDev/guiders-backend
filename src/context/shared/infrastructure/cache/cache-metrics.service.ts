/**
 * Cache metrics service — tracks hits, misses, sets, and deletes across
 * all cache instances for observability.
 *
 * Story 4.3 — Epic 4: White-Label Branding Application.
 *
 * Single source of truth for cache observability. Exposed via
 * GET /internal/cache/metrics (see CacheMetricsController).
 *
 * AI-4 compliance: single-responsibility class. No coupling to any
 * specific cache implementation.
 */
import { Injectable } from '@nestjs/common';

export interface CacheMetricsSnapshot {
  /** Total cache hits (key found + not expired) */
  readonly hits: number;
  /** Total cache misses (key not found OR expired) */
  readonly misses: number;
  /** Total cache sets (key inserted) */
  readonly sets: number;
  /** Total cache deletes (key removed, either manual invalidation or expiry) */
  readonly deletes: number;
  /** Hit ratio (hits / total). Returns 0 if no operations yet. */
  readonly hitRatio: number;
}

@Injectable()
export class CacheMetricsService {
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private deletes = 0;

  /**
   * Records a cache hit (key found + not expired).
   */
  recordHit(_cacheName: string): void {
    this.hits++;
  }

  /**
   * Records a cache miss (key not found OR expired).
   */
  recordMiss(_cacheName: string): void {
    this.misses++;
  }

  /**
   * Records a cache set (key inserted).
   */
  recordSet(_cacheName: string): void {
    this.sets++;
  }

  /**
   * Records a cache delete (key removed, manual invalidation).
   * Note: TTL expiry is NOT a delete (handled in the cache itself).
   */
  recordDelete(_cacheName: string): void {
    this.deletes++;
  }

  /**
   * Returns an immutable snapshot of the current metrics.
   * Safe to expose via HTTP endpoint (no PII — only counts).
   */
  snapshot(): CacheMetricsSnapshot {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      deletes: this.deletes,
      hitRatio: total === 0 ? 0 : this.hits / total,
    };
  }
}
