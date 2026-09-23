/**
 * Tests del AuthenticateEmbedSessionCommandHandler (Story 2.1, Task 3.2).
 *
 * Estrategia: mocks de `IEmbedTokenService` y `IBffSessionService` con
 * `jest.Mocked<T>`. El handler orquesta 3 pasos (validateToken → body
 * match → createSession) y los tests validan cada path.
 */

import { AuthenticateEmbedSessionCommandHandler } from '../authenticate-embed-session.command-handler';
import { AuthenticateEmbedSessionCommand } from '../authenticate-embed-session.command';
import { IEmbedTokenService } from 'src/context/auth/integration-api-key/domain/services/embed-token.service';
import { IBffSessionService } from '../../../domain/services/bff-session.service';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenError,
} from 'src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import {
  BffSessionServiceUnavailableError,
  EmbedBodyTokenMismatchError,
} from '../../../domain/errors/bff-session.errors';
import { ok, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('AuthenticateEmbedSessionCommandHandler - Story 2.1', () => {
  let handler: AuthenticateEmbedSessionCommandHandler;
  let mockEmbedTokens: jest.Mocked<IEmbedTokenService>;
  let mockBffSessions: jest.Mocked<IBffSessionService>;

  const VALID_TOKEN = 'A'.repeat(43);
  const USER_ID = Uuid.random().value;
  const COMPANY_ID = Uuid.random().value;
  const ROLES = ['admin'];

  beforeEach(() => {
    mockEmbedTokens = {
      createToken: jest.fn(),
      validateToken: jest.fn(),
      refreshToken: jest.fn(),
      revokeToken: jest.fn(),
    } as unknown as jest.Mocked<IEmbedTokenService>;

    mockBffSessions = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      revokeSession: jest.fn(),
    } as unknown as jest.Mocked<IBffSessionService>;

    handler = new AuthenticateEmbedSessionCommandHandler(
      mockEmbedTokens,
      mockBffSessions,
      { publish: jest.fn() } as any, // Story 2.2: EventBus mock
    );
  });

  describe('camino feliz', () => {
    it('debe establecer sesión BFF con token válido y sin body', async () => {
      // T13 (code review Story 2.1): usamos createdAt fijo y distinguible
      // para verificar que el handler PROPAGA el del token (no lo sobrescribe
      // con new Date().toISOString() en la creación de la session). Invariante
      // crítico para audit trail y cascading revocation en Story 2.3.
      const FIXED_CREATED_AT = '2020-01-01T00:00:00.000Z';
      const tokenData = {
        userId: USER_ID,
        companyId: COMPANY_ID,
        roles: ROLES,
        createdAt: FIXED_CREATED_AT,
      };
      const sessionIssued = {
        sessionId: 'B'.repeat(43),
        expiresAt: new Date(Date.now() + 28800 * 1000).toISOString(),
      };
      mockEmbedTokens.validateToken.mockResolvedValue(ok(tokenData));
      mockBffSessions.createSession.mockResolvedValue(ok(sessionIssued));

      const command = new AuthenticateEmbedSessionCommand(VALID_TOKEN);
      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.sessionId).toBe(sessionIssued.sessionId);
        expect(result.value.expiresAt).toBe(sessionIssued.expiresAt);
      }
      // El handler debe pasar el embedToken como embedTokenRef
      expect(mockBffSessions.createSession).toHaveBeenCalledWith(
        {
          userId: USER_ID,
          companyId: COMPANY_ID,
          roles: ROLES,
          createdAt: FIXED_CREATED_AT,
        },
        VALID_TOKEN,
      );
    });

    it('debe establecer sesión BFF con body coincidente (userId + companyId)', async () => {
      const tokenData = {
        userId: USER_ID,
        companyId: COMPANY_ID,
        roles: ROLES,
        createdAt: new Date().toISOString(),
      };
      const sessionIssued = {
        sessionId: 'C'.repeat(43),
        expiresAt: new Date().toISOString(),
      };
      mockEmbedTokens.validateToken.mockResolvedValue(ok(tokenData));
      mockBffSessions.createSession.mockResolvedValue(ok(sessionIssued));

      const command = new AuthenticateEmbedSessionCommand(
        VALID_TOKEN,
        USER_ID,
        COMPANY_ID,
      );
      const result = await handler.execute(command);

      expect(result.isOk()).toBe(true);
    });

    it('debe propagar embedTokenRef correcto en createSession (el token original)', async () => {
      const tokenData = {
        userId: USER_ID,
        companyId: COMPANY_ID,
        roles: ROLES,
        createdAt: new Date().toISOString(),
      };
      const sessionIssued = {
        sessionId: 'D'.repeat(43),
        expiresAt: new Date().toISOString(),
      };
      mockEmbedTokens.validateToken.mockResolvedValue(ok(tokenData));
      mockBffSessions.createSession.mockResolvedValue(ok(sessionIssued));

      const command = new AuthenticateEmbedSessionCommand(VALID_TOKEN);
      await handler.execute(command);

      const callArgs = mockBffSessions.createSession.mock.calls[0];
      expect(callArgs[1]).toBe(VALID_TOKEN);
      // NO debe pasar el sessionId como embedTokenRef
      expect(callArgs[1]).not.toBe(sessionIssued.sessionId);
    });
  });

  describe('defense-in-depth: body mismatch', () => {
    it('debe retornar EmbedBodyTokenMismatchError si body.userId != token.userId', async () => {
      const tokenData = {
        userId: USER_ID,
        companyId: COMPANY_ID,
        roles: ROLES,
        createdAt: new Date().toISOString(),
      };
      mockEmbedTokens.validateToken.mockResolvedValue(ok(tokenData));

      const command = new AuthenticateEmbedSessionCommand(
        VALID_TOKEN,
        Uuid.random().value, // otro userId
      );
      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedBodyTokenMismatchError);
      }
      // No debe llamar a createSession
      expect(mockBffSessions.createSession).not.toHaveBeenCalled();
    });

    it('debe retornar EmbedBodyTokenMismatchError si body.companyId != token.companyId', async () => {
      const tokenData = {
        userId: USER_ID,
        companyId: COMPANY_ID,
        roles: ROLES,
        createdAt: new Date().toISOString(),
      };
      mockEmbedTokens.validateToken.mockResolvedValue(ok(tokenData));

      const command = new AuthenticateEmbedSessionCommand(
        VALID_TOKEN,
        undefined,
        Uuid.random().value, // otro companyId
      );
      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedBodyTokenMismatchError);
      }
    });
  });

  describe('errores del embed token', () => {
    it('debe retornar EmbedTokenNotFoundError si validateToken retorna NotFound', async () => {
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenNotFoundError('abc...')),
      );

      const command = new AuthenticateEmbedSessionCommand(VALID_TOKEN);
      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenNotFoundError);
      }
      expect(mockBffSessions.createSession).not.toHaveBeenCalled();
    });

    it('debe retornar EmbedTokenInvalidFormatError si validateToken retorna InvalidFormat', async () => {
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenInvalidFormatError()),
      );

      const command = new AuthenticateEmbedSessionCommand(VALID_TOKEN);
      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenInvalidFormatError);
      }
    });

    it('debe propagar EmbedTokenError si validateToken retorna error genérico', async () => {
      mockEmbedTokens.validateToken.mockResolvedValue(
        err(new EmbedTokenError('redis down')),
      );

      const command = new AuthenticateEmbedSessionCommand(VALID_TOKEN);
      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(EmbedTokenError);
      }
    });
  });

  describe('errores de la BFF session', () => {
    it('debe retornar BffSessionServiceUnavailableError si createSession falla (Redis down)', async () => {
      const tokenData = {
        userId: USER_ID,
        companyId: COMPANY_ID,
        roles: ROLES,
        createdAt: new Date().toISOString(),
      };
      mockEmbedTokens.validateToken.mockResolvedValue(ok(tokenData));
      mockBffSessions.createSession.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('connection lost')),
      );

      const command = new AuthenticateEmbedSessionCommand(VALID_TOKEN);
      const result = await handler.execute(command);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(BffSessionServiceUnavailableError);
      }
    });
  });
});
