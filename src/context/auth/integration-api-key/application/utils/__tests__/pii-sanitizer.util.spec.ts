/**
 * Tests del utility PII sanitizer (Story 2.2, Task 8).
 *
 * Estrategia: tests puros de funciones utility. Valida hashing determinista
 * de IPs, truncación de user agent, y sanitización de failureDetail.
 *
 * Estos tests deben fallar (RED) hasta que Task 8.1 implemente
 * `../pii-sanitizer.util.ts`.
 */

import {
  hashIp,
  truncateUserAgent,
  sanitizeFailureDetail,
} from '../pii-sanitizer.util';

describe('pii-sanitizer.util - Story 2.2 (unit)', () => {
  describe('hashIp', () => {
    it('debe ser determinista (mismo IP → mismo hash)', () => {
      const ip = '192.168.1.1';
      expect(hashIp(ip)).toBe(hashIp(ip));
    });

    it('debe retornar 16 chars hex (8 bytes)', () => {
      const hash = hashIp('10.0.0.1');
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('debe retornar diferentes hashes para diferentes IPs', () => {
      expect(hashIp('192.168.1.1')).not.toBe(hashIp('192.168.1.2'));
      expect(hashIp('10.0.0.1')).not.toBe(hashIp('172.16.0.1'));
    });

    it('debe hashear IPv6 también', () => {
      const hash = hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('truncateUserAgent', () => {
    it('debe retornar string vacío si input es vacío', () => {
      expect(truncateUserAgent('')).toBe('');
    });

    it('debe respetar max 500 chars', () => {
      const long = 'a'.repeat(1000);
      const result = truncateUserAgent(long);
      expect(result).toHaveLength(500);
    });

    it('no debe truncar si input < 500 chars', () => {
      const short = 'Mozilla/5.0 (X11; Linux x86_64)';
      expect(truncateUserAgent(short)).toBe(short);
    });

    it('debe truncar exactamente en 500 (no menos)', () => {
      const input = 'a'.repeat(501);
      expect(truncateUserAgent(input)).toHaveLength(500);
    });
  });

  describe('sanitizeFailureDetail', () => {
    it('debe truncar a 500 chars', () => {
      // Use only punctuation (not alphanumeric) so they don't match the
      // token regex `/[A-Za-z0-9_-]{40,}/g` (the regex strips 40+ char
      // alphanumeric runs, reducing length).
      const long = '!@# '.repeat(250); // 1000 chars, no token
      const result = sanitizeFailureDetail(long);
      expect(result).toHaveLength(500);
    });

    it('debe remover tokens base64url de 40+ chars (regex /[A-Za-z0-9_-]{40,}/g)', () => {
      const token = 'a'.repeat(50);
      const detail = `Error validating token ${token} for user alice`;
      const result = sanitizeFailureDetail(detail);
      expect(result).not.toContain(token);
      expect(result).toContain('Error validating token');
      expect(result).toContain('for user alice');
    });

    it('debe dejar texto normal sin cambios', () => {
      const detail = 'Invalid token format: expected base64url of 43 chars';
      expect(sanitizeFailureDetail(detail)).toBe(detail);
    });

    it('debe remover múltiples tokens en el mismo string', () => {
      const token1 = 'a'.repeat(50);
      const token2 = 'b'.repeat(50);
      const detail = `tokens: ${token1} and ${token2} in error`;
      const result = sanitizeFailureDetail(detail);
      expect(result).not.toContain(token1);
      expect(result).not.toContain(token2);
    });
  });
});
