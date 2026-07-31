import { CommandHandler, ICommandHandler, EventPublisher } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { CreateCompanyUserCommand } from './create-company-user.command';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from '../../domain/user-account.repository';
import { KeycloakAdminService } from '../../infrastructure/services/keycloak-admin.service';
import { UserAccount } from '../../domain/user-account.aggregate';
import { UserAccountEmail } from '../../domain/user-account-email';
import { UserAccountName } from '../../domain/value-objects/user-account-name';
import { UserAccountPassword } from '../../domain/user-account-password';
import { UserAccountCompanyId } from '../../domain/value-objects/user-account-company-id';
import { UserAccountRoles } from '../../domain/value-objects/user-account-roles';
import { UserAccountKeycloakId } from '../../domain/value-objects/user-account-keycloak-id';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CompanyUserEmailExistsError,
  CompanyUserPersistError,
  InvalidCompanyUserDataError,
  InvalidCompanyUserPasswordError,
  validateAssignableRoles,
} from '../errors/company-user.errors';

/** Mínimo para la temporal; la política fuerte la aplica Keycloak en el cambio obligatorio. */
const TEMP_PASSWORD_MIN_LENGTH = 6;

@CommandHandler(CreateCompanyUserCommand)
export class CreateCompanyUserCommandHandler
  implements ICommandHandler<CreateCompanyUserCommand>
{
  private readonly logger = new Logger(CreateCompanyUserCommandHandler.name);

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: CreateCompanyUserCommand,
  ): Promise<Result<{ userId: string }, DomainError>> {
    const rolesError = validateAssignableRoles(command.roles);
    if (rolesError) return err(rolesError);

    const firstName = command.firstName.trim();
    const lastName = command.lastName.trim();
    if (!firstName || !lastName) {
      return err(
        new InvalidCompanyUserDataError('Nombre y apellidos son obligatorios'),
      );
    }

    const password = command.temporaryPassword?.trim() ?? '';
    if (password.length < TEMP_PASSWORD_MIN_LENGTH) {
      return err(
        new InvalidCompanyUserPasswordError(
          `La contraseña temporal debe tener al menos ${TEMP_PASSWORD_MIN_LENGTH} caracteres`,
        ),
      );
    }

    const email = command.email.trim().toLowerCase();
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      return err(new CompanyUserEmailExistsError(email));
    }

    const kcExisting = await this.keycloakAdmin.findByEmail(email);
    if (kcExisting.isErr()) return err(kcExisting.error);
    if (kcExisting.unwrap()) {
      return err(new CompanyUserEmailExistsError(email));
    }

    const displayName = `${firstName} ${lastName}`.trim();

    // 1. Keycloak primero (evitar huérfano en BD) — sin email; password temporal
    const createKc = await this.keycloakAdmin.createUser({
      email,
      firstName,
      lastName,
      temporaryPassword: password,
      phone: command.phone?.trim() || undefined,
      enabled: true,
    });
    if (createKc.isErr()) return err(createKc.error);
    const keycloakId = createKc.unwrap();

    const rolesKc = await this.keycloakAdmin.setRealmRoles(
      keycloakId,
      command.roles,
    );
    if (rolesKc.isErr()) {
      this.logger.warn(
        `Roles KC fallaron tras crear ${email}; se intenta rollback KC`,
      );
      await this.keycloakAdmin.deleteUser(keycloakId);
      return err(rolesKc.error);
    }

    // 2. Persistencia local (password vacío en BD; vive solo en Keycloak)
    try {
      const user = UserAccount.create({
        email: UserAccountEmail.create(email),
        name: new UserAccountName(displayName),
        password: UserAccountPassword.empty(),
        roles: UserAccountRoles.fromPrimitives(command.roles),
        companyId: UserAccountCompanyId.create(command.companyId),
        keycloakId: UserAccountKeycloakId.fromString(keycloakId),
      });

      const aggregate = this.publisher.mergeObjectContext(user);
      await this.userRepository.save(aggregate);
      aggregate.commit();

      return ok({ userId: user.id.getValue() });
    } catch (e) {
      this.logger.error(
        `Error guardando usuario en BD tras crear en KC; rollback KC ${keycloakId}`,
        e,
      );
      await this.keycloakAdmin.deleteUser(keycloakId);
      if (e instanceof DomainError) {
        return err(e);
      }
      return err(
        new CompanyUserPersistError(
          e instanceof Error
            ? e.message
            : 'Error persistiendo el usuario en Guiders',
        ),
      );
    }
  }
}
