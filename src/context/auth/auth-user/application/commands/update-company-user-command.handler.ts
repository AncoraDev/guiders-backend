import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { UpdateCompanyUserCommand } from './update-company-user.command';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../../domain/user-account.repository';
import {
  KeycloakAdminService,
  KeycloakUserExistsError,
} from '../../infrastructure/services/keycloak-admin.service';
import { UserAccountEmail } from '../../domain/user-account-email';
import { UserAccountRoles } from '../../domain/value-objects/user-account-roles';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CompanyUserEmailExistsError,
  CompanyUserKeycloakMissingError,
  CompanyUserNotFoundError,
  InvalidCompanyUserDataError,
  InvalidCompanyUserPasswordError,
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

    const nextPassword = command.password?.trim();
    if (
      nextPassword !== undefined &&
      nextPassword.length > 0 &&
      nextPassword.length < 6
    ) {
      return err(
        new InvalidCompanyUserPasswordError(
          'La contraseña debe tener al menos 6 caracteres',
        ),
      );
    }

    let updated = user;
    if (command.email !== undefined) {
      const email = command.email.trim().toLowerCase();
      if (!email) {
        return err(new InvalidCompanyUserDataError('El email es obligatorio'));
      }
      if (!UserAccountEmail.validate(email)) {
        return err(new InvalidCompanyUserDataError('El email no es válido'));
      }
      if (email !== user.email.getValue()) {
        const existing = await this.userRepository.findByEmail(email);
        if (existing && existing.id.getValue() !== user.id.getValue()) {
          return err(new CompanyUserEmailExistsError(email));
        }

        const kcExisting = await this.keycloakAdmin.findByEmail(email);
        if (kcExisting.isErr()) return err(kcExisting.error);
        const kcUser = kcExisting.unwrap();
        const currentKcId = user.keycloakId.isPresent()
          ? user.keycloakId.get().value
          : null;
        if (kcUser && kcUser.id !== currentKcId) {
          return err(new CompanyUserEmailExistsError(email));
        }

        const kcByUsername = await this.keycloakAdmin.findByUsername(email);
        if (kcByUsername.isErr()) return err(kcByUsername.error);
        const kcNamed = kcByUsername.unwrap();
        if (kcNamed && kcNamed.id !== currentKcId) {
          return err(new CompanyUserEmailExistsError(email));
        }

        updated = updated.updateEmail(email);
      }
    }
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
      const nextName =
        command.name !== undefined && command.name.trim()
          ? command.name.trim()
          : undefined;
      // Siempre el email de Guiders: si el username de Keycloak sigue siendo
      // el email antiguo, el PUT los alinea y libera esa dirección.
      const profile = await this.keycloakAdmin.updateUserProfile(keycloakId, {
        email: updated.email.getValue(),
        ...(nextName ? { name: nextName } : {}),
      });
      if (profile.isErr()) {
        this.logger.warn(
          `No se pudo sincronizar perfil en KC: ${profile.error.message}`,
        );
        if (profile.error instanceof KeycloakUserExistsError) {
          return err(new CompanyUserEmailExistsError(updated.email.getValue()));
        }
        return err(profile.error);
      }
      if (command.roles !== undefined) {
        const roles = await this.keycloakAdmin.setRealmRoles(
          keycloakId,
          command.roles,
        );
        if (roles.isErr()) return err(roles.error);
      }
      if (nextPassword) {
        const pwd = await this.keycloakAdmin.setPermanentPassword(
          keycloakId,
          nextPassword,
        );
        if (pwd.isErr()) return err(pwd.error);
      }
    } else {
      if (nextPassword) {
        return err(new CompanyUserKeycloakMissingError(command.userId));
      }
      this.logger.warn(
        `Usuario ${command.userId} sin keycloakId; solo se actualiza BD`,
      );
    }

    await this.userRepository.save(updated);
    return okVoid();
  }
}
