import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import * as request from 'supertest';
import { EmbedController } from '../src/context/auth/integration-api-key/infrastructure/controllers/embed.controller';
import { CreateEmbedTokenCommandHandler } from '../src/context/auth/integration-api-key/application/commands/create-embed-token.command-handler';
import { CreateEmbedTokenCommand } from '../src/context/auth/integration-api-key/application/commands/create-embed-token.command';
import {
  IntegrationApiKeyGuard,
  IntegrationApiKeyRequest,
} from '../src/context/auth/integration-api-key/infrastructure/integration-api-key.guard';
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
import { WhiteLabelConfig } from '../src/context/white-label/domain/entities/white-label-config';
import { UserAccount } from '../src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountId } from '../src/context/auth/auth-user/domain/user-account-id';
import { UserAccountEmail } from '../src/context/auth/auth-user/domain/user-account-email';
import { UserAccountName } from '../src/context/auth/auth-user/domain/value-objects/user-account-name';
import { UserAccountPassword } from '../src/context/auth/auth-user/domain/user-account-password';
import { UserAccountCompanyId } from '../src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { UserAccountRoles } from '../src/context/auth/auth-user/domain/value-objects/user-account-roles';
import { UserAccountIsActive } from '../src/context/auth/auth-user/domain/value-objects/user-account-is-active';
import { Role } from '../src/context/auth/auth-user/domain/value-objects/role';
import { ok, err } from '../src/context/shared/domain/result';
import { WhiteLabelConfigNotFoundError } from '../src/context/white-label/domain/errors/white-label.error';
import { EmbedTokenForbiddenError } from '../src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import { Uuid } from '../src/context/shared/domain/value-objects/uuid';

/**
 * E2E tests para Story 1.3 — POST /v2/integration/embed/start.
 *
 * Estrategia:
 * - Mockeamos `IntegrationApiKeyGuard` para inyectar `req.integrationApiKey`
 *   determinísticamente (no dependemos de headers reales).
 * - Mockeamos `IWhiteLabelConfigRepository`, `UserAccountRepository` y
 *   `IEmbedTokenService` para controlar el comportamiento de cada AC.
 * - NO usamos base de datos ni Redis real.
 *
 * Aceptance Criteria cubiertos:
 *  - AC#1 → happy path 200 con { token, expiresAt }
 *  - AC#2 → embed deshabilitado 403 EMBED_DISABLED_FOR_TENANT
 *  - AC#3 → usuario no pertenece a empresa 403 EMBED_USER_NOT_IN_TENANT
 *  - AC#4 → API key inválida 401 (delegado al guard)
 *  - AC#5 → tenant mismatch 403 EMBED_TENANT_MISMATCH
 */
class MockIntegrationApiKeyGuard {
  private readonly companyId: string;

  constructor(companyId: string) {
    this.companyId = companyId;
  }

  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<IntegrationApiKeyRequest>();
    req.integrationApiKey = {
      id: Uuid.random().value,
      companyId: this.companyId,
      environment: 'live',
    };
    return true;
  }
}

class RejectingIntegrationApiKeyGuard {
  canActivate(): boolean {
    throw new (require('@nestjs/common').UnauthorizedException)(
      'API Key de integración requerida en el header x-api-key',
    );
  }
}

