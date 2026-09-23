import { RefreshEmbedTokenCommandHandler } from '../refresh-embed-token.command-handler';
import { RefreshEmbedTokenCommand } from '../refresh-embed-token.command';
import { IWhiteLabelConfigRepository } from 'src/context/white-label/domain/white-label-config.repository';
import { IEmbedTokenService } from '../../../domain/services/embed-token.service';
import {
  EmbedTokenExpiredError,
  EmbedTokenInvalidError,
} from '../../../domain/errors/embed-token.errors';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenCorruptedError,
  EmbedTokenError,
} from '../../../domain/errors/embed-token.errors';
import { WhiteLabelConfig } from 'src/context/white-label/domain/entities/white-label-config';
import { WhiteLabelConfigNotFoundError } from 'src/context/white-label/domain/errors/white-label.error';
import { ok, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

/**
 * Tests del command handler `RefreshEmbedTokenCommandHandler` (Story 1.4).
 *
 * Cubre los Acceptance Criteria #1, #2, #3 del story.
 * Las dependencias (EmbedTokenService + WhiteLabelConfigRepository) se
 * mockean con `jest.Mocked<T>` — no se toca MongoDB ni Redis.
 *
 * Notas de seguridad:
 * - El orden de validaciones es: validateToken PRIMERO (no leak de
 *   existencia) y luego embedEnabled (defense in depth).
 * - Si el token no existe → EMBED_TOKEN_EXPIRED (mismo error que si
 *   existe pero la empresa desactivó embed, para no distinguir).
 */
describe('RefreshEmbedTokenCommandHandler', () => {
  let handler: RefreshEmbedTokenCommandHandler;
  let mockWhiteLabelRepo: jest.Mocked<IWhiteLabelConfigRepository>;
  let mockEmbedTokens: jest.Mocked<IEmbedTokenService>;

  const companyId = Uuid.random().value;
  const userId = Uuid.random().value;
  const OLD_TOKEN = 'a'.repeat(43);
  const NEW_TOKEN = 'b'.repeat(43);
  const EXPIRES_AT = '2026-06-12T22:32:00.000Z';

  const TOKEN_CREATED_AT = '2026-06-12T14:00:00.000Z';

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

  beforeEach(() => {
    mockWhiteLabelRepo = {
      save: jest.fn(),
      findByCompanyId: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn(),
    };

    mockEmbedTokens = {
      createToken: jest.fn(),
      validateToken: jest.fn(),
      refreshToken: jest.fn(),
      revokeToken: jest.fn(),
      revokeTokenWithCount: jest.fn(),
    };

    handler = new RefreshEmbedTokenCommandHandler(
      mockEmbedTokens,
      mockWhiteLabelRepo,
      { publish: jest.fn() } as any, // Story 2.2: EventBus mock
    );
  });

  describe('AC#1 — happy path', () => {
    it('debería retornar ok con nuevo token y expiresAt cuando el token es válido y embed está habilitado', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId,
          companyId,
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

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.token).toBe(NEW_TOKEN);
        expect(result.value.expiresAt).toBe(EXPIRES_AT);
      }
    });

    it('debería llamar a EmbedTokenService.refreshToken con el token del command', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId,
          companyId,
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

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      await handler.execute(command);

      // Assert
      expect(mockEmbedTokens.refreshToken).toHaveBeenCalledTimes(1);
      expect(mockEmbedTokens.refreshToken).toHaveBeenCalledWith(OLD_TOKEN);
    });

    it('debería generar un nuevo token con valor distinto al viejo (subtask 8.8)', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId,
          companyId,
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

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.token).not.toBe(OLD_TOKEN);
        expect(result.value.token).toBe(NEW_TOKEN);
      }
    });
  });

  describe('AC#2 — token inválido o expirado', () => {
    it('debería retornar err(EmbedTokenExpiredError) cuando validateToken retorna EmbedTokenNotFoundError', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenNotFoundError(OLD_TOKEN.substring(0, 8))),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenExpiredError);
        expect((result.error as EmbedTokenExpiredError).code).toBe(
          'EMBED_TOKEN_EXPIRED',
        );
      }
      // No debe intentar refresh si el token no existe
      expect(mockEmbedTokens.refreshToken).not.toHaveBeenCalled();
    });

    it('debería retornar err(EmbedTokenInvalidError) cuando validateToken retorna EmbedTokenInvalidFormatError', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenInvalidFormatError()),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenInvalidError);
        expect((result.error as EmbedTokenInvalidError).code).toBe(
          'EMBED_TOKEN_INVALID',
        );
      }
      expect(mockEmbedTokens.refreshToken).not.toHaveBeenCalled();
    });

    it('debería retornar err(EmbedTokenInvalidError) cuando validateToken retorna EmbedTokenCorruptedError (JSON malformado)', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenCorruptedError()),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenInvalidError);
        expect((result.error as EmbedTokenInvalidError).code).toBe(
          'EMBED_TOKEN_INVALID',
        );
      }
      expect(mockEmbedTokens.refreshToken).not.toHaveBeenCalled();
    });

    it('debería retornar err(EmbedTokenError) genérico cuando validateToken retorna EmbedTokenError (no envolver)', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenError('Redis down')),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenError);
        expect((result.error as EmbedTokenError).message).toContain(
          'Redis down',
        );
      }
      expect(mockEmbedTokens.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('AC#2 — embed deshabilitado para el tenant (revoke flow)', () => {
    it('debería retornar err(EmbedTokenExpiredError) cuando embedEnabled=false para el companyId del token', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId,
          companyId,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(false)),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenExpiredError);
        expect((result.error as EmbedTokenExpiredError).code).toBe(
          'EMBED_TOKEN_EXPIRED',
        );
      }
      expect(mockEmbedTokens.refreshToken).not.toHaveBeenCalled();
    });

    it('debería retornar err(EmbedTokenExpiredError) cuando no existe white_label_config para el companyId (safe default)', async () => {
      // Arrange
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId,
          companyId,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        err(new WhiteLabelConfigNotFoundError(companyId)),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenExpiredError);
        expect((result.error as EmbedTokenExpiredError).code).toBe(
          'EMBED_TOKEN_EXPIRED',
        );
      }
      expect(mockEmbedTokens.refreshToken).not.toHaveBeenCalled();
    });
  });

  describe('propagación de errores del EmbedTokenService.refreshToken', () => {
    it('debería propagar el err cuando EmbedTokenService.refreshToken falla (e.g. Redis Lua falló)', async () => {
      // Arrange
      const redisError = new EmbedTokenError(
        'Error al refrescar embed token: ECONNREFUSED',
      );
      mockEmbedTokens.validateToken.mockResolvedValue(
        ok({
          userId,
          companyId,
          roles: ['admin'],
          createdAt: TOKEN_CREATED_AT,
        }),
      );
      mockWhiteLabelRepo.findByCompanyId.mockResolvedValue(
        ok(buildWhiteLabelConfig(true)),
      );
      mockEmbedTokens.refreshToken.mockResolvedValue(err(redisError));

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

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
    it('debería chequear validateToken ANTES de embedEnabled (no leak de existencia)', async () => {
      // Arrange: token inválido Y embed deshabilitado
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenNotFoundError(OLD_TOKEN.substring(0, 8))),
      );

      const command = new RefreshEmbedTokenCommand(OLD_TOKEN);

      // Act
      await handler.execute(command);

      // Assert: nunca debe llegar a chequear white_label_configs
      expect(mockWhiteLabelRepo.findByCompanyId).not.toHaveBeenCalled();
    });
  });
});
