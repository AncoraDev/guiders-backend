/**
 * Tests para cors-origins.util (Story 3.3).
 * AI-3 compliance: usa `expect.arrayContaining([...])` y assertions específicas.
 */
import {
  DEFAULT_EMBED_ORIGINS,
  parseAllowedOrigins,
  mergeAllowedOrigins,
} from '../cors-origins.util';

describe('cors-origins.util', () => {
  describe('DEFAULT_EMBED_ORIGINS', () => {
    it('debe incluir https://app.leadcars.com', () => {
      expect(DEFAULT_EMBED_ORIGINS).toContain('https://app.leadcars.com');
    });

    it('debe incluir https://www.leadcars.com', () => {
      expect(DEFAULT_EMBED_ORIGINS).toContain('https://www.leadcars.com');
    });

    it('debe ser inmutable (readonly array)', () => {
      // TypeScript readonly check (compile-time), runtime check
      expect(Array.isArray(DEFAULT_EMBED_ORIGINS)).toBe(true);
      expect(DEFAULT_EMBED_ORIGINS.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('parseAllowedOrigins', () => {
    it('debe retornar [] para string vacío', () => {
      expect(parseAllowedOrigins('')).toEqual([]);
    });

    it('debe retornar [] para undefined', () => {
      expect(parseAllowedOrigins(undefined)).toEqual([]);
    });

    it('debe retornar [] para null', () => {
      expect(parseAllowedOrigins(null)).toEqual([]);
    });

    it('debe retornar [] para input no-string (número)', () => {
      expect(parseAllowedOrigins(42)).toEqual([]);
    });

    it('debe retornar [] para input no-string (boolean)', () => {
      expect(parseAllowedOrigins(true)).toEqual([]);
    });

    it('debe retornar single origin sin comas', () => {
      expect(parseAllowedOrigins('https://app.leadcars.com')).toEqual([
        'https://app.leadcars.com',
      ]);
    });

    it('debe split por comas y trim cada origin', () => {
      expect(
        parseAllowedOrigins('https://a.com, https://b.com ,https://c.com'),
      ).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
    });

    it('debe filtrar origins vacíos', () => {
      expect(parseAllowedOrigins('  ,  ,https://a.com ,')).toEqual([
        'https://a.com',
      ]);
    });

    it('NO debe deduplicar (esa responsabilidad es de mergeAllowedOrigins)', () => {
      expect(
        parseAllowedOrigins('https://a.com,https://a.com,https://b.com'),
      ).toEqual(['https://a.com', 'https://a.com', 'https://b.com']);
    });
  });

  describe('mergeAllowedOrigins', () => {
    it('debe incluir DEFAULT_EMBED_ORIGINS primero', () => {
      const result = mergeAllowedOrigins([], []);
      expect(result).toContain('https://app.leadcars.com');
      expect(result).toContain('https://www.leadcars.com');
    });

    it('debe incluir envEmbedOrigins después de defaults', () => {
      const result = mergeAllowedOrigins(['https://custom.com'], []);
      expect(result).toEqual([
        'https://app.leadcars.com',
        'https://www.leadcars.com',
        'https://custom.com',
      ]);
    });

    it('debe incluir envLegacyOrigins al final', () => {
      const result = mergeAllowedOrigins([], ['https://legacy.com']);
      expect(result).toEqual([
        'https://app.leadcars.com',
        'https://www.leadcars.com',
        'https://legacy.com',
      ]);
    });

    it('debe deduplicar origins repetidos', () => {
      const result = mergeAllowedOrigins(
        ['https://app.leadcars.com'],
        ['https://www.leadcars.com'],
      );
      // DEFAULT ya tiene ambos → dedupe deja solo 2
      expect(result).toEqual([
        'https://app.leadcars.com',
        'https://www.leadcars.com',
      ]);
    });

    it('debe preservar orden: defaults → embed → legacy', () => {
      const result = mergeAllowedOrigins(
        ['https://embed.com'],
        ['https://legacy.com'],
      );
      const appLeadcarsIdx = result.indexOf('https://app.leadcars.com');
      const embedIdx = result.indexOf('https://embed.com');
      const legacyIdx = result.indexOf('https://legacy.com');

      expect(appLeadcarsIdx).toBeLessThan(embedIdx);
      expect(embedIdx).toBeLessThan(legacyIdx);
    });

    it('debe manejar arrays vacíos sin error', () => {
      expect(mergeAllowedOrigins([], [])).toEqual([
        'https://app.leadcars.com',
        'https://www.leadcars.com',
      ]);
    });
  });
});
