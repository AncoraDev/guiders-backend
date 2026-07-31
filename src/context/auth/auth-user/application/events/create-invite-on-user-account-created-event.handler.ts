// Handler para UserAccountCreatedEvent que crea una invitación si el usuario no tiene contraseña y la envía por email
// Ubicación: src/context/auth/auth-user/application/events/create-invite-on-user-account-created-event.handler.ts
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { UserAccountCreatedEvent } from '../../domain/events/user-account-created-event';
import { Inject, Logger } from '@nestjs/common';
import { Invite } from '../../domain/invite.aggregate';
import { InviteId } from '../../domain/value-objects/invite-id';
import { UserId } from '../../domain/value-objects/user-id';
import { InviteEmail } from '../../domain/value-objects/invite-email';
import { InviteToken } from '../../domain/value-objects/invite-token';
import { InviteExpiration } from '../../domain/value-objects/invite-expiration';
import {
  InviteRepository,
  INVITE_REPOSITORY,
} from '../../domain/invite.repository';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from 'src/context/shared/domain/email/email-sender.service';

@EventsHandler(UserAccountCreatedEvent)
export class CreateInviteOnUserAccountCreatedEventHandler
  implements IEventHandler<UserAccountCreatedEvent>
{
  private readonly logger = new Logger(
    CreateInviteOnUserAccountCreatedEventHandler.name,
  );
  constructor(
    @Inject(INVITE_REPOSITORY)
    private readonly inviteRepository: InviteRepository,
    @Inject(EMAIL_SENDER_SERVICE)
    private readonly emailSenderService: EmailSenderService,
  ) {}

  async handle(event: UserAccountCreatedEvent): Promise<void> {
    const { id, email, password, keycloakId } = event.attributes.user;
    // Si el usuario ya tiene contraseña, no crear invitación
    if (password) {
      this.logger.log(
        `El usuario ${email} ya tiene contraseña, no se crea invitación.`,
      );
      return;
    }
    // Usuarios SSO (Keycloak): la contraseña se define vía execute-actions-email
    if (keycloakId) {
      this.logger.log(
        `El usuario ${email} está vinculado a Keycloak, no se crea invitación local.`,
      );
      return;
    }
    // Generar token hash seguro y expiración (24h)
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // Crear la invitación (Invite)
    const invite = Invite.create({
      id: new InviteId(uuidv4()),
      userId: new UserId(id),
      email: new InviteEmail(email),
      token: new InviteToken(token),
      expiresAt: new InviteExpiration(expiresAt),
    });
    // Guardar la invitación
    await this.inviteRepository.save(invite);
    // Enviar email con el enlace de registro de contraseña
    const registrationUrl = `https://app.guiders.io/register-password?token=${invite.token.value}`;
    await this.emailSenderService.sendEmail({
      to: email,
      subject: 'Invitación para crear tu contraseña de acceso',
      html: `<p>Hola,</p><p>Has sido invitado a la plataforma. Haz clic en el siguiente enlace para crear tu contraseña:</p><p><a href="${registrationUrl}">${registrationUrl}</a></p><p>Este enlace expirará en 24 horas.</p>`,
    });
  }
}