describe('POST /v2/integration/embed/start - Story 1.3 (e2e)', () => {
  let app: INestApplication;
  let mockWhiteLabelRepo: jest.Mocked<IWhiteLabelConfigRepository>;
  let mockUserRepo: jest.Mocked<UserAccountRepository>;
  let mockEmbedTokens: jest.Mocked<IEmbedTokenService>;

  const API_KEY_COMPANY_ID = Uuid.random().value;
  const BODY_COMPANY_ID = Uuid.random().value;
  const USER_ID = Uuid.random().value;
  const FAKE_TOKEN = 'a'.repeat(43);
  const EXPIRES_AT = '2026-06-12T22:32:00.000Z';

  function buildWhiteLabelConfig(
    companyId: string,
    embedEnabled: boolean,
  ): WhiteLabelConfig {
    return WhiteLabelConfig.create({
      id: Uuid.random().value,
      companyId,
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
      embedAllowedOrigins: embedEnabled ? ['https://app.integrator.com'] : [],
    });
  }

  function buildUserAccount(targetCompanyId: string): UserAccount {
    return UserAccount.create({
      id: new UserAccountId(USER_ID),
      email: new UserAccountEmail('user@example.com'),
      name: new UserAccountName('Test User'),
      password: new UserAccountPassword(null),
      roles: UserAccountRoles.fromRoles([Role.fromPrimitives('admin')]),
      companyId: new UserAccountCompanyId(targetCompanyId),
      isActive: new UserAccountIsActive(true),
    });
  }

  async function buildApp(
    guard:
      | typeof MockIntegrationApiKeyGuard
      | typeof RejectingIntegrationApiKeyGuard,
    guardFactoryArgs: string[] = [],
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
        // Story 1.4: refresh handler is required because EmbedController has both
        // start and refresh endpoints. We only test /start here, but Nest needs
        // the dep wired to instantiate the controller. We never call /refresh in
        // these tests so this provider is never invoked.
        {
          provide:
            require('../src/context/auth/integration-api-key/application/commands/refresh-embed-token.command-handler')
              .RefreshEmbedTokenCommandHandler,
          useValue: { execute: jest.fn() },
        },
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
      .useValue(
        guardFactoryArgs.length === 0
          ? new RejectingIntegrationApiKeyGuard()
          : new MockIntegrationApiKeyGuard(guardFactoryArgs[0]),
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
    it('debería devolver 200 con { token, expiresAt } cuando todo es válido', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(API_KEY_COMPANY_ID, true)),
      );
      mockUserRepo.findById.mockResolvedValue(
        buildUserAccount(API_KEY_COMPANY_ID),
      );
      mockEmbedTokens.createToken.mockResolvedValue(
        ok({ token: FAKE_TOKEN, expiresAt: EXPIRES_AT }),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: API_KEY_COMPANY_ID })
        .expect(200);

      // Assert
      expect(response.body).toEqual({
        token: FAKE_TOKEN,
        expiresAt: EXPIRES_AT,
      });
    });
  });

  describe('AC#2 — embed deshabilitado', () => {
    it('debería devolver 403 con code EMBED_DISABLED_FOR_TENANT cuando embedEnabled=false', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(API_KEY_COMPANY_ID, false)),
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: API_KEY_COMPANY_ID })
        .expect(403);

      // Assert
      expect(response.body.code).toBe('EMBED_DISABLED_FOR_TENANT');
    });
  });

  describe('AC#3 — usuario no pertenece a la empresa', () => {
    it('debería devolver 403 con code EMBED_USER_NOT_IN_TENANT cuando el usuario pertenece a otra empresa', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(API_KEY_COMPANY_ID, true)),
      );
      mockUserRepo.findById.mockResolvedValue(
        buildUserAccount(Uuid.random().value), // different company
      );

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: API_KEY_COMPANY_ID })
        .expect(403);

      // Assert
      expect(response.body.code).toBe('EMBED_USER_NOT_IN_TENANT');
    });

    it('debería devolver 403 con code EMBED_USER_NOT_IN_TENANT cuando el usuario no existe', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(API_KEY_COMPANY_ID, true)),
      );
      mockUserRepo.findById.mockResolvedValue(null);

      // Act
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: API_KEY_COMPANY_ID })
        .expect(403);

      // Assert
      expect(response.body.code).toBe('EMBED_USER_NOT_IN_TENANT');
    });
  });

  describe('AC#4 — API key inválida (delegado al guard)', () => {
    it('debería devolver 401 cuando el guard rechaza la API Key', async () => {
      // Arrange: use the rejecting guard
      app = await buildApp(RejectingIntegrationApiKeyGuard, []);

      // Act
      await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: API_KEY_COMPANY_ID })
        .expect(401);
    });
  });

  describe('AC#5 — tenant mismatch (API key companyId !== body companyId)', () => {
    it('debería devolver 403 con code EMBED_TENANT_MISMATCH cuando el body companyId no coincide con el de la API key', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);

      // Act: body usa BODY_COMPANY_ID (diferente del API_KEY_COMPANY_ID)
      const response = await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: BODY_COMPANY_ID })
        .expect(403);

      // Assert
      expect(response.body.code).toBe('EMBED_TENANT_MISMATCH');
    });
  });

  describe('validación de DTO (400)', () => {
    it('debería devolver 400 cuando el body no contiene userId', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);

      // Act
      await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ companyId: API_KEY_COMPANY_ID })
        .expect(400);
    });

    it('debería devolver 400 cuando el body no contiene companyId', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);

      // Act
      await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID })
        .expect(400);
    });

    it('debería devolver 400 cuando userId no es un UUID válido', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);

      // Act
      await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: 'not-a-uuid', companyId: API_KEY_COMPANY_ID })
        .expect(400);
    });

    it('debería devolver 400 cuando companyId no es un UUID válido', async () => {
      // Arrange
      app = await buildApp(MockIntegrationApiKeyGuard, [API_KEY_COMPANY_ID]);

      // Act
      await request(app.getHttpServer())
        .post('/v2/integration/embed/start')
        .send({ userId: USER_ID, companyId: 'not-a-uuid' })
        .expect(400);
    });
  });
});
