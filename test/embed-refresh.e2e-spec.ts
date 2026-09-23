import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import * as request from 'supertest';
import { EmbedController } from '../src/context/auth/integration-api-key/infrastructure/controllers/embed.controller';
import { RefreshEmbedTokenCommandHandler } from '../src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler';
import { CreateEmbedTokenCommandHandler } from '../src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from '../src/context/white-label/domain/white-label-config.repository';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../src/context/auth/auth-user/domain/user-account.repository';
import {
  EMBED_TOKEN_SERVICE,
  IEmbedTokenService,
} from '../src/context/auth/integration-api-key/domain/services/embed-token.service';
import {
  IntegrationApiKeyGuard,
  IntegrationApiKeyRequest,
} from '../src/context/auth/integration-api-key/infrastructure/integration-api-key.guard';
import {
  EmbedTokenGuard,
  EmbedTokenRequest,
} from '../src/context/auth/integration-api-key/infrastructure/guards/embed-token.guard';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenCorruptedError,
  EmbedTokenError,
} from '../src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import { WhiteLabelConfig } from '../src/context/white-label/domain/entities/white-label-config';
import { ok, err } from '../src/context/shared/domain/result';
import { Uuid } from '../src/context/shared/domain/value-objects/uuid';

/**
 * E2E tests para Story 1.4 — POST /v2/integration/embed/refresh.
 *
 * Estrategia:
 * - Mockeamos `IntegrationApiKeyGuard` (el controller ya está protegido
 *   por éste globalmente) para que pase siempre.
 * - Mockeamos `EmbedTokenGuard` (nuevo en este story) para controlar
 *   la presencia/formato del header `Authorization: Bearer <token>`.
 * - Mockeamos `IEmbedTokenService` y `IWhiteLabelConfigRepository`
 *   para simular los escenarios de cada AC.
 * - NO usamos base de datos ni Redis real.
 *
 * Aceptance Criteria cubiertos:
 *  - AC#1 → happy path 200 con { token, expiresAt }
 *  - AC#2 → token expirado/inválido 401 con EMBED_TOKEN_EXPIRED/EMBED_TOKEN_INVALID
 *  - AC#3 → userId mismatch en body 403 con EMBED_TOKEN_USER_MISMATCH
 */
class MockIntegrationApiKeyGuard {
  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IntegrationApiKeyRequest>();
    req.integrationApiKey = {
      id: Uuid.random().value,
      companyId: Uuid.random().value,
      environment: 'live',
    };
    return true;
  }
}

/**
 * Mock del EmbedTokenGuard que inyecta `req.embedToken` con un valor
 * configurable. El flag `withHeader` permite simular la presencia o
 * ausencia del header Authorization.
 */
class MockEmbedTokenGuard {
  private readonly token: string | null;
  private readonly withHeader: boolean;

  constructor(token: string | null, withHeader = true) {
    this.token = token;
    this.withHeader = withHeader;
  }

  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    if (!this.withHeader) {
      throw new UnauthorizedException({
        code: 'EMBED_TOKEN_MISSING',
        message: 'Authorization Bearer <token> requerido',
        statusCode: 401,
      });
    }
    const req = context.switchToHttp().getRequest<EmbedTokenRequest>();
    req.embedToken = this.token as string;
    return true;
  }
}

/**
 * Variante del mock que siempre rechaza (para test de guard
 * retorna EMBED_TOKEN_INVALID en formato).
 */
class RejectingEmbedTokenGuard {
  canActivate(): boolean {
    throw new UnauthorizedException({
      code: 'EMBED_TOKEN_INVALID',
      message: 'Formato de token inválido',
      statusCode: 401,
    });
  }
}

