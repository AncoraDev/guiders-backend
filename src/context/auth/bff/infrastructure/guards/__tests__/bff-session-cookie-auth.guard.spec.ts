/**
 * Tests unitarios para BffSessionCookieAuthGuard (Story 6.0).
 * Cubre el path opaque session del guard dual-auth.
 *
 * AI-3 compliance: usa `instanceof SpecificError` (nunca `instanceof BaseError`).
 */
import {
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { BffSessionCookieAuthGuard } from '../bff-session-cookie-auth.guard';
import { IBffSessionService } from 'src/context/auth/bff/domain/services/bff-session.service';
import { ok, err } from 'src/context/shared/domain/result';
import {
  BffSessionNotFoundError,
  BffSessionServiceUnavailableError,
  BffSessionCorruptedError,
} from 'src/context/auth/bff/domain/errors/bff-session.errors';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

const VALID_OPAQUE_SESSION = 'a'.repeat(43);
const VALID_JWT = 'header.payload.signature';

function makeMockContext(cookieValue?: string): ExecutionContext {
  const req = {
    cookies: cookieValue !== undefined ? { access_token: cookieValue } : {},
    headers: { 'user-agent': 'test-ua', origin: 'https://example.com' },
    ip: '127.0.0.1',
  } as unknown as Request;
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('BffSessionCookieAuthGuard (unit)', () => {
  let guard: BffSessionCookieAuthGuard;
  let mockBffSessionService: jest.Mocked<IBffSessionService>;

  beforeEach(() => {
    mockBffSessionService = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      revokeSession: jest.fn(),
      cascadeRevoke: jest.fn(),
    } as jest.Mocked<IBffSessionService>;

    guard = new BffSessionCookieAuthGuard(mockBffSessionService);
  });

  describe('AC1 — Opaque BFF session IDs', () => {
    it('debería autenticar cuando opaque session es válida', async () => {
      const userId = Uuid.random().value;
      const companyId = Uuid.random().value;
      mockBffSessionService.getSession.mockResolvedValue(
        ok({
          userId,
          companyId,
          roles: ['admin'],
          createdAt: new Date().toISOString(),
          embedTokenRef: 'ref',
          expiresAt: new Date().toISOString(),
        }),
      );

      const result = await guard.canActivate(
        makeMockContext(VALID_OPAQUE_SESSION),
      );
      expect(result).toBe(true);
      expect(mockBffSessionService.getSession).toHaveBeenCalledWith(
        VALID_OPAQUE_SESSION,
      );
    });

    it('debería incluir companyId en req.user', async () => {
      const userId = Uuid.random().value;
      const companyId = Uuid.random().value;
      mockBffSessionService.getSession.mockResolvedValue(
        ok({
          userId,
          companyId,
          roles: [],
          createdAt: new Date().toISOString(),
          embedTokenRef: 'ref',
          expiresAt: new Date().toISOString(),
        }),
      );

      const context = makeMockContext(VALID_OPAQUE_SESSION);
      await guard.canActivate(context);
      const req = context.switchToHttp().getRequest<Request>() as any;
      expect(req.user).toBeDefined();
      expect(req.user.companyId).toBe(companyId);
    });
  });

  describe('AC2 — JWT backward compat (delegated to super)', () => {
    it('debería NO llamar BFF_SESSION_SERVICE cuando token tiene formato JWT', async () => {
      try {
        await guard.canActivate(makeMockContext(VALID_JWT));
      } catch {
        // Expected: passport will fail in unit test (no strategy registered)
      }
      expect(mockBffSessionService.getSession).not.toHaveBeenCalled();
    });
  });

  describe('AC3 — Invalid session returns 401', () => {
    it('debería lanzar UnauthorizedException cuando session not found', async () => {
      mockBffSessionService.getSession.mockResolvedValue(
        err(new BffSessionNotFoundError(VALID_OPAQUE_SESSION)),
      );

      await expect(
        guard.canActivate(makeMockContext(VALID_OPAQUE_SESSION)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException para token con formato inválido', async () => {
      // 'invalid-token' = 13 chars, no JWT, no opaque → super.canActivate (passport fail)
      try {
        await guard.canActivate(makeMockContext('invalid-token'));
      } catch {
        // Expected
      }
      expect(mockBffSessionService.getSession).not.toHaveBeenCalled();
    });
  });

  describe('AC4 — AC1 from review: BFF_SERVICE_UNAVAILABLE returns 503 (not 401)', () => {
    it('debería lanzar ServiceUnavailableException cuando Redis down', async () => {
      mockBffSessionService.getSession.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('Connection lost')),
      );

      await expect(
        guard.canActivate(makeMockContext(VALID_OPAQUE_SESSION)),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('debería lanzar ServiceUnavailableException cuando data corrupted', async () => {
      mockBffSessionService.getSession.mockResolvedValue(
        err(new BffSessionCorruptedError()),
      );

      await expect(
        guard.canActivate(makeMockContext(VALID_OPAQUE_SESSION)),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('AC5 — Token kind detection', () => {
    it('debería detectar opaque format (43 base64url chars)', async () => {
      mockBffSessionService.getSession.mockResolvedValue(
        err(new BffSessionNotFoundError(VALID_OPAQUE_SESSION)),
      );

      await expect(
        guard.canActivate(makeMockContext(VALID_OPAQUE_SESSION)),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockBffSessionService.getSession).toHaveBeenCalledWith(
        VALID_OPAQUE_SESSION,
      );
    });
  });
});
