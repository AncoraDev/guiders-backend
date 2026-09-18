import { StaleConnectionSessionScheduler } from '../stale-connection-session.scheduler';
import {
  CommercialConnectionSessionPrimitives,
  CommercialConnectionSessionRepository,
} from '../../../domain/commercial-connection-session.repository';
import { CommercialConnectionDomainService } from '../../../domain/commercial-connection.domain-service';
import { CommercialConnectionStatus } from '../../../domain/value-objects/commercial-connection-status';
import { CommercialLastActivity } from '../../../domain/value-objects/commercial-last-activity';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import { ok } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('StaleConnectionSessionScheduler', () => {
  let sessionRepository: jest.Mocked<
    Pick<
      CommercialConnectionSessionRepository,
      'listOpenSessions' | 'closeOpenSession'
    >
  >;
  let connectionService: jest.Mocked<
    Pick<
      CommercialConnectionDomainService,
      'getConnectionStatus' | 'getLastActivity'
    >
  >;
  let gateway: { isUserConnected: jest.Mock };

  const commercialId = Uuid.random().value;
  const HOUR_MS = 60 * 60 * 1000;

  /** Sesión abierta con una antigüedad suficiente para salir del margen. */
  function openSession(
    overrides: Partial<CommercialConnectionSessionPrimitives> = {},
  ): CommercialConnectionSessionPrimitives {
    return {
      id: Uuid.random().value,
      commercialId,
      companyId: Uuid.random().value,
      commercialDisplayName: 'Ana Comercial',
      startedAt: new Date(Date.now() - HOUR_MS),
      endedAt: null,
      durationMs: null,
      endReason: null,
      ...overrides,
    };
  }

  function buildScheduler(): StaleConnectionSessionScheduler {
    return new StaleConnectionSessionScheduler(
      sessionRepository as unknown as CommercialConnectionSessionRepository,
      connectionService as unknown as CommercialConnectionDomainService,
      gateway as unknown as WebSocketGatewayBasic,
    );
  }

  beforeEach(() => {
    sessionRepository = {
      listOpenSessions: jest.fn().mockResolvedValue(ok([openSession()])),
      closeOpenSession: jest.fn().mockResolvedValue(ok(null)),
    };

    connectionService = {
      getConnectionStatus: jest
        .fn()
        .mockResolvedValue(CommercialConnectionStatus.offline()),
      getLastActivity: jest
        .fn()
        .mockResolvedValue(CommercialLastActivity.now()),
    };

    gateway = { isUserConnected: jest.fn().mockReturnValue(false) };
  });

  it('cierra la sesión huérfana con motivo connection_lost', async () => {
    await buildScheduler().handleSweep();

    expect(sessionRepository.closeOpenSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commercialId,
        endReason: 'connection_lost',
      }),
    );
  });

  it('cierra con la última actividad conocida cuando ya es pasada', async () => {
    const lastActivity = new Date(Date.now() - HOUR_MS / 2);
    connectionService.getLastActivity.mockResolvedValue(
      new CommercialLastActivity(lastActivity),
    );

    await buildScheduler().handleSweep();

    expect(sessionRepository.closeOpenSession).toHaveBeenCalledWith(
      expect.objectContaining({ endedAt: lastActivity }),
    );
  });

  it('no cierra la sesión de un comercial con socket vivo', async () => {
    gateway.isUserConnected.mockReturnValue(true);

    await buildScheduler().handleSweep();

    expect(sessionRepository.closeOpenSession).not.toHaveBeenCalled();
  });

  it('no cierra la sesión de un comercial que sigue online en Redis', async () => {
    connectionService.getConnectionStatus.mockResolvedValue(
      CommercialConnectionStatus.online(),
    );

    await buildScheduler().handleSweep();

    expect(sessionRepository.closeOpenSession).not.toHaveBeenCalled();
  });

  it('respeta el margen de las sesiones recién abiertas', async () => {
    sessionRepository.listOpenSessions.mockResolvedValue(
      ok([openSession({ startedAt: new Date() })]),
    );

    await buildScheduler().handleSweep();

    expect(sessionRepository.closeOpenSession).not.toHaveBeenCalled();
  });

  it('sin sesiones abiertas no consulta la presencia', async () => {
    sessionRepository.listOpenSessions.mockResolvedValue(ok([]));

    await buildScheduler().handleSweep();

    expect(connectionService.getConnectionStatus).not.toHaveBeenCalled();
    expect(sessionRepository.closeOpenSession).not.toHaveBeenCalled();
  });
});
