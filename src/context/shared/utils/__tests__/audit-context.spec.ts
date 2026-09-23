import { describe, it, expect } from '@jest/globals';
import type { Request } from 'express';
import { extractAuditContext } from '../audit-context';

/**
 * Helper para construir un mock Request de Express con headers específicos.
 * AI-3: NO usamos `instanceof BaseError` — usamos assertions específicas
 * sobre los valores retornados.
 *
 * `ip` usa una propiedad opcional custom (`__mockIp`) para evitar el
 * problema de Express que setea `req.ip` por defecto. Si se quiere
 * simular `req.ip = undefined`, pasar `null` como segundo argumento.
 */
function buildReq(
  headers: Record<string, string | string[] | undefined>,
  ip: string | null = '127.0.0.1',
): Request {
  // Express normaliza headers a lowercase
  const normalizedHeaders: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      normalizedHeaders[key.toLowerCase()] = value;
    }
  }
  return {
    headers: normalizedHeaders,
    // Truco: usamos una propiedad única para evitar que Express setee ip default
    ip: ip === null ? undefined : ip,
  } as unknown as Request;
}

describe('extractAuditContext (unit) - AI-4 DRY helper', () => {
  describe('happy path — todos los headers presentes', () => {
    it('debe extraer origin, ipAddress y userAgent cuando todos los headers están presentes', () => {
      const req = buildReq(
        {
          origin: 'https://app.leadcars.com',
          'user-agent': 'jest-test/1.0',
          'x-forwarded-for': '203.0.113.42',
        },
        '127.0.0.1',
      );

      const ctx = extractAuditContext(req);

      expect(ctx.origin).toBe('https://app.leadcars.com');
      expect(ctx.userAgent).toBe('jest-test/1.0');
      // req.ip gana sobre x-forwarded-for
      expect(ctx.ipAddress).toBe('127.0.0.1');
    });
  });

  describe('fallback chains', () => {
    it('debe caer a referer cuando origin no está presente', () => {
      const req = buildReq({
        referer: 'https://app.leadcars.com/dashboard',
        'user-agent': 'jest-test/1.0',
      });

      const ctx = extractAuditContext(req);

      expect(ctx.origin).toBe('https://app.leadcars.com/dashboard');
    });

    it('debe usar x-forwarded-for cuando req.ip no está disponible', () => {
      const req = buildReq(
        {
          origin: 'https://app.leadcars.com',
          'x-forwarded-for': '203.0.113.42, 10.0.0.1',
        },
        null, // req.ip undefined (null = omitir)
      );

      const ctx = extractAuditContext(req);

      // Toma el primer hop (cliente original)
      expect(ctx.ipAddress).toBe('203.0.113.42');
    });

    it('debe usar x-forwarded-for con trim cuando tiene whitespace', () => {
      const req = buildReq(
        {
          origin: 'https://app.leadcars.com',
          'x-forwarded-for': '  203.0.113.42  , 10.0.0.1',
        },
        null,
      );

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('203.0.113.42');
    });

    it('debe caer a string vacío cuando todos los headers faltan', () => {
      const req = buildReq({}, null); // req.ip undefined

      const ctx = extractAuditContext(req);

      expect(ctx.origin).toBe('');
      expect(ctx.ipAddress).toBe('');
      expect(ctx.userAgent).toBe('');
    });
  });

  describe('edge cases', () => {
    it('debe tomar el primer valor cuando el header es un array (multi-cookie edge)', () => {
      const req = buildReq({
        origin: ['https://a.com', 'https://b.com'],
        'user-agent': 'jest-test/1.0',
      });

      const ctx = extractAuditContext(req);

      expect(ctx.origin).toBe('https://a.com');
    });

    it('debe retornar string vacío cuando un header es array vacío', () => {
      const req = buildReq({
        origin: [],
      });

      const ctx = extractAuditContext(req);

      expect(ctx.origin).toBe('');
    });

    it('debe retornar string vacío cuando x-forwarded-for es array vacío', () => {
      const req = buildReq(
        {
          'x-forwarded-for': [],
        },
        null,
      );

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('');
    });

    it('NO debe filtrar PII — la sanitization es responsabilidad del persistence handler', () => {
      // El helper retorna la IP raw; el handler de MongoDB la hashea después.
      // Esto es separación de concerns: el helper extrae, el handler sanitiza.
      const req = buildReq(
        {},
        '192.168.1.1', // IP raw, no hasheada
      );

      const ctx = extractAuditContext(req);

      // Verificar que la IP NO se hashea aquí
      expect(ctx.ipAddress).toBe('192.168.1.1');
      expect(ctx.ipAddress).not.toMatch(/^[a-f0-9]{16}$/); // no es un SHA-256 prefix
    });

    it('NO debe usar nullish coalescing que pierde empty string (req.ip="")', () => {
      // PR #115 re-review edge case (VALIDATION_GAP-21):
      // `'' ?? xff` retorna `''` (nullish coalescing), NO cae al fallback.
      // El helper debe tratar empty string como "no disponible" y caer al fallback.
      const req = buildReq(
        {
          'x-forwarded-for': '203.0.113.42',
        },
        '', // req.ip = '' (empty string, falsy per nullish)
      );

      const ctx = extractAuditContext(req);

      // Debe usar x-forwarded-for porque req.ip es empty string
      expect(ctx.ipAddress).toBe('203.0.113.42');
    });
  });

  describe('AI-3 compliance: result shape', () => {
    it('debe retornar siempre los 3 campos (nunca undefined)', () => {
      const req = buildReq({});

      const ctx = extractAuditContext(req);

      // AI-3: assertion específica sobre la shape
      expect(ctx).toHaveProperty('origin');
      expect(ctx).toHaveProperty('ipAddress');
      expect(ctx).toHaveProperty('userAgent');
      expect(typeof ctx.origin).toBe('string');
      expect(typeof ctx.ipAddress).toBe('string');
      expect(typeof ctx.userAgent).toBe('string');
    });
  });

  describe('TD-3 — IPv6-mapped IPv4 normalization', () => {
    it('debe normalizar ::ffff:192.168.1.1 a 192.168.1.1 (IPv6-mapped → IPv4)', () => {
      // Express retorna este formato cuando el cliente IPv4 se conecta
      // a un servidor dual-stack IPv6. Sin normalización, el hash IP
      // produce valores distintos para el mismo cliente.
      const req = buildReq({}, '::ffff:192.168.1.1');

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('192.168.1.1');
    });

    it('debe normalizar ::FFFF:10.0.0.1 (mayúsculas) a 10.0.0.1', () => {
      const req = buildReq({}, '::FFFF:10.0.0.1');

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('10.0.0.1');
    });

    it('NO debe normalizar IPv4 plano (192.168.1.1)', () => {
      const req = buildReq({}, '192.168.1.1');

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('192.168.1.1');
    });

    it('NO debe normalizar IPv6 puro (2001:db8::1)', () => {
      const req = buildReq({}, '2001:db8::1');

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('2001:db8::1');
    });

    it('debe normalizar IPv6-mapped desde x-forwarded-for (no solo req.ip)', () => {
      // PR #115 VALIDATION_GAP-21 fix: x-forwarded-for fallback cuando
      // req.ip está vacío. Ahora también normaliza IPv6-mapped.
      const req = buildReq(
        {
          'x-forwarded-for': '::ffff:203.0.113.42',
        },
        null,
      );

      const ctx = extractAuditContext(req);

      expect(ctx.ipAddress).toBe('203.0.113.42');
    });
  });
});
