import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { SetCompanyUserActiveCommand } from './set-company-user-active.command';
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

@CommandHandler(SetCompanyUserActiveCommand)
export class SetCompanyUserActiveCommandHandler
  implements ICommandHandler<SetCompanyUserActiveCommand>
{
  private readonly logger = new Logger(SetCompanyUserActiveCommandHandler.name);

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async execute(
    command: SetCompanyUserActiveCommand,
  ): Promise<Result<void, DomainError>> {
    const user = await this.userRepository.findById(command.userId);
    if (!user || user.companyId.getValue() !== command.companyId) {
      return err(new CompanyUserNotFoundError(command.userId));
    }

    if (this.isSelf(user, command.actorUserId, command.actorKeycloakId)) {
      return err(new CannotModifySelfError());
    }

    const updated = command.isActive ? user.activate() : user.deactivate();

    const kcId = user.keycloakId;
    if (kcId.isPresent()) {
      const kc = await this.keycloakAdmin.setEnabled(
        kcId.get().value,
        command.isActive,
      );
      if (kc.isErr()) return err(kc.error);
    } else {
      this.logger.warn(
        `Usuario ${command.userId} sin keycloakId; solo se actualiza isActive en BD`,
      );
    }

    await this.userRepository.save(updated);
    return okVoid();
  }

  private isSelf(
    user: { id: { getValue(): string }; keycloakId: { isPresent(): boolean; get(): { value: string } } },
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
    // DualAuth BFF: actorUserId suele ser el sub de Keycloak
    if (
      user.keycloakId.isPresent() &&
      user.keycloakId.get().value === actorUserId
    ) {
      return true;
    }
    return false;
  }
}
