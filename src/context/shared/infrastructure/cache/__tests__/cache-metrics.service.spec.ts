/**
 * Tests para CacheMetricsService (Story 4.3).
 * AI-3 compliance: usa assertions específicas (specific counts).
 */
import { CacheMetricsService } from '../cache-metrics.service';

describe('CacheMetricsService', () => {
  let service: CacheMetricsService;

  beforeEach(() => {
    service = new CacheMetricsService();
  });

  describe('initial state', () => {
    it('debe iniciar con snapshot de ceros', () => {
      const snap = service.snapshot();
      expect(snap.hits).toBe(0);
      expect(snap.misses).toBe(0);
      expect(snap.sets).toBe(0);
      expect(snap.deletes).toBe(0);
      expect(snap.hitRatio).toBe(0);
    });
  });

  describe('recordHit', () => {
    it('debe incrementar hits counter', () => {
      service.recordHit('test-cache');
      expect(service.snapshot().hits).toBe(1);
    });

    it('debe acumular múltiples hits', () => {
      service.recordHit('test-cache');
      service.recordHit('test-cache');
      service.recordHit('test-cache');
      expect(service.snapshot().hits).toBe(3);
    });
  });

  describe('recordMiss', () => {
    it('debe incrementar misses counter', () => {
      service.recordMiss('test-cache');
      expect(service.snapshot().misses).toBe(1);
    });

    it('debe acumular múltiples misses', () => {
      service.recordMiss('test-cache');
      service.recordMiss('test-cache');
      expect(service.snapshot().misses).toBe(2);
    });
  });

  describe('recordSet', () => {
    it('debe incrementar sets counter', () => {
      service.recordSet('test-cache');
      expect(service.snapshot().sets).toBe(1);
    });
  });

  describe('recordDelete', () => {
    it('debe incrementar deletes counter', () => {
      service.recordDelete('test-cache');
      expect(service.snapshot().deletes).toBe(1);
    });
  });

  describe('hitRatio calculation', () => {
    it('debe calcular hitRatio = 1.0 cuando todos son hits', () => {
      service.recordHit('test-cache');
      service.recordHit('test-cache');
      service.recordHit('test-cache');
      expect(service.snapshot().hitRatio).toBe(1.0);
    });

    it('debe calcular hitRatio = 0 cuando todos son misses', () => {
      service.recordMiss('test-cache');
      service.recordMiss('test-cache');
      expect(service.snapshot().hitRatio).toBe(0);
    });

    it('debe calcular hitRatio = 0.75 con 3 hits + 1 miss', () => {
      service.recordHit('test-cache');
      service.recordHit('test-cache');
      service.recordHit('test-cache');
      service.recordMiss('test-cache');
      expect(service.snapshot().hitRatio).toBeCloseTo(0.75, 5);
    });

    it('debe calcular hitRatio = 0.5 con 1 hit + 1 miss', () => {
      service.recordHit('test-cache');
      service.recordMiss('test-cache');
      expect(service.snapshot().hitRatio).toBe(0.5);
    });
  });

  describe('snapshot immutability', () => {
    it('debe retornar snapshot inmutable (no afecta counters)', () => {
      service.recordHit('test-cache');
      const snap = service.snapshot();
      // Mutate the snapshot (should not affect service)
      (snap as { hits: number }).hits = 999;
      expect(service.snapshot().hits).toBe(1);
    });

    it('snapshots consecutivos deben retornar el mismo valor si no hay operations', () => {
      const snap1 = service.snapshot();
      const snap2 = service.snapshot();
      expect(snap2.hits).toBe(snap1.hits);
      expect(snap2.misses).toBe(snap1.misses);
    });
  });

  describe('integration scenarios (Story 4.1 + 4.3)', () => {
    it('debe simular escenario real: 2 hits + 1 miss + 1 set + 1 delete', () => {
      // Simula: load 1 (miss) + set 1 → load 2 (hit) + load 3 (hit) → PATCH (delete) → load 4 (miss)
      service.recordMiss('white-label-config'); // load 1
      service.recordSet('white-label-config'); // save to cache
      service.recordHit('white-label-config'); // load 2
      service.recordHit('white-label-config'); // load 3
      service.recordDelete('white-label-config'); // PATCH invalidation
      service.recordMiss('white-label-config'); // load 4 (cache miss after delete)

      const snap = service.snapshot();
      expect(snap.hits).toBe(2);
      expect(snap.misses).toBe(2);
      expect(snap.sets).toBe(1);
      expect(snap.deletes).toBe(1);
      expect(snap.hitRatio).toBe(0.5);
    });
  });
});
