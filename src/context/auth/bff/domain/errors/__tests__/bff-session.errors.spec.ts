/**
 * Tests de las clases de error del BFF Session Service (Story 2.1, Task 2.4).
 *
 * Estrategia: clases de error puras (no async, no Redis). Validan la
 * jerarquía, el `code` y el `statusCode` que el controller mapea a
 * HTTP 4xx/5xx.
 *
 * Estos tests deben fallar (RED) hasta que Task 2.4 implemente las
 * clases en `../bff-session.errors.ts`.
 */

import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  BffSessionError,
  BffSessionInvalidFormatError,
  BffSessionNotFoundError,
  BffSessionCorruptedError,
  BffSessionServiceUnavailableError,
  EmbedBodyTokenMismatchError,
} from '../bff-session.errors';

describe('BffSessionError hierarchy (Story 2.1 - Task 2.4)', () => {
  describe('BffSessionError (base)', () => {
    it('debe ser instancia de DomainError', () => {
      const err = new BffSessionError('algo falló');
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(BffSessionError);
    });

    it('debe tener code = "BFF_SESSION_ERROR"', () => {
      const err = new BffSessionError('algo falló');
      expect(err.code).toBe('BFF_SESSION_ERROR');
    });

    it('debe tener statusCode = 500', () => {
      const err = new BffSessionError('algo falló');
      expect(err.statusCode).toBe(500);
    });

    it('debe preservar el mensaje recibido en el constructor', () => {
      const err = new BffSessionError('mensaje custom');
      expect(err.message).toBe('mensaje custom');
    });
  });

  describe('BffSessionInvalidFormatError', () => {
    it('debe ser instancia de BffSessionError y DomainError', () => {
      const err = new BffSessionInvalidFormatError();
      expect(err).toBeInstanceOf(BffSessionError);
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(BffSessionInvalidFormatError);
    });

    it('debe tener code = "BFF_SESSION_INVALID_FORMAT"', () => {
      const err = new BffSessionInvalidFormatError();
      expect(err.code).toBe('BFF_SESSION_INVALID_FORMAT');
    });

    it('debe tener statusCode = 400', () => {
      const err = new BffSessionInvalidFormatError();
      expect(err.statusCode).toBe(400);
    });
  });

  describe('BffSessionNotFoundError', () => {
    it('debe ser instancia de BffSessionError y DomainError', () => {
      const err = new BffSessionNotFoundError('abc...');
      expect(err).toBeInstanceOf(BffSessionError);
      expect(err).toBeInstanceOf(DomainError);
    });

    it('debe tener code = "BFF_SESSION_NOT_FOUND"', () => {
      const err = new BffSessionNotFoundError('abc...');
      expect(err.code).toBe('BFF_SESSION_NOT_FOUND');
    });

    it('debe tener statusCode = 401', () => {
      const err = new BffSessionNotFoundError('abc...');
      expect(err.statusCode).toBe(401);
    });

    it('debe aceptar un sessionIdPrefix en el constructor', () => {
      const err = new BffSessionNotFoundError('abc123');
      expect(err.message).toContain('abc123');
    });
  });

  describe('BffSessionCorruptedError', () => {
    it('debe ser instancia de BffSessionError y DomainError', () => {
      const err = new BffSessionCorruptedError();
      expect(err).toBeInstanceOf(BffSessionError);
      expect(err).toBeInstanceOf(DomainError);
    });

    it('debe tener code = "BFF_SESSION_CORRUPTED"', () => {
      const err = new BffSessionCorruptedError();
      expect(err.code).toBe('BFF_SESSION_CORRUPTED');
    });

    it('debe tener statusCode = 500 (incidente, no leak)', () => {
      const err = new BffSessionCorruptedError();
      expect(err.statusCode).toBe(500);
    });
  });

  describe('BffSessionServiceUnavailableError', () => {
    it('debe ser instancia de BffSessionError y DomainError', () => {
      const err = new BffSessionServiceUnavailableError('redis down');
      expect(err).toBeInstanceOf(BffSessionError);
      expect(err).toBeInstanceOf(DomainError);
    });

    it('debe tener code = "BFF_SESSION_SERVICE_UNAVAILABLE"', () => {
      const err = new BffSessionServiceUnavailableError('redis down');
      expect(err.code).toBe('BFF_SESSION_SERVICE_UNAVAILABLE');
    });

    it('debe tener statusCode = 503', () => {
      const err = new BffSessionServiceUnavailableError('redis down');
      expect(err.statusCode).toBe(503);
    });
  });

  describe('EmbedBodyTokenMismatchError', () => {
    it('debe ser instancia de DomainError (no de BffSessionError)', () => {
      const err = new EmbedBodyTokenMismatchError();
      expect(err).toBeInstanceOf(DomainError);
      expect(err).toBeInstanceOf(EmbedBodyTokenMismatchError);
      // NO debe ser BffSessionError — es de control-flow del controller, no de Redis
      expect(err).not.toBeInstanceOf(BffSessionError);
    });

    it('debe tener code = "EMBED_BODY_TOKEN_MISMATCH"', () => {
      const err = new EmbedBodyTokenMismatchError();
      expect(err.code).toBe('EMBED_BODY_TOKEN_MISMATCH');
    });

    it('debe tener statusCode = 403', () => {
      const err = new EmbedBodyTokenMismatchError();
      expect(err.statusCode).toBe(403);
    });
  });
});
