import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { DeleteCompanyUserCommand } from './delete-company-user.command';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../../domain/user-account.repository';
import { KeycloakAdminService } from '../../infrastructure/services/keycloak-admin.service';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CannotModifySelfError,
  CompanyUserNotFoundError,
} from '../errors/company-user.errors';
import { UserAccount } from '../../domain/user-account.aggregate';

@CommandHandler(DeleteCompanyUserCommand)
export class DeleteCompanyUserCommandHandler
  implements ICommandHandler<DeleteCompanyUserCommand>
{
  private readonly logger = new Logger(DeleteCompanyUserCommandHandler.name);

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async execute(
    command: DeleteCompanyUserCommand,
  ): Promise<Result<void, DomainError>> {
    const user = await this.userRepository.findById(command.userId);
    if (!user || user.companyId.getValue() !== command.companyId) {
      return err(new CompanyUserNotFoundError(command.userId));
    }

    if (this.isSelf(user, command.actorUserId, command.actorKeycloakId)) {
      return err(new CannotModifySelfError());
    }

    // Keycloak primero
    if (user.keycloakId.isPresent()) {
      const kc = await this.keycloakAdmin.deleteUser(
        user.keycloakId.get().value,
      );
      if (kc.isErr()) return err(kc.error);
    } else {
      this.logger.warn(
        `Usuario ${command.userId} sin keycloakId; solo se elimina de BD`,
      );
    }

    await this.userRepository.delete(user.id.getValue());
    return okVoid();
  }

  private isSelf(
    user: UserAccount,
    actorUserId: string,
    actorKeycloakId: string | null,
  ): boolean {
    if (user.id.getValue() === actorUserId) return true;
    if (
      actorKeycloakId &&
      user.keycloakId.isPresent() &&
      user.keycloakId.get().value === actorKeycloakId
    ) {
      return true;
    }
    if (
      user.keycloakId.isPresent() &&
      user.keycloakId.get().value === actorUserId
    ) {
      return true;
    }
    return false;
  }
}
