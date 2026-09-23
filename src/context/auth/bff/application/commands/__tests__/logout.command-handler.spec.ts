import { Test } from '@nestjs/testing';
import { EventBus } from '@nestjs/cqrs';
import { ok, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

import {
  BFF_SESSION_SERVICE,
  IBffSessionService,
  CascadeRevokeResult,
} from '../../../domain/services/bff-session.service';
import { BffSessionData } from '../../../domain/value-objects/bff-session-data';
import {
  BffSessionCorruptedError,
  BffSessionInvalidFormatError,
  BffSessionNotFoundError,
  BffSessionServiceUnavailableError,
} from '../../../domain/errors/bff-session.errors';

import { LogoutCommand } from '../logout.command';
import { LogoutCommandHandler } from '../logout.command-handler';

describe('LogoutCommandHandler (unit) - Story 2.3', () => {
  let handler: LogoutCommandHandler;

  const mockBffSessions: jest.Mocked<IBffSessionService> = {
    createSession: jest.fn(),
    getSession: jest.fn(),
    revokeSession: jest.fn(),
    cascadeRevoke: jest.fn(),
  } as unknown as jest.Mocked<IBffSessionService>;

  const mockEventBus: jest.Mocked<EventBus> = {
    publish: jest.fn(),
  } as unknown as jest.Mocked<EventBus>;

  const sessionId = Uuid.random().value;
  const embedTokenRef = Uuid.random().value.replace(/-/g, '_').slice(0, 43);
  const userId = Uuid.random().value;
  const companyId = Uuid.random().value;

  const makeSession = (
    overrides: Partial<BffSessionData> = {},
  ): BffSessionData => ({
    userId,
    companyId,
    roles: ['admin'],
    createdAt: new Date().toISOString(),
    embedTokenRef,
    ...overrides,
  });

  const makeCommand = (overrides: Partial<LogoutCommand> = {}): LogoutCommand =>
    new LogoutCommand(
      overrides.sessionId ?? sessionId,
      overrides.ipAddress ?? '127.0.0.1',
      overrides.userAgent ?? 'jest-test/1.0',
      overrides.origin ?? 'https://app.leadcars.com',
    );

  const cascadeResult = (
    sessionDeleted: 0 | 1,
    tokenDeleted: 0 | 1,
  ): CascadeRevokeResult => ({ sessionDeleted, tokenDeleted });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LogoutCommandHandler,
        { provide: BFF_SESSION_SERVICE, useValue: mockBffSessions },
        { provide: EventBus, useValue: mockEventBus },
      ],
    }).compile();

    handler = moduleRef.get(LogoutCommandHandler);
    jest.clearAllMocks();
  });

  describe('AC1 — happy path (success)', () => {
    it('debe retornar ok con cascadingResult=success cuando cascade retorna {1, 1}', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(1, 1)));

      const result = await handler.execute(makeCommand());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cascadingResult.toJSON()).toBe('success');
        expect(result.value.sessionId).toBe(sessionId);
        expect(result.value.embedTokenRevoked).toBe(true);
      }
    });

    it('debe emitir EmbedTokenAuthenticatedEvent con cascadingResult=success y embedTokenRevoked=true', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(1, 1)));

      await handler.execute(makeCommand());

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const ev = mockEventBus.publish.mock.calls[0][0] as any;
      expect(ev.attributes.cascadingResult).toBe('success');
      expect(ev.attributes.embedTokenRevoked).toBe(true);
      expect(ev.attributes.failureDetail).toBeUndefined();
      expect(ev.attributes.logoutTimestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });
  });

  describe('AC5 — partial revocation (token already gone)', () => {
    it('debe retornar ok con cascadingResult=partial cuando cascade retorna {1, 0}', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(1, 0)));

      const result = await handler.execute(makeCommand());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cascadingResult.toJSON()).toBe('partial');
        expect(result.value.embedTokenRevoked).toBe(false);
      }
    });

    it('debe emitir failureDetail="partial: token already revoked" en el event (AC5.4 spec literal)', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(1, 0)));

      await handler.execute(makeCommand());

      const ev = mockEventBus.publish.mock.calls[0][0] as any;
      expect(ev.attributes.cascadingResult).toBe('partial');
      expect(ev.attributes.failureDetail).toBe(
        'partial: token already revoked',
      );
    });
  });

  describe('AC2 — idempotency (2nd call = 200 OK)', () => {
    it('debe retornar ok con cascadingResult=not_found cuando session no existe (2da llamada)', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionNotFoundError(sessionId.slice(0, 8))),
      );

      const result = await handler.execute(makeCommand());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cascadingResult.toJSON()).toBe('not_found');
        expect(result.value.embedTokenRevoked).toBe(false);
      }
    });

    it('NO debe emitir failure event cuando session no existe (AC2.2: avoid alert noise)', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionNotFoundError()),
      );

      await handler.execute(makeCommand());

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('NO debe llamar a cascadeRevoke cuando session no existe', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionNotFoundError()),
      );

      await handler.execute(makeCommand());

      expect(mockBffSessions.cascadeRevoke).not.toHaveBeenCalled();
    });
  });

  describe('AC3 — invalid sessionId format', () => {
    it('debe retornar err con BffSessionInvalidFormatError cuando sessionId no es base64url 43 chars', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionInvalidFormatError()),
      );

      const result = await handler.execute(makeCommand({ sessionId: 'AAAA' }));

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(BffSessionInvalidFormatError);
      }
    });

    it('debe emitir failure event con reason=EMBED_SESSION_NOT_FOUND', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionInvalidFormatError()),
      );

      await handler.execute(makeCommand({ sessionId: 'AAAA' }));

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      const ev = mockEventBus.publish.mock.calls[0][0] as any;
      expect(ev.attributes.failureReason).toBe('EMBED_SESSION_NOT_FOUND');
    });
  });

  describe('Redis down on getSession', () => {
    it('debe retornar err con BffSessionServiceUnavailableError', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('Connection refused')),
      );

      const result = await handler.execute(makeCommand());

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(BffSessionServiceUnavailableError);
      }
    });

    it('debe emitir failure event con EMBED_SERVICE_UNAVAILABLE + message específico (AI-3)', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        err(
          new BffSessionServiceUnavailableError(
            'Connection refused at 10.0.0.5:6379',
          ),
        ),
      );

      await handler.execute(makeCommand());

      const ev = mockEventBus.publish.mock.calls[0][0] as any;
      expect(ev.attributes.failureReason).toBe('EMBED_SERVICE_UNAVAILABLE');
      expect(ev.attributes.failureDetail).toContain('Connection refused');
    });
  });

  describe('Redis down on cascadeRevoke (mid-operation)', () => {
    it('debe retornar err cuando cascadeRevoke falla (session NO tocada, atómico)', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('OOM during EVAL')),
      );

      const result = await handler.execute(makeCommand());

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(BffSessionServiceUnavailableError);
      }
    });

    it('debe emitir failure event con EMBED_SERVICE_UNAVAILABLE', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(
        err(new BffSessionServiceUnavailableError('OOM')),
      );

      await handler.execute(makeCommand());

      const ev = mockEventBus.publish.mock.calls[0][0] as any;
      expect(ev.attributes.failureReason).toBe('EMBED_SERVICE_UNAVAILABLE');
      expect(ev.attributes.failureDetail).toContain('OOM');
    });
  });

  describe('TA-4 — tryPublish wrapper (eventBus.publish throw)', () => {
    it('debe retornar ok incluso si eventBus.publish throws', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(1, 1)));
      mockEventBus.publish.mockImplementation(() => {
        throw new Error('EventBus down');
      });

      const result = await handler.execute(makeCommand());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cascadingResult.toJSON()).toBe('success');
      }
    });
  });

  describe('N6 — BffSessionCorruptedError (data corruption incident)', () => {
    it('debe clasificar BffSessionCorruptedError como EMBED_SERVICE_UNAVAILABLE (no UNKNOWN_ERROR)', async () => {
      // Arrange: getSession retorna BffSessionCorruptedError (JSON inválido en Redis)
      mockBffSessions.getSession.mockResolvedValue(
        err(new BffSessionCorruptedError()),
      );

      // Act
      const result = await handler.execute(makeCommand());

      // Assert
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        // AI-3: instanceof específico (no instanceof BaseError)
        expect(result.error).toBeInstanceOf(BffSessionCorruptedError);
      }

      // N6 fix: el failure event debe usar EMBED_SERVICE_UNAVAILABLE
      // (incidente de seguridad, no error genérico)
      const ev = mockEventBus.publish.mock.calls[0][0] as any;
      expect(ev.attributes.failureReason).toBe('EMBED_SERVICE_UNAVAILABLE');
      expect(ev.attributes.failureDetail).toContain('Data corruption');
    });
  });

  describe('edge cases', () => {
    it('debe manejar session legacy sin embedTokenRef (cascadeRevoke con undefined)', async () => {
      mockBffSessions.getSession.mockResolvedValue(
        ok(makeSession({ embedTokenRef: '' })),
      );
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(1, 0)));

      const result = await handler.execute(makeCommand());

      expect(result.isOk()).toBe(true);
      expect(mockBffSessions.cascadeRevoke).toHaveBeenCalledWith(
        sessionId,
        undefined,
      );
    });

    it('debe clasificar como not_found cuando cascade retorna {0, 0}', async () => {
      mockBffSessions.getSession.mockResolvedValue(ok(makeSession()));
      mockBffSessions.cascadeRevoke.mockResolvedValue(ok(cascadeResult(0, 0)));

      const result = await handler.execute(makeCommand());

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.cascadingResult.toJSON()).toBe('not_found');
      }
    });
  });
});
