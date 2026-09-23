/**
 * Command handler que orquesta la emisión de un embed token.
 *
 * Validaciones (en orden, para no leak info):
 *  1. `embedEnabled=true` para el `companyId` (white_label_configs)
 *  2. `userId` existe y pertenece a `companyId` (user_accounts)
 *  3. Llama a `EmbedTokenService.createToken(companyId, userId, roles)`
 *
 * Cualquier fallo de seguridad retorna `EmbedTokenForbiddenError` con
 * un código específico que el controller traduce a HTTP 403.
 *
 * Story 2.2: emite `EmbedTokenAuthenticatedEvent` (success) o
 * `EmbedTokenAuthenticationFailedEvent` (failure) al bus de eventos
 * para que el audit log handler persista a MongoDB.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from 'src/context/white-label/domain/white-label-config.repository';
import {
  USER_ACCOUNT_REPOSITORY,
  UserAccountRepository,
} from 'src/context/auth/auth-user/domain/user-account.repository';
import {
  EMBED_TOKEN_SERVICE,
  IEmbedTokenService,
} from '../../domain/services/embed-token.service';
import {
  EmbedTokenForbiddenError,
  EmbedTokenError,
} from '../../domain/errors/embed-token.errors';
import { CreateEmbedTokenCommand } from './create-embed-token.command';
import { EmbedTokenAuthenticatedEvent } from '../../domain/events/embed-token-authenticated.event';
import { EmbedTokenAuthenticationFailedEvent } from '../../domain/events/embed-token-authentication-failed.event';
import { EmbedAuthFailureReason } from '../../domain/events/embed-auth-failure-reason.enum';
import { tryPublish } from 'src/context/shared/events/try-publish';

export interface CreateEmbedTokenResult {
  token: string;
  expiresAt: string;
}

@Injectable()
@CommandHandler(CreateEmbedTokenCommand)
export class CreateEmbedTokenCommandHandler
  implements ICommandHandler<CreateEmbedTokenCommand>
{
  private readonly logger = new Logger(CreateEmbedTokenCommandHandler.name);

  constructor(
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY)
    private readonly whiteLabelRepository: IWhiteLabelConfigRepository,
    @Inject(USER_ACCOUNT_REPOSITORY)
    private readonly userRepository: UserAccountRepository,
    @Inject(EMBED_TOKEN_SERVICE)
    private readonly embedTokens: IEmbedTokenService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: CreateEmbedTokenCommand,
  ): Promise<Result<CreateEmbedTokenResult, DomainError>> {
    const now = () => new Date().toISOString();

    // 1. Check embed enabled (order matters: no leak de existencia)
    const configResult = await this.whiteLabelRepository.findByCompanyId(
      command.companyId,
    );
    if (configResult.isErr() || !configResult.unwrap().embedEnabled) {
      tryPublish(
        this.eventBus,
        new EmbedTokenAuthenticationFailedEvent({
          companyId: command.companyId,
          userId: command.userId,
          origin: command.origin,
          timestamp: now(),
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
          endpoint: command.endpoint,
          failureReason: EmbedAuthFailureReason.EMBED_DISABLED_FOR_TENANT,
          failureDetail: 'Embed no habilitado para esta empresa',
        }),
        this.logger,
        'create-embed-token',
      );
      return err(new EmbedTokenForbiddenError('EMBED_DISABLED_FOR_TENANT'));
    }

    // 2. Verify user exists and belongs to the company
    const user = await this.userRepository.findById(command.userId);
    if (!user || user.companyId.value !== command.companyId) {
      tryPublish(
        this.eventBus,
        new EmbedTokenAuthenticationFailedEvent({
          companyId: command.companyId,
          userId: command.userId,
          origin: command.origin,
          timestamp: now(),
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
          endpoint: command.endpoint,
          failureReason: EmbedAuthFailureReason.EMBED_USER_NOT_IN_TENANT,
          failureDetail: 'El usuario no pertenece a esta empresa',
        }),
        this.logger,
        'create-embed-token',
      );
      return err(new EmbedTokenForbiddenError('EMBED_USER_NOT_IN_TENANT'));
    }

    // 3. Issue the token (pass user's roles to EmbedTokenService)
    const roles = user.roles.toPrimitives();
    const tokenResult = await this.embedTokens.createToken(
      command.companyId,
      command.userId,
      roles,
    );
    if (tokenResult.isErr()) {
      const errValue = tokenResult.error;
      // Propagate as-is; if it's an EmbedTokenError we keep it; otherwise
      // wrap so the caller can still treat it as a domain error.
      const wrapped =
        errValue instanceof EmbedTokenError ||
        errValue instanceof EmbedTokenForbiddenError
          ? errValue
          : new EmbedTokenError(errValue.message);

      tryPublish(
        this.eventBus,
        new EmbedTokenAuthenticationFailedEvent({
          companyId: command.companyId,
          userId: command.userId,
          origin: command.origin,
          timestamp: now(),
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
          endpoint: command.endpoint,
          failureReason: EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
          failureDetail: wrapped.message,
        }),
        this.logger,
        'create-embed-token',
      );

      return err(wrapped);
    }

    // 4. Success: emit success event for audit log
    tryPublish(
      this.eventBus,
      new EmbedTokenAuthenticatedEvent({
        companyId: command.companyId,
        userId: command.userId,
        origin: command.origin,
        timestamp: now(),
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        endpoint: command.endpoint,
      }),
      this.logger,
      'create-embed-token',
    );

    const issued = tokenResult.unwrap();
    return ok({
      token: issued.token,
      expiresAt: issued.expiresAt,
    });
  }
}
