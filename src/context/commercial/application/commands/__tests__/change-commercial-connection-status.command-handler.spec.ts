import { EventPublisher } from '@nestjs/cqrs';
import { ChangeCommercialConnectionStatusCommandHandler } from '../change-commercial-connection-status.command-handler';
import { ChangeCommercialConnectionStatusCommand } from '../change-commercial-connection-status.command';
import { CommercialConnectionDomainService } from '../../../domain/commercial-connection.domain-service';
import { CommercialRepository } from '../../../domain/commercial.repository';
import { CommercialConnectionSessionRepository } from '../../../domain/commercial-connection-session.repository';
import { Commercial } from '../../../domain/commercial.aggregate';
import { CommercialId } from '../../../domain/value-objects/commercial-id';
import { CommercialName } from '../../../domain/value-objects/commercial-name';
import { CommercialConnectionStatus } from '../../../domain/value-objects/commercial-connection-status';
import { ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

class SessionError extends DomainError {}

describe('ChangeCommercialConnectionStatusCommandHandler', () => {
  let handler: ChangeCommercialConnectionStatusCommandHandler;
  let connectionService: jest.Mocked<
    Pick<
      CommercialConnectionDomainService,
      'getCompanyIdByCommercial' | 'setConnectionStatus'
    >
  >;
  let commercialRepository: jest.Mocked<
    Pick<CommercialRepository, 'findById' | 'update'>
  >;
  let sessionRepository: jest.Mocked<
    Pick<CommercialConnectionSessionRepository, 'closeOpenSession'>
  >;

  const commercialId = Uuid.random().value;
  const companyId = Uuid.random().value;

  beforeEach(() => {
    const commercial = Commercial.create({
      id: new CommercialId(commercialId),
      name: new CommercialName('Ana Comercial'),
      connectionStatus: CommercialConnectionStatus.online(),
    });

    connectionService = {
      getCompanyIdByCommercial: jest.fn().mockResolvedValue(companyId),
      setConnectionStatus: jest.fn().mockResolvedValue(undefined),
    };

    commercialRepository = {
      findById: jest.fn().mockResolvedValue(ok(commercial)),
      update: jest.fn().mockResolvedValue(undefined),
    };

    sessionRepository = {
      closeOpenSession: jest.fn().mockResolvedValue(ok(null)),
    };

    const publisher = {
      mergeObjectContext: jest.fn((aggregate: { commit: () => void }) => {
        aggregate.commit = jest.fn();
        return aggregate;
      }),
    } as unknown as EventPublisher;

    handler = new ChangeCommercialConnectionStatusCommandHandler(
      connectionService as unknown as CommercialConnectionDomainService,
      commercialRepository as unknown as CommercialRepository,
      sessionRepository as unknown as CommercialConnectionSessionRepository,
      publisher,
    );
  });

  it('cierra la sesión de conexión al pasar a offline', async () => {
    await handler.execute(
      new ChangeCommercialConnectionStatusCommand(commercialId, 'offline'),
    );

    expect(sessionRepository.closeOpenSession).toHaveBeenCalledWith({
      commercialId,
      endReason: 'manual',
    });
  });

  it('no cierra la sesión al pasar a away ni a busy', async () => {
    await handler.execute(
      new ChangeCommercialConnectionStatusCommand(commercialId, 'away'),
    );
    await handler.execute(
      new ChangeCommercialConnectionStatusCommand(commercialId, 'busy'),
    );

    expect(sessionRepository.closeOpenSession).not.toHaveBeenCalled();
  });

  it('el cambio de estado sigue adelante si falla el cierre de la sesión', async () => {
    sessionRepository.closeOpenSession.mockResolvedValue(
      err(new SessionError('Mongo caído')),
    );

    await expect(
      handler.execute(
        new ChangeCommercialConnectionStatusCommand(commercialId, 'offline'),
      ),
    ).resolves.toBeUndefined();

    expect(connectionService.setConnectionStatus).toHaveBeenCalled();
  });
});
