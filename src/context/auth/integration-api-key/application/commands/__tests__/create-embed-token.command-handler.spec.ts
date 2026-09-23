import { CreateEmbedTokenCommandHandler } from '../create-embed-token.command-handler';
import { CreateEmbedTokenCommand } from '../create-embed-token.command';
import { IWhiteLabelConfigRepository } from 'src/context/white-label/domain/white-label-config.repository';
import { UserAccountRepository } from 'src/context/auth/auth-user/domain/user-account.repository';
import { IEmbedTokenService } from '../../../domain/services/embed-token.service';
import { EmbedTokenForbiddenError } from '../../../domain/errors/embed-token.errors';
import { WhiteLabelConfig } from 'src/context/white-label/domain/entities/white-label-config';
import { WhiteLabelConfigNotFoundError } from 'src/context/white-label/domain/errors/white-label.error';
import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountEmail } from 'src/context/auth/auth-user/domain/user-account-email';
import { UserAccountPassword } from 'src/context/auth/auth-user/domain/user-account-password';
import { UserAccountId } from 'src/context/auth/auth-user/domain/user-account-id';
import { UserAccountCompanyId } from 'src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { UserAccountRoles } from 'src/context/auth/auth-user/domain/value-objects/user-account-roles';
import { UserAccountIsActive } from 'src/context/auth/auth-user/domain/value-objects/user-account-is-active';
import { UserAccountName } from 'src/context/auth/auth-user/domain/value-objects/user-account-name';
import { Role } from 'src/context/auth/auth-user/domain/value-objects/role';
import { ok, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { EmbedTokenError } from '../../../domain/errors/embed-token.errors';

/**
 * Tests del command handler `CreateEmbedTokenCommandHandler` (Story 1.3).
 *
 * Cubre los Acceptance Criteria #1, #2, #3, #5 del story.
 * Las dependencias (repos + service) se mockean con `jest.Mocked<T>` —
 * no se toca MongoDB ni Redis.
 */
describe('CreateEmbedTokenCommandHandler', () => {
  let handler: CreateEmbedTokenCommandHandler;
  let mockWhiteLabelRepo: jest.Mocked<IWhiteLabelConfigRepository>;
  let mockUserRepo: jest.Mocked<UserAccountRepository>;
  let mockEmbedTokens: jest.Mocked<IEmbedTokenService>;

  const companyId = Uuid.random().value;
  const otherCompanyId = Uuid.random().value;
  const userId = Uuid.random().value;

  const EXPIRES_AT = '2026-06-12T22:32:00.000Z';
  const FAKE_TOKEN = 'a'.repeat(43); // 43 chars base64url válidos

  function buildWhiteLabelConfig(embedEnabled: boolean): WhiteLabelConfig {
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
      embedAllowedOrigins: embedEnabled ? ['https://app.example.com'] : [],
    });
  }

  function buildUserAccount(roles: string[]): UserAccount {
    return UserAccount.create({
      id: new UserAccountId(userId),
      email: new UserAccountEmail('user@example.com'),
      name: new UserAccountName('Test User'),
      password: new UserAccountPassword(null),
      roles: UserAccountRoles.fromRoles(
        roles.map((r) => Role.fromPrimitives(r)),
      ),
      companyId: new UserAccountCompanyId(companyId),
      isActive: new UserAccountIsActive(true),
    });
  }

  beforeEach(() => {
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

    handler = new CreateEmbedTokenCommandHandler(
      mockWhiteLabelRepo,
      mockUserRepo,
      mockEmbedTokens,
      { publish: jest.fn() } as any, // Story 2.2: EventBus mock
    );
  });

  describe('AC#1 — happy path', () => {
    it('debería retornar ok con token y expiresAt cuando embed está habilitado y el usuario pertenece a la empresa', async () => {
      // Arrange
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockUserRepo.findById.mockResolvedValue(buildUserAccount(['admin']));
      mockEmbedTokens.createToken.mockResolvedValue(
        ok({ token: FAKE_TOKEN, expiresAt: EXPIRES_AT }),
      );

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isOk()).toBe(true);
      const value = result.unwrap();
      expect(value.token).toBe(FAKE_TOKEN);
      expect(value.expiresAt).toBe(EXPIRES_AT);
    });

    it('debería propagar al EmbedTokenService los roles del usuario (subtask 2.4)', async () => {
      // Arrange
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockUserRepo.findById.mockResolvedValue(
        buildUserAccount(['admin', 'commercial']),
      );
      mockEmbedTokens.createToken.mockResolvedValue(
        ok({ token: FAKE_TOKEN, expiresAt: EXPIRES_AT }),
      );

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      await handler.execute(command);

      // Assert
      expect(mockEmbedTokens.createToken).toHaveBeenCalledTimes(1);
      const callArgs = mockEmbedTokens.createToken.mock.calls[0];
      expect(callArgs[0]).toBe(companyId);
      expect(callArgs[1]).toBe(userId);
      expect(callArgs[2]).toEqual(
        expect.arrayContaining(['admin', 'commercial']),
      );
    });
  });

  describe('AC#2 — embed deshabilitado', () => {
    it('debería retornar err con código EMBED_DISABLED_FOR_TENANT cuando embedEnabled=false', async () => {
      // Arrange
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(false)),
      );

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenForbiddenError);
        expect((result.error as EmbedTokenForbiddenError).code).toBe(
          'EMBED_DISABLED_FOR_TENANT',
        );
      }
    });

    it('debería retornar err con código EMBED_DISABLED_FOR_TENANT cuando la config de white_label_configs no existe (safe default)', async () => {
      // Arrange
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        err(new WhiteLabelConfigNotFoundError(companyId)),
      );

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenForbiddenError);
        expect((result.error as EmbedTokenForbiddenError).code).toBe(
          'EMBED_DISABLED_FOR_TENANT',
        );
      }
      // No debe intentar buscar al usuario ni emitir token
      expect(mockUserRepo.findById).not.toHaveBeenCalled();
      expect(mockEmbedTokens.createToken).not.toHaveBeenCalled();
    });
  });

  describe('AC#3 — usuario no pertenece a la empresa', () => {
    it('debería retornar err con código EMBED_USER_NOT_IN_TENANT cuando el usuario no existe', async () => {
      // Arrange
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockUserRepo.findById.mockResolvedValue(null);

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenForbiddenError);
        expect((result.error as EmbedTokenForbiddenError).code).toBe(
          'EMBED_USER_NOT_IN_TENANT',
        );
      }
      expect(mockEmbedTokens.createToken).not.toHaveBeenCalled();
    });

    it('debería retornar err con código EMBED_USER_NOT_IN_TENANT cuando el usuario pertenece a otra empresa', async () => {
      // Arrange
      const userFromOtherTenant = UserAccount.create({
        id: new UserAccountId(userId),
        email: new UserAccountEmail('user@example.com'),
        name: new UserAccountName('Test User'),
        password: new UserAccountPassword(null),
        roles: UserAccountRoles.fromRoles([Role.fromPrimitives('admin')]),
        companyId: new UserAccountCompanyId(otherCompanyId),
        isActive: new UserAccountIsActive(true),
      });

      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockUserRepo.findById.mockResolvedValue(userFromOtherTenant);

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenForbiddenError);
        expect((result.error as EmbedTokenForbiddenError).code).toBe(
          'EMBED_USER_NOT_IN_TENANT',
        );
      }
      expect(mockEmbedTokens.createToken).not.toHaveBeenCalled();
    });
  });

  describe('propagación de errores del EmbedTokenService', () => {
    it('debería retornar err cuando EmbedTokenService.createToken falla (e.g. Redis caído)', async () => {
      // Arrange
      const redisError = new EmbedTokenError(
        'Error al crear embed token: ECONNREFUSED',
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockUserRepo.findById.mockResolvedValue(buildUserAccount(['admin']));
      mockEmbedTokens.createToken.mockResolvedValue(err(redisError));

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(redisError);
      }
    });
  });

  describe('orden de validaciones (seguridad)', () => {
    it('debería chequear embedEnabled ANTES de buscar al usuario (no leak de existencia)', async () => {
      // Arrange: embed deshabilitado Y usuario inexistente
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(false)),
      );

      const command = new CreateEmbedTokenCommand(userId, companyId);

      // Act
      await handler.execute(command);

      // Assert: nunca llega a buscar al usuario
      expect(mockUserRepo.findById).not.toHaveBeenCalled();
    });
  });
});
