import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
  ExecutionContext,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import * as request from 'supertest';
import { EmbedSessionController } from '../src/context/auth/bff/infrastructure/controllers/embed-session.controller';
import { AuthenticateEmbedSessionCommandHandler } from '../src/context/auth/bff/application/commands/authenticate-embed-session.command-handler';
import {
  BFF_SESSION_SERVICE,
  IBffSessionService,
} from '../src/context/auth/bff/domain/services/bff-session.service';
import {
  EMBED_TOKEN_SERVICE,
  IEmbedTokenService,
} from '../src/context/auth/integration-api-key/domain/services/embed-token.service';
import { EmbedTokenGuard } from '../src/context/auth/integration-api-key/infrastructure/guards/embed-token.guard';
import { ok, err } from '../src/context/shared/domain/result';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
} from '../src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import { BffSessionServiceUnavailableError } from '../src/context/auth/bff/domain/errors/bff-session.errors';
import { Uuid } from '../src/context/shared/domain/value-objects/uuid';

/**
 * E2E tests para Story 2.1 — POST /embed/authenticate-session.
 *
 * Estrategia:
 * - Mockeamos `EmbedTokenGuard` para inyectar `req.embedToken`
 *   determinísticamente.
 * - Mockeamos `IEmbedTokenService` y `IBffSessionService` con mocks
 *   `const` (no reasignamos) para que la referencia sea estable.
 * - NO usamos base de datos ni Redis real.
 *
 * IMPORTANTE: `app = await buildApp(...)` se llama ANTES de configurar
 * `mockX.fn().mockResolvedValue(...)` para que NestJS cachee la
 * referencia al mock correcta (patrón de Story 1.3).
 */

class MockEmbedTokenGuard {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.embedToken = req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    return true;
  }
}

class RejectingEmbedTokenGuard {
  canActivate(): boolean {
    throw new UnauthorizedException({
      code: 'EMBED_TOKEN_MISSING',
      message: 'Authorization header requerido en formato "Bearer <token>"',
      statusCode: 401,
    });
  }
}

