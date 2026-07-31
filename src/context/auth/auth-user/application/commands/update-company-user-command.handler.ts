import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyUserCommand } from './update-company-user.command';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../../domain/user-account.repository';
import { KeycloakAdminService } from '../../infrastructure/services/keycloak-admin.service';
import { UserAccountRoles } from '../../domain/value-objects/user-account-roles';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CompanyUserNotFoundError,
  validateAssignableRoles,
} from '../errors/company-user.errors';

@CommandHandler(UpdateCompanyUserCommand)
export class UpdateCompanyUserCommandHandler
  implements ICommandHandler<UpdateCompanyUserCommand>
{
  private readonly logger = new Logger(UpdateCompanyUserCommandHandler.name);

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) {}

  async execute(
    command: UpdateCompanyUserCommand,
  ): Promise<Result<void, DomainError>> {
    const user = await this.userRepository.findById(command.userId);
    if (!user || user.companyId.getValue() !== command.companyId) {
      return err(new CompanyUserNotFoundError(command.userId));
    }

    if (command.roles !== undefined) {
      const rolesError = validateAssignableRoles(command.roles);
      if (rolesError) return err(rolesError);
    }

    let updated = user;
    if (command.name !== undefined && command.name.trim()) {
      updated = updated.updateName(command.name.trim());
    }
    if (command.roles !== undefined) {
      updated = updated.updateRoles(
        UserAccountRoles.fromPrimitives(command.roles),
      );
    }

    const kcId = updated.keycloakId;
    if (kcId.isPresent()) {
      const keycloakId = kcId.get().value;
      if (command.name !== undefined && command.name.trim()) {
        const profile = await this.keycloakAdmin.updateUserProfile(keycloakId, {
          name: command.name.trim(),
        });
        if (profile.isErr()) {
          this.logger.warn(
            `No se pudo sincronizar nombre en KC: ${profile.error.message}`,
          );
          return err(profile.error);
        }
      }
      if (command.roles !== undefined) {
        const roles = await this.keycloakAdmin.setRealmRoles(
          keycloakId,
          command.roles,
        );
        if (roles.isErr()) return err(roles.error);
      }
    } else {
      this.logger.warn(
        `Usuario ${command.userId} sin keycloakId; solo se actualiza BD`,
      );
    }

    await this.userRepository.save(updated);
    return okVoid();
  }
}
