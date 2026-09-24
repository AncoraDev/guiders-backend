import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, okVoid, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import {
  EXTERNAL_COMMERCIAL_LINK_REPOSITORY,
  ExternalCommercialLinkRepository,
  LEADCARS_PROVIDER,
} from '../../domain/repository/external-commercial-link.repository';
import { RemoveCommercialFromExternalCommand } from './remove-commercial-from-external.command';
import { ExternalCommercialSyncError } from '../../domain/errors/external-commercial-sync.errors';

/**
 * Borra el vínculo y la cuenta de Guiders de un comercial externo.
 * No toca chats, mensajes ni leads. Estas cuentas no tienen Keycloak.
 */
@Injectable()
@CommandHandler(RemoveCommercialFromExternalCommand)
export class RemoveCommercialFromExternalCommandHandler
  implements ICommandHandler<RemoveCommercialFromExternalCommand>
{
  private readonly logger = new Logger(
    RemoveCommercialFromExternalCommandHandler.name,
  );

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    @Inject(EXTERNAL_COMMERCIAL_LINK_REPOSITORY)
    private readonly links: ExternalCommercialLinkRepository,
  ) {}

  async execute(
    command: RemoveCommercialFromExternalCommand,
  ): Promise<Result<void, DomainError>> {
    const externalUserId = command.externalUserId.trim();
    if (!externalUserId || externalUserId.length > 128) {
      return err(
        new ExternalCommercialSyncError(
          'EXTERNAL_USER_INVALID',
          'externalUserId es obligatorio (máximo 128 caracteres)',
        ),
      );
    }

    const link = await this.links.findByExternalUserId(
      command.companyId,
      externalUserId,
      LEADCARS_PROVIDER,
    );
    if (!link) {
      return err(
        new ExternalCommercialSyncError(
          'EXTERNAL_USER_NOT_FOUND',
          'No hay un comercial vinculado con ese id',
        ),
      );
    }

    const user = await this.users.findById(link.userAccountId);
    if (user && user.companyId.getValue() !== command.companyId) {
      return err(
        new ExternalCommercialSyncError(
          'EXTERNAL_USER_OTHER_COMPANY',
          'La cuenta vinculada pertenece a otra empresa',
        ),
      );
    }

    if (user) {
      await this.users.delete(user.id.getValue());
    } else {
      this.logger.warn(
        `Vínculo ${externalUserId} sin cuenta de Guiders; solo se elimina el vínculo`,
      );
    }

    await this.links.deleteByExternalUserId(
      command.companyId,
      externalUserId,
      LEADCARS_PROVIDER,
    );
    return okVoid();
  }
}
