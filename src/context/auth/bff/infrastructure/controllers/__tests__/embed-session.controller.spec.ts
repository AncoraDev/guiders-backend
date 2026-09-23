/**
 * Tests del EmbedSessionController (Story 2.1, Task 5.1).
 *
 * Estrategia: mock del `AuthenticateEmbedSessionCommandHandler` con
 * `jest.Mocked`. El controller setea cookies, mapea errores a HTTP
 * status codes, y NO usa `IntegrationApiKeyGuard`.
 */

import { EmbedSessionController } from '../embed-session.controller';
import { AuthenticateEmbedSessionCommandHandler } from '../../../application/commands/authenticate-embed-session.command-handler';
import { ok, err } from 'src/context/shared/domain/result';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenError,
  EmbedTokenCorruptedError,
} from 'src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import {
  EmbedBodyTokenMismatchError,
  BffSessionError,
} from '../../../domain/errors/bff-session.errors';
import { Response } from 'express';

describe('EmbedSessionController - Story 2.1', () => {
  let controller: EmbedSessionController;
  let mockHandler: jest.Mocked<AuthenticateEmbedSessionCommandHandler>;
  let mockRes: jest.Mocked<Response>;
  let cookieCalls: Array<{ name: string; value: string; options: unknown }>;
  let statusCalls: number[];
  let jsonCalls: unknown[];

  const VALID_TOKEN = 'A'.repeat(43);
  const SESSION_ID = 'B'.repeat(43);
  const EXPIRES_AT = new Date(Date.now() + 28800 * 1000).toISOString();

  beforeEach(() => {
    // Capture cookie/status/json calls
    cookieCalls = [];
    statusCalls = [];
    jsonCalls = [];

    mockRes = {
      cookie: jest.fn((name: string, value: string, options: unknown) => {
        cookieCalls.push({ name, value, options });
        return mockRes;
      }),
      status: jest.fn((code: number) => {
        statusCalls.push(code);
        return mockRes;
      }),
      json: jest.fn((body: unknown) => {
        jsonCalls.push(body);
        return mockRes;
      }),
    } as unknown as jest.Mocked<Response>;

    mockHandler = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AuthenticateEmbedSessionCommandHandler>;

    controller = new EmbedSessionController(mockHandler);
  });

  const buildReq = (token: string) =>
    ({
      embedToken: token,
      headers: {},
      ip: '127.0.0.1',
    }) as unknown as Parameters<typeof controller.authenticate>[1];

  describe('camino feliz', () => {
    it('debe retornar 200 y setear cookie access_token con sessionId', async () => {
      mockHandler.execute.mockResolvedValue(
        ok({ sessionId: SESSION_ID, expiresAt: EXPIRES_AT }),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(1);
      expect(cookieCalls[0].name).toBe('access_token');
      expect(cookieCalls[0].value).toBe(SESSION_ID);
      expect(statusCalls).toEqual([200]);
      expect(jsonCalls).toEqual([
        { sessionEstablished: true, expiresAt: EXPIRES_AT },
      ]);
    });

    it('debe aplicar atributos HttpOnly, Secure, SameSite=Lax, Path=/ a la cookie', async () => {
      mockHandler.execute.mockResolvedValue(
        ok({ sessionId: SESSION_ID, expiresAt: EXPIRES_AT }),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      const options = cookieCalls[0].options as {
        httpOnly: boolean;
        secure: boolean;
        sameSite: string;
        path: string;
      };
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('lax');
      expect(options.path).toBe('/');
    });
  });

  describe('mapeo de errores', () => {
    it('debe retornar 401 EMBED_TOKEN_EXPIRED si handler retorna EmbedTokenNotFoundError', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new EmbedTokenNotFoundError('abc...')),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
      expect(statusCalls).toEqual([401]);
      const body = jsonCalls[0] as { code: string };
      expect(body.code).toBe('EMBED_TOKEN_EXPIRED');
    });

    it('debe retornar 401 EMBED_TOKEN_INVALID si handler retorna EmbedTokenInvalidFormatError', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new EmbedTokenInvalidFormatError()),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
      expect(statusCalls).toEqual([401]);
      const body = jsonCalls[0] as { code: string };
      expect(body.code).toBe('EMBED_TOKEN_INVALID');
    });

    // T5 (code review Story 2.1): cubre la rama EmbedTokenCorruptedError
    // (paralela a EmbedTokenInvalidFormatError). Sin este test, un refactor
    // que rompa el `||` entre las dos instanceof checks pasaría
    // silenciosamente.
    it('debe retornar 401 EMBED_TOKEN_INVALID si handler retorna EmbedTokenCorruptedError', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new EmbedTokenCorruptedError()),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
      expect(statusCalls).toEqual([401]);
      const body = jsonCalls[0] as { code: string };
      expect(body.code).toBe('EMBED_TOKEN_INVALID');
    });

    it('debe retornar 403 EMBED_BODY_TOKEN_MISMATCH si body no coincide', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new EmbedBodyTokenMismatchError()),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
      expect(statusCalls).toEqual([403]);
      const body = jsonCalls[0] as { code: string };
      expect(body.code).toBe('EMBED_BODY_TOKEN_MISMATCH');
    });

    it('debe retornar 503 EMBED_SERVICE_UNAVAILABLE si handler retorna BffSessionError', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new BffSessionError('redis down')),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
      expect(statusCalls).toEqual([503]);
      const body = jsonCalls[0] as { code: string };
      expect(body.code).toBe('EMBED_SERVICE_UNAVAILABLE');
    });

    it('debe retornar 503 EMBED_SERVICE_UNAVAILABLE si handler retorna EmbedTokenError', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new EmbedTokenError('redis down')),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
      expect(statusCalls).toEqual([503]);
    });

    it('NO debe setear cookie si hay error', async () => {
      mockHandler.execute.mockResolvedValue(
        err(new EmbedTokenNotFoundError('abc')),
      );

      await controller.authenticate(
        {} as never,
        buildReq(VALID_TOKEN),
        mockRes,
      );

      expect(cookieCalls).toHaveLength(0);
    });
  });
});