describe('POST /embed/authenticate-session - Story 2.1 (e2e)', () => {
  let app: INestApplication;

  // Mocks declarados como `const` (no reasignamos) para que la referencia
  // capturada por NestJS sea estable durante toda la vida del test.
  const mockEmbedTokens: jest.Mocked<IEmbedTokenService> = {
    createToken: jest.fn(),
    validateToken: jest.fn(),
    refreshToken: jest.fn(),
    revokeToken: jest.fn(),
  } as unknown as jest.Mocked<IEmbedTokenService>;

  const mockBffSessions: jest.Mocked<IBffSessionService> = {
    createSession: jest.fn(),
    getSession: jest.fn(),
    revokeSession: jest.fn(),
  } as unknown as jest.Mocked<IBffSessionService>;

  const USER_ID = Uuid.random().value;
  const COMPANY_ID = Uuid.random().value;
  const ROLES = ['admin'];
  const VALID_TOKEN = 'a'.repeat(43);
  const SESSION_ID = 'b'.repeat(43);
  const EXPIRES_AT = new Date(Date.now() + 28800 * 1000).toISOString();

  async function buildApp(
    guard: typeof MockEmbedTokenGuard | typeof RejectingEmbedTokenGuard,
  ): Promise<INestApplication> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [EmbedSessionController],
      providers: [
        AuthenticateEmbedSessionCommandHandler,
        {
          provide: EMBED_TOKEN_SERVICE,
          useValue: mockEmbedTokens,
        },
        {
          provide: BFF_SESSION_SERVICE,
          useValue: mockBffSessions,
        },
      ],
    })
      .overrideGuard(EmbedTokenGuard)
      .useClass(guard)
      .compile();

    const testApp = moduleRef.createNestApplication();
    testApp.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await testApp.init();
    return testApp;
  }

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) {
      await app.close();
    }
  });

  describe('AC1: happy path', () => {
    it('debe retornar 200 y setear cookie access_token con sessionId', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );
      mockBffSessions.createSession.mockResolvedValue(
        ok({ sessionId: SESSION_ID, expiresAt: EXPIRES_AT }),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(200);

      expect(res.body).toEqual({
        sessionEstablished: true,
        expiresAt: EXPIRES_AT,
      });

      const cookies = res.headers['set-cookie'] as unknown as
        | string[]
        | undefined;
      expect(cookies).toBeDefined();
      expect(cookies!.length).toBeGreaterThanOrEqual(1);
      const accessTokenCookie = cookies!.find((c) =>
        c.startsWith('access_token='),
      );
      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie).toContain(SESSION_ID);
      expect(accessTokenCookie).toMatch(/HttpOnly/i);
      expect(accessTokenCookie).toMatch(/SameSite=Lax/i);
    });

    it('debe pasar el embedToken como embedTokenRef al createSession', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );
      mockBffSessions.createSession.mockResolvedValue(
        ok({ sessionId: SESSION_ID, expiresAt: EXPIRES_AT }),
      );

      await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(200);

      expect(mockBffSessions.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
        }),
        VALID_TOKEN,
      );
    });
  });

  describe('AC2: body coincidente (defense-in-depth OK)', () => {
    it('debe retornar 200 si body.userId y body.companyId coinciden con el token', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );
      mockBffSessions.createSession.mockResolvedValue(
        ok({ sessionId: SESSION_ID, expiresAt: EXPIRES_AT }),
      );

      await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ userId: USER_ID, companyId: COMPANY_ID })
        .expect(200);
    });
  });

  describe('AC3: body userId mismatched', () => {
    it('debe retornar 403 EMBED_BODY_TOKEN_MISMATCH si body.userId != token.userId', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ userId: Uuid.random().value })
        .expect(403);

      expect(res.body.code).toBe('EMBED_BODY_TOKEN_MISMATCH');
      expect(mockBffSessions.createSession).not.toHaveBeenCalled();
    });
  });

  describe('AC4: body companyId mismatched', () => {
    it('debe retornar 403 EMBED_BODY_TOKEN_MISMATCH si body.companyId != token.companyId', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ companyId: Uuid.random().value })
        .expect(403);

      expect(res.body.code).toBe('EMBED_BODY_TOKEN_MISMATCH');
    });
  });

  describe('AC5: token expirado/revocado', () => {
    it('debe retornar 401 EMBED_TOKEN_EXPIRED si validateToken retorna NotFound', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenNotFoundError('abc...')),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(401);

      expect(res.body.code).toBe('EMBED_TOKEN_EXPIRED');
    });

    it('debe retornar 401 EMBED_TOKEN_INVALID si validateToken retorna InvalidFormat', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenInvalidFormatError()),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(401);

      expect(res.body.code).toBe('EMBED_TOKEN_INVALID');
    });
  });

  describe('AC6: EmbedTokenGuard rechaza', () => {
    it('debe retornar 401 si guard rechaza (sin Authorization header)', async () => {
      app = await buildApp(RejectingEmbedTokenGuard);

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .expect(401);

      expect(res.body.code).toBe('EMBED_TOKEN_MISSING');
    });
  });

  describe('AC7/AC8: Redis down', () => {
    it('debe retornar 503 si createSession falla (Redis caído entre validate y create)', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );
      mockBffSessions.createSession.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('connection lost')),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(503);

      expect(res.body.code).toBe('EMBED_SERVICE_UNAVAILABLE');
    });
  });

  describe('AC10: NO requiere X-Api-Key', () => {
    it('debe funcionar con solo Authorization header (sin X-Api-Key)', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: new Date().toISOString(),
        }),
      );
      mockBffSessions.createSession.mockResolvedValue(
        ok({ sessionId: SESSION_ID, expiresAt: EXPIRES_AT }),
      );

      await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(200);
    });
  });

  describe('Edge cases', () => {
    it('NO debe setear cookie si hay error', async () => {
      app = await buildApp(MockEmbedTokenGuard);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenNotFoundError('abc')),
      );

      const res = await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .expect(401);

      const cookies = res.headers['set-cookie'] as unknown as
        | string[]
        | undefined;
      const accessTokenCookie = cookies?.find((c) =>
        c.startsWith('access_token='),
      );
      expect(accessTokenCookie).toBeUndefined();
    });

    it('debe retornar 400 si body.userId no es UUID', async () => {
      app = await buildApp(MockEmbedTokenGuard);

      await request(app.getHttpServer())
        .post('/embed/authenticate-session')
        .set('Authorization', `Bearer ${VALID_TOKEN}`)
        .send({ userId: 'not-a-uuid' })
        .expect(400);
    });
  });
});
