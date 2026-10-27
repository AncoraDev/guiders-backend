import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RenewCommercialPresenceCommand } from './renew-commercial-presence.command';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../../domain/commercial-connection.domain-service';
import { CommercialId } from '../../domain/value-objects/commercial-id';

/**
 * Mantiene en el chat a quien sigue con el interruptor en Conectado.
 */
@CommandHandler(RenewCommercialPresenceCommand)
export class RenewCommercialPresenceCommandHandler
  implements ICommandHandler<RenewCommercialPresenceCommand, boolean>
{
  constructor(
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connectionService: CommercialConnectionDomainService,
  ) {}

  execute(command: RenewCommercialPresenceCommand): Promise<boolean> {
    return this.connectionService.renewOnlinePresence(
      new CommercialId(command.commercialId),
      command.companyId,
    );
  }
}
