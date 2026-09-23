/**
 * Tests del `logoutEmbed` endpoint en BffController (Story 2.3, PR #115 review fix).
 *
 * Estrategia: mock del `CommandBus` con `jest.Mocked`. El controller:
 *  - Lee sessionId de cookie `access_token`
 *  - Llama CommandBus.execute(new LogoutCommand(...))
 *  - Limpia cookie en éxito
 *  - Mapea errores a HTTP status codes
 *
 * Cubre los ACs 2, 3, 5 de Story 2.3 (no se testea AC1/4/6 aquí — esos
 * están cubiertos por el handler spec).
 */

import { BffController } from '../bff-auth.controller';
import { CommandBus } from '@nestjs/cqrs';
import { ok, err } from 'src/context/shared/domain/result';
import {
  BffSessionInvalidFormatError,
  BffSessionServiceUnavailableError,
} from '../../../domain/errors/bff-session.errors';

describe('BffController.logoutEmbed - Story 2.3 (unit)', () => {
  let controller: BffController;
  let mockCommandBus: jest.Mocked<CommandBus>;
  let mockRes: jest.Mocked<Response>;
  let cookieClearCalls: Array<{ name: string; options: unknown }>;
  let statusCalls: number[];
  let jsonCalls: unknown[];

  const VALID_SESSION_ID = 'A'.repeat(43);

  beforeEach(() => {
    cookieClearCalls = [];
    statusCalls = [];
    jsonCalls = [];

    mockRes = {
      cookie: jest.fn(),
      clearCookie: jest.fn((name: string, options: unknown) => {
        cookieClearCalls.push({ name, options });
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

    mockCommandBus = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CommandBus>;

    // Crear controller con mocks (el constructor real necesita OidcService,
    // QueryBus, CommandBus — pero logoutEmbed solo usa CommandBus).
    controller = new BffController(
      {} as any, // OidcService (no usado en logoutEmbed)
      {} as any, // QueryBus (no usado)
      mockCommandBus,
    );
  });

  const buildReq = (
    cookies: Record<string, string | undefined>,
    headers: Record<string, string | string[] | undefined> = {},
    ip: string = '127.0.0.1',
  ) =>
    ({
      cookies,
      headers,
      ip,
    }) as unknown as Parameters<typeof controller.logoutEmbed>[0];

  describe('AC3 — no cookie', () => {
    it('debe retornar 401 EMBED_SESSION_NOT_FOUND cuando no hay cookie access_token', async () => {
      await controller.logoutEmbed(buildReq({}), mockRes as never);

      expect(statusCalls).toContain(401);
      const lastJson = jsonCalls[jsonCalls.length - 1] as any;
      expect(lastJson.code).toBe('EMBED_SESSION_NOT_FOUND');
      expect(lastJson.message).toContain('access_token');
    });

    it('debe llamar al CommandBus con sessionId="" para emitir failure event (AC3.2)', async () => {
      mockCommandBus.execute.mockResolvedValue(ok({}));

      await controller.logoutEmbed(buildReq({}), mockRes as never);

      expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
      const cmd = mockCommandBus.execute.mock.calls[0][0] as any;
      expect(cmd.sessionId).toBe('');
    });

    it('NO debe limpiar cookie si no había cookie', async () => {
      mockCommandBus.execute.mockResolvedValue(ok({}));

      await controller.logoutEmbed(buildReq({}), mockRes as never);

      expect(cookieClearCalls).toHaveLength(0);
    });
  });

  describe('AC3 — invalid format cookie', () => {
    it('debe retornar 400 cuando handler retorna BffSessionInvalidFormatError', async () => {
      mockCommandBus.execute.mockResolvedValue(
        err(new BffSessionInvalidFormatError()),
      );

      await controller.logoutEmbed(
        buildReq({ access_token: 'AAAA' }),
        mockRes as never,
      );

      expect(statusCalls).toContain(400);
      const lastJson = jsonCalls[jsonCalls.length - 1] as any;
      expect(lastJson.code).toBe('BFF_SESSION_INVALID_FORMAT');
    });
  });

  describe('AC2 — idempotency (2nd call)', () => {
    it('debe retornar 200 con cascadingResult=not_found cuando handler retorna ok(not_found)', async () => {
      mockCommandBus.execute.mockResolvedValue(
        ok({
          cascadingResult: { toJSON: () => 'not_found' },
          sessionId: VALID_SESSION_ID,
          embedTokenRevoked: false,
        }),
      );

      await controller.logoutEmbed(
        buildReq({ access_token: VALID_SESSION_ID }),
        mockRes as never,
      );

      expect(statusCalls).toContain(200);
      expect(cookieClearCalls).toHaveLength(1);
      expect(cookieClearCalls[0].name).toBe('access_token');
      const lastJson = jsonCalls[jsonCalls.length - 1] as any;
      expect(lastJson.cascadingResult).toBe('not_found');
    });
  });

  describe('AC1 — happy path', () => {
    it('debe retornar 200 con cascadingResult=success cuando handler retorna success', async () => {
      mockCommandBus.execute.mockResolvedValue(
        ok({
          cascadingResult: { toJSON: () => 'success' },
          sessionId: VALID_SESSION_ID,
          embedTokenRevoked: true,
        }),
      );

      await controller.logoutEmbed(
        buildReq({ access_token: VALID_SESSION_ID }),
        mockRes as never,
      );

      expect(statusCalls).toContain(200);
      expect(cookieClearCalls).toHaveLength(1);
      const lastJson = jsonCalls[jsonCalls.length - 1] as any;
      expect(lastJson.cascadingResult).toBe('success');
      expect(lastJson.embedTokenRevoked).toBe(true);
      expect(lastJson.sessionId).toBe(VALID_SESSION_ID);
    });
  });

  describe('AC5 — partial revocation', () => {
    it('debe retornar 200 con cascadingResult=partial cuando handler retorna partial', async () => {
      mockCommandBus.execute.mockResolvedValue(
        ok({
          cascadingResult: { toJSON: () => 'partial' },
          sessionId: VALID_SESSION_ID,
          embedTokenRevoked: false,
        }),
      );

      await controller.logoutEmbed(
        buildReq({ access_token: VALID_SESSION_ID }),
        mockRes as never,
      );

      expect(statusCalls).toContain(200);
      const lastJson = jsonCalls[jsonCalls.length - 1] as any;
      expect(lastJson.cascadingResult).toBe('partial');
      expect(lastJson.embedTokenRevoked).toBe(false);
    });
  });

  describe('Redis down', () => {
    it('debe retornar 503 EMBED_SESSION_SERVICE_UNAVAILABLE cuando handler retorna service unavailable', async () => {
      mockCommandBus.execute.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('Connection refused')),
      );

      await controller.logoutEmbed(
        buildReq({ access_token: VALID_SESSION_ID }),
        mockRes as never,
      );

      expect(statusCalls).toContain(503);
      const lastJson = jsonCalls[jsonCalls.length - 1] as any;
      expect(lastJson.code).toBe('BFF_SESSION_SERVICE_UNAVAILABLE');
    });
  });

  describe('Audit context extraction', () => {
    it('debe extraer origin, ipAddress, userAgent de headers y pasarlos al CommandBus', async () => {
      mockCommandBus.execute.mockResolvedValue(
        ok({
          cascadingResult: { toJSON: () => 'success' },
          sessionId: VALID_SESSION_ID,
          embedTokenRevoked: true,
        }),
      );

      await controller.logoutEmbed(
        buildReq(
          { access_token: VALID_SESSION_ID },
          {
            origin: 'https://app.leadcars.com',
            'user-agent': 'jest-test/1.0',
            'x-forwarded-for': '203.0.113.1',
          },
        ),
        mockRes as never,
      );

      const cmd = mockCommandBus.execute.mock.calls[0][0] as any;
      expect(cmd.origin).toBe('https://app.leadcars.com');
      expect(cmd.userAgent).toBe('jest-test/1.0');
      expect(cmd.ipAddress).toBe('127.0.0.1'); // req.ip wins over x-forwarded-for
    });

    it('debe caer a x-forwarded-for si req.ip no está disponible', async () => {
      mockCommandBus.execute.mockResolvedValue(
        ok({
          cascadingResult: { toJSON: () => 'success' },
          sessionId: VALID_SESSION_ID,
          embedTokenRevoked: true,
        }),
      );

      const reqWithoutIp = {
        cookies: { access_token: VALID_SESSION_ID },
        headers: {
          'x-forwarded-for': '203.0.113.42',
        },
      } as unknown as Parameters<typeof controller.logoutEmbed>[0];

      await controller.logoutEmbed(reqWithoutIp, mockRes as never);

      const cmd = mockCommandBus.execute.mock.calls[0][0] as any;
      expect(cmd.ipAddress).toBe('203.0.113.42');
    });
  });
});
