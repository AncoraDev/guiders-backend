/**
 * Tests para InMemoryTtlCache (Story 4.1 + 4.3).
 * AI-3 compliance: usa assertions específicas (no `toBeTruthy()` alone).
 */
import { InMemoryTtlCache } from '../in-memory-ttl-cache';

describe('InMemoryTtlCache', () => {
  describe('basic get/set', () => {
    it('debe retornar undefined para key que no existe', () => {
      const cache = new InMemoryTtlCache<string, number>();
      expect(cache.get('missing')).toBeUndefined();
    });

    it('debe retornar el valor después de set()', () => {
      const cache = new InMemoryTtlCache<string, number>();
      cache.set('key', 42);
      expect(cache.get('key')).toBe(42);
    });

    it('debe sobrescribir valor en key existente', () => {
      const cache = new InMemoryTtlCache<string, number>();
      cache.set('key', 1);
      cache.set('key', 2);
      expect(cache.get('key')).toBe(2);
      expect(cache.size()).toBe(1);
    });

    it('debe soportar diferentes tipos generics', () => {
      const cache = new InMemoryTtlCache<string, { foo: string }>();
      cache.set('a', { foo: 'bar' });
      expect(cache.get('a')).toEqual({ foo: 'bar' });
    });
  });

  describe('TTL expiration', () => {
    it('debe retornar undefined cuando entry ha expirado', () => {
      let now = 1000;
      const cache = new InMemoryTtlCache<string, number>({
        ttlMs: 60_000,
        clock: () => now,
      });
      cache.set('key', 1);
      expect(cache.get('key')).toBe(1);

      // Advance time past TTL
      now = 1000 + 60_001;
      expect(cache.get('key')).toBeUndefined();
    });

    it('debe eliminar entry expirado al acceder (lazy cleanup)', () => {
      let now = 1000;
      const cache = new InMemoryTtlCache<string, number>({
        ttlMs: 60_000,
        clock: () => now,
      });
      cache.set('a', 1);
      cache.set('b', 2);

      now = 1000 + 60_001;
      cache.get('a'); // Triggers lazy cleanup

      expect(cache.size()).toBe(1);
      expect(cache.get('b')).toBeUndefined(); // also expired
    });

    it('NO debe expirar si TTL no se ha alcanzado', () => {
      let now = 1000;
      const cache = new InMemoryTtlCache<string, number>({
        ttlMs: 60_000,
        clock: () => now,
      });
      cache.set('key', 1);
      now = 1000 + 59_999;
      expect(cache.get('key')).toBe(1);
    });

    it('debe usar TTL por defecto de 60 segundos', () => {
      const cache = new InMemoryTtlCache<string, number>();
      expect(cache.getTtlMs()).toBe(60_000);
    });
  });

  describe('delete + clear', () => {
    it('debe eliminar entry específico con delete()', () => {
      const cache = new InMemoryTtlCache<string, number>();
      cache.set('a', 1);
      cache.set('b', 2);
      cache.delete('a');
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe(2);
    });

    it('debe ser no-op en delete() para key inexistente', () => {
      const cache = new InMemoryTtlCache<string, number>();
      expect(() => cache.delete('missing')).not.toThrow();
    });

    it('debe eliminar todo con clear()', () => {
      const cache = new InMemoryTtlCache<string, number>();
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('debe retornar 0 para cache vacío', () => {
      const cache = new InMemoryTtlCache<string, number>();
      expect(cache.size()).toBe(0);
    });

    it('debe incrementar después de cada set()', () => {
      const cache = new InMemoryTtlCache<string, number>();
      cache.set('a', 1);
      expect(cache.size()).toBe(1);
      cache.set('b', 2);
      expect(cache.size()).toBe(2);
      // set() con misma key NO incrementa
      cache.set('a', 3);
      expect(cache.size()).toBe(2);
    });
  });

  describe('integration scenarios (Story 4.1)', () => {
    it('debe simular escenario real: GET /embed/start cache hit', () => {
      // Simula: primer request (cache miss), segundo request (cache hit)
      const cache = new InMemoryTtlCache<string, string>({ ttlMs: 60_000 });

      // Primer request — cache miss
      expect(cache.get('company-uuid')).toBeUndefined();
      cache.set('company-uuid', '<html>branding</html>');

      // Segundo request (within 60s) — cache hit
      expect(cache.get('company-uuid')).toBe('<html>branding</html>');
    });

    it('debe aislar entries de diferentes tenants', () => {
      const cache = new InMemoryTtlCache<string, string>({ ttlMs: 60_000 });
      cache.set('tenant-a', '<html>A</html>');
      cache.set('tenant-b', '<html>B</html>');

      expect(cache.get('tenant-a')).toBe('<html>A</html>');
      expect(cache.get('tenant-b')).toBe('<html>B</html>');
      expect(cache.size()).toBe(2);
    });
  });
});
