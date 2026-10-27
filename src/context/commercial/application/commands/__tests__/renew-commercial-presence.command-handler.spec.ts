import { RenewCommercialPresenceCommandHandler } from '../renew-commercial-presence.command-handler';
import { RenewCommercialPresenceCommand } from '../renew-commercial-presence.command';
import { CommercialConnectionDomainService } from '../../../domain/commercial-connection.domain-service';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('RenewCommercialPresenceCommandHandler', () => {
  const commercialId = Uuid.random().value;
  const companyId = Uuid.random().value;

  let handler: RenewCommercialPresenceCommandHandler;
  let connectionService: jest.Mocked<
    Pick<CommercialConnectionDomainService, 'renewOnlinePresence'>
  >;

  beforeEach(() => {
    connectionService = {
      renewOnlinePresence: jest.fn(),
    };
    handler = new RenewCommercialPresenceCommandHandler(
      connectionService as unknown as CommercialConnectionDomainService,
    );
  });

  it('renueva a quien sigue en Conectado', async () => {
    connectionService.renewOnlinePresence.mockResolvedValue(true);

    const renewed = await handler.execute(
      new RenewCommercialPresenceCommand(commercialId, companyId),
    );

    expect(renewed).toBe(true);
    expect(connectionService.renewOnlinePresence).toHaveBeenCalledWith(
      expect.objectContaining({ value: commercialId }),
      companyId,
    );
  });

  it('no enciende a quien ya está desconectado', async () => {
    connectionService.renewOnlinePresence.mockResolvedValue(false);

    const renewed = await handler.execute(
      new RenewCommercialPresenceCommand(commercialId, companyId),
    );

    expect(renewed).toBe(false);
  });
});
