import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { ValidationError } from 'src/context/shared/domain/validation.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import { UserAccount } from 'src/context/auth/auth-user/domain/user-account.aggregate';
import { UserAccountEmail } from 'src/context/auth/auth-user/domain/user-account-email';
import { UserAccountName } from 'src/context/auth/auth-user/domain/value-objects/user-account-name';
import { UserAccountPassword } from 'src/context/auth/auth-user/domain/user-account-password';
import { UserAccountCompanyId } from 'src/context/auth/auth-user/domain/value-objects/user-account-company-id';
import { UserAccountRoles } from 'src/context/auth/auth-user/domain/value-objects/user-account-roles';
import { validateAssignableRoles } from 'src/context/auth/auth-user/application/errors/company-user.errors';
import {
  EXTERNAL_COMMERCIAL_LINK_REPOSITORY,
  ExternalCommercialLinkRepository,
  LEADCARS_PROVIDER,
} from '../../domain/repository/external-commercial-link.repository';
import {
  SyncCommercialFromExternalCommand,
  SyncCommercialFromExternalResult,
} from './sync-commercial-from-external.command';
import { ExternalCommercialSyncError } from '../../domain/errors/external-commercial-sync.errors';

/**
 * Alta, cambio y baja de un comercial de LeadCars en Guiders.
 * No crea usuario en Keycloak: el acceso es el iframe (embed token).
 * El `userId` devuelto es el UUID de Guiders que LeadCars debe guardar
 * para POST /v2/integration/embed/start.
 */
@Injectable()
@CommandHandler(SyncCommercialFromExternalCommand)
export class SyncCommercialFromExternalCommandHandler
  implements ICommandHandler<SyncCommercialFromExternalCommand>
{
  private readonly logger = new Logger(
    SyncCommercialFromExternalCommandHandler.name,
  );

  constructor(
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly users: UserAccountRepository,
    @Inject(EXTERNAL_COMMERCIAL_LINK_REPOSITORY)
    private readonly links: ExternalCommercialLinkRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: SyncCommercialFromExternalCommand,
  ): Promise<Result<SyncCommercialFromExternalResult, DomainError>> {
    const externalUserId = command.externalUserId.trim();
    const email = command.email.trim().toLowerCase();
    const firstName = command.firstName.trim();
    const lastName = command.lastName.trim();
    const displayName = `${firstName} ${lastName}`.trim();

    if (!externalUserId || externalUserId.length > 128) {
      return err(
        new ExternalCommercialSyncError(
          'EXTERNAL_USER_INVALID',
          'externalUserId es obligatorio (máximo 128 caracteres)',
        ),
      );
    }
    if (!displayName) {
      return err(
        new ExternalCommercialSyncError(
          'EXTERNAL_USER_INVALID',
          'El nombre es obligatorio',
        ),
      );
    }

    const rolesError = validateAssignableRoles(command.roles);
    if (rolesError) return err(rolesError);

    let emailVo: UserAccountEmail;
    let nameVo: UserAccountName;
    try {
      emailVo = new UserAccountEmail(email);
      nameVo = new UserAccountName(displayName);
    } catch (error) {
      const message =
        error instanceof ValidationError
          ? error.message
          : 'Datos de usuario inválidos';
      return err(
        new ExternalCommercialSyncError('EXTERNAL_USER_INVALID', message),
      );
    }

    const existingLink = await this.links.findByExternalUserId(
      command.companyId,
      externalUserId,
    );

    let user: UserAccount | null = null;
    let created = false;

    if (existingLink) {
      user = await this.users.findById(existingLink.userAccountId);
      if (!user || user.companyId.value !== command.companyId) {
        return err(
          new ExternalCommercialSyncError(
            'EXTERNAL_USER_OTHER_COMPANY',
            'El vínculo apunta a un usuario de otra empresa',
          ),
        );
      }
    } else {
      const byEmail = await this.users.findByEmail(emailVo.value);
      if (byEmail) {
        if (byEmail.companyId.value !== command.companyId) {
          return err(
            new ExternalCommercialSyncError(
              'EXTERNAL_USER_EMAIL_TAKEN',
              `Ya existe un usuario con el email ${email} en otra empresa`,
            ),
          );
        }
        user = byEmail;
      }
    }

    if (!user) {
      const taken = await this.users.findByEmail(emailVo.value);
      if (taken) {
        return err(
          new ExternalCommercialSyncError(
            'EXTERNAL_USER_EMAIL_TAKEN',
            `Ya existe un usuario con el email ${email}`,
          ),
        );
      }

      user = UserAccount.create({
        email: emailVo,
        name: nameVo,
        password: UserAccountPassword.empty(),
        roles: UserAccountRoles.fromPrimitives(command.roles),
        companyId: new UserAccountCompanyId(command.companyId),
        keycloakId: null,
      });
      created = true;
    } else {
      if (user.email.value !== emailVo.value) {
        const taken = await this.users.findByEmail(emailVo.value);
        if (taken && taken.id.value !== user.id.value) {
          return err(
            new ExternalCommercialSyncError(
              'EXTERNAL_USER_EMAIL_TAKEN',
              `Ya existe un usuario con el email ${email}`,
            ),
          );
        }
        user = user.updateEmail(emailVo.value);
      }
      if (user.name.value !== nameVo.value) {
        user = user.updateName(nameVo.value);
      }
      const currentRoles = [...user.roles.toPrimitives()].sort().join(',');
      const nextRoles = [...command.roles].sort().join(',');
      if (currentRoles !== nextRoles) {
        user = user.updateRoles(UserAccountRoles.fromPrimitives(command.roles));
      }
      if (command.active && !user.isActive) {
        user = user.activate();
      }
      if (!command.active && user.isActive) {
        user = user.deactivate();
      }
    }

    if (created && !command.active) {
      user = user.deactivate();
    }

    const aggregate = this.publisher.mergeObjectContext(user);
    try {
      await this.users.save(aggregate);
    } catch (error) {
      this.logger.error(
        `No se pudo guardar el comercial externo ${externalUserId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return err(
        new ExternalCommercialSyncError(
          'EXTERNAL_USER_INVALID',
          'No se pudo guardar el usuario',
        ),
      );
    }
    aggregate.commit();

    if (!existingLink) {
      await this.links.save({
        id: Uuid.random().value,
        companyId: command.companyId,
        externalUserId,
        userAccountId: aggregate.id.value,
        provider: LEADCARS_PROVIDER,
      });
    }

    return ok({
      userId: aggregate.id.value,
      externalUserId,
      active: aggregate.isActive,
      created,
    });
  }
}