describe('POST /v2/integration/embed/refresh - Story 1.4 (e2e)', () => {
  let app: INestApplication;
  let mockWhiteLabelRepo: jest.Mocked<IWhiteLabelConfigRepository>;
  let mockUserRepo: jest.Mocked<UserAccountRepository>;
  let mockEmbedTokens: jest.Mocked<IEmbedTokenService>;

  const COMPANY_ID = Uuid.random().value;
  const USER_ID = Uuid.random().value;
  const OTHER_USER_ID = Uuid.random().value;
  const OLD_TOKEN = 'a'.repeat(43);
  const NEW_TOKEN = 'b'.repeat(43);
  const EXPIRES_AT = '2026-06-12T22:32:00.000Z';
  const TOKEN_CREATED_AT = '2026-06-12T14:00:00.000Z';

  function buildWhiteLabelConfig(embedEnabled: boolean): WhiteLabelConfig {
    return WhiteLabelConfig.create({
      id: Uuid.random().value,
      companyId: COMPANY_ID,
      colors: {
        primary: '#000',
        secondary: '#000',
        tertiary: '#000',
        background: '#000',
        surface: '#000',
        text: '#000',
        textMuted: '#000',
      },
      branding: {
        logoUrl: null,
        faviconUrl: null,
        brandName: 'Test Brand',
      },
      typography: {
        fontFamily: 'Inter',
        customFontName: null,
        customFontFiles: [],
      },
      theme: 'light',
      embedEnabled,
      embedAllowedOrigins: embedEnabled ? ['https://app.example.com'] : [],
    });
  }

  async function buildApp(
    embedGuard: typeof MockEmbedTokenGuard | typeof RejectingEmbedTokenGuard,
    guardFactoryArgs: (string | null | boolean)[] = [OLD_TOKEN, true],
  ): Promise<INestApplication> {
    mockWhiteLabelRepo = {
      save: jest.fn(),
      findByCompanyId: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
    };
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByKeycloakId: jest.fn(),
      save: jest.fn(),
      findByCompanyId: jest.fn(),
    };
    mockEmbedTokens = {
      createToken: jest.fn(),
      validateToken: jest.fn(),
      refreshToken: jest.fn(),
      revokeToken: jest.fn(),
      revokeTokenWithCount: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [EmbedController],
      providers: [
        CreateEmbedTokenCommandHandler,
        RefreshEmbedTokenCommandHandler,
        {
          provide: WHITE_LABEL_CONFIG_REPOSITORY,
          useValue: mockWhiteLabelRepo,
        },
        {
          provide: USER_ACCOUNT_REPOSITORY,
          useValue: mockUserRepo,
        },
        {
          provide: EMBED_TOKEN_SERVICE,
          useValue: mockEmbedTokens,
        },
      ],
    })
      .overrideGuard(IntegrationApiKeyGuard)
      .useValue(new MockIntegrationApiKeyGuard())
      .overrideGuard(EmbedTokenGuard)
      .useValue(
        embedGuard === RejectingEmbedTokenGuard
          ? new RejectingEmbedTokenGuard()
          : new MockEmbedTokenGuard(
              guardFactoryArgs[0] as string | null,
              guardFactoryArgs[1] as boolean,
            ),
      )
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
    if (app) {
      await app.close();
    }
  });

  describe('AC#1 — happy path', () => {
    it('debería devolver 200 con { token, expiresAt } cuando el token es válido y embed está habilitado', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockEmbedTokens.refreshToken.mockResolvedValue(
        ok({ token: NEW_TOKEN, expiresAt: EXPIRES_AT }),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        token: NEW_TOKEN,
        expiresAt: EXPIRES_AT,
      });
    });
  });

  describe('AC#2 — token inválido/expirado (delegado al guard)', () => {
    it('debería devolver 401 con code EMBED_TOKEN_MISSING cuando no hay header Authorization', async () => {
      // Arrange: guard con withHeader=false simula "no header"
      app = await buildApp(MockEmbedTokenGuard, [null, false]);

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .send({})
        .expect(401);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_MISSING');
    });

    it('debería devolver 401 con code EMBED_TOKEN_INVALID cuando el formato del token no es válido', async () => {
      // Arrange: rejecting guard simula formato inválido
      app = await buildApp(RejectingEmbedTokenGuard, []);

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', 'Bearer short-token')
        .send({})
        .expect(401);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_INVALID');
    });
  });

  describe('AC#2 — token inválido/expirado (handler)', () => {
    it('debería devolver 401 con code EMBED_TOKEN_EXPIRED cuando el token no existe en Redis', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenNotFoundError(OLD_TOKEN.substring(0, 8))),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(401);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_EXPIRED');
    });

    it('debería devolver 401 con code EMBED_TOKEN_INVALID cuando el JSON en Redis está corrupto', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenCorruptedError()),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(401);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_INVALID');
    });

    it('debería devolver 503 con code EMBED_SERVICE_UNAVAILABLE cuando validateToken retorna EmbedTokenError genérico (Redis down)', async () => {
      // F10 fix (Story 2.2 retro): EmbedTokenError genérico = Redis down, NO token inválido.
      // El handler propaga el error y el controller lo mapea a 503 EMBED_SERVICE_UNAVAILABLE.
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenError('Redis down')),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(503);

      // Assert
      expect(response.body.code).toBe('EMBED_SERVICE_UNAVAILABLE');
    });

    it('debería devolver 401 con code EMBED_TOKEN_INVALID cuando validateToken retorna EmbedTokenInvalidFormatError', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenInvalidFormatError()),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(401);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_INVALID');
    });
  });

  describe('AC#2 — embed deshabilitado (revoke flow)', () => {
    it('debería devolver 401 con code EMBED_TOKEN_EXPIRED cuando embedEnabled=false para el companyId del token', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(false)),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(401);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_EXPIRED');
    });
  });

  describe('AC#3 — user mismatch (defensivo, body userId vs token userId)', () => {
    it('debería devolver 403 con code EMBED_TOKEN_USER_MISMATCH cuando el body tiene userId distinto al del token', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );

      // Act: body con userId DIFERENTE
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({ userId: OTHER_USER_ID })
        .expect(403);

      // Assert
      expect(response.body.code).toBe('EMBED_TOKEN_USER_MISMATCH');
    });

    it('debería devolver 200 cuando el body tiene userId IGUAL al del token (no hay mismatch)', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockEmbedTokens.refreshToken.mockResolvedValue(
        ok({ token: NEW_TOKEN, expiresAt: EXPIRES_AT }),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({ userId: USER_ID })
        .expect(200);

      // Assert
      expect(response.body.token).toBe(NEW_TOKEN);
      expect(response.body.expiresAt).toBe(EXPIRES_AT);
    });

    it('debería devolver 200 cuando el body NO tiene userId (campo opcional)', async () => {
      // Arrange
      app = await buildApp(MockEmbedTokenGuard, [OLD_TOKEN, true]);
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockEmbedTokens.refreshToken.mockResolvedValue(
        ok({ token: NEW_TOKEN, expiresAt: EXPIRES_AT }),
      );

      // Act: body sin userId
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/refresh')
        .set('Authorization', `Bearer ${OLD_TOKEN}`)
        .send({})
        .expect(200);

      // Assert
      expect(response.body.token).toBe(NEW_TOKEN);
    });
  });
});
