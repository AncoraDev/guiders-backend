/**
 * Command handler que orquesta la creación de una BFF session a
 * partir de un embed token validado.
 *
 * Flujo (3 pasos):
 *  1. Valida el embed token contra Redis via `EmbedTokenService.validateToken`.
 *     Si es `NotFound`/`InvalidFormat`/`Corrupted`/`Error` → propaga.
 *  2. Defense-in-depth: si el body trae `userId`/`companyId` y difieren
 *     del token → retorna `EmbedBodyTokenMismatchError` (403).
 *  3. Crea la BFF session via `BffSessionService.createSession`.
 *     El `embedTokenRef` se guarda en Redis para trazabilidad y
 *     revocación en cascada (Story 2.3).
 *
 * Cualquier fallo se propaga al controller, que mapea a HTTP 401/403/503.
 *
 * Story 2.2: emite `EmbedTokenAuthenticatedEvent` (success) o
 * `EmbedTokenAuthenticationFailedEvent` (failure) al bus de eventos.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  EMBED_TOKEN_SERVICE,
  IEmbedTokenService,
} from 'src/context/auth/integration-api-key/domain/services/embed-token.service';
import {
  BFF_SESSION_SERVICE,
  IBffSessionService,
  BffSessionIssued,
} from '../../domain/services/bff-session.service';
import { EmbedBodyTokenMismatchError } from '../../domain/errors/bff-session.errors';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenCorruptedError,
  EmbedTokenError,
} from 'src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import { AuthenticateEmbedSessionCommand } from './authenticate-embed-session.command';
import { EmbedTokenAuthenticatedEvent } from 'src/context/auth/integration-api-key/domain/events/embed-token-authenticated.event';
import { EmbedTokenAuthenticationFailedEvent } from 'src/context/auth/integration-api-key/domain/events/embed-token-authentication-failed.event';
import { EmbedAuthFailureReason } from 'src/context/auth/integration-api-key/domain/events/embed-auth-failure-reason.enum';
import { tryPublish } from 'src/context/shared/events/try-publish';

@Injectable()
@CommandHandler(AuthenticateEmbedSessionCommand)
export class AuthenticateEmbedSessionCommandHandler
  implements ICommandHandler<AuthenticateEmbedSessionCommand>
{
  private readonly logger = new Logger(
    AuthenticateEmbedSessionCommandHandler.name,
  );

  constructor(
    @Inject(EMBED_TOKEN_SERVICE)
    private readonly embedTokens: IEmbedTokenService,
    @Inject(BFF_SESSION_SERVICE)
    private readonly bffSessions: IBffSessionService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: AuthenticateEmbedSessionCommand,
  ): Promise<Result<BffSessionIssued, DomainError>> {
    const now = () => new Date().toISOString();
    const publishFailure = (
      reason: EmbedAuthFailureReason,
      detail: string,
      userId: string | null = null,
      companyId: string | null = null,
    ) => {
      tryPublish(
        this.eventBus,
        new EmbedTokenAuthenticationFailedEvent({
          companyId: companyId ?? 'unknown',
          userId,
          origin: command.origin,
          timestamp: now(),
          ipAddress: command.ipAddress,
          userAgent: command.userAgent,
          endpoint: '/embed/authenticate-session',
          failureReason: reason,
          failureDetail: detail,
        }),
        this.logger,
        'authenticate-embed-session',
      );
    };

    // 1. Validar el embed token contra Redis
    const tokenData = await this.embedTokens.validateToken(command.embedToken);
    if (tokenData.isErr()) {
      const errValue = tokenData.error;
      let reason: EmbedAuthFailureReason;
      let detail: string;
      if (errValue instanceof EmbedTokenNotFoundError) {
        reason = EmbedAuthFailureReason.EMBED_TOKEN_EXPIRED;
        detail = 'Token no encontrado o expirado';
      } else if (
        errValue instanceof EmbedTokenInvalidFormatError ||
        errValue instanceof EmbedTokenCorruptedError
      ) {
        reason = EmbedAuthFailureReason.EMBED_TOKEN_INVALID;
        detail = errValue.message;
      } else if (errValue instanceof EmbedTokenError) {
        reason = EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE;
        detail = errValue.message;
      } else {
        reason = EmbedAuthFailureReason.UNKNOWN_ERROR;
        detail = errValue.message;
      }
      publishFailure(reason, detail);
      // Propaga el error tal cual — el controller mapea a HTTP 401/503
      return err(errValue);
    }

    const data = tokenData.unwrap();

    // 2. Defense-in-depth: body userId/companyId deben matchear el token
    if (
      command.expectedUserId !== undefined &&
      command.expectedUserId !== data.userId
    ) {
      publishFailure(
        EmbedAuthFailureReason.EMBED_BODY_TOKEN_MISMATCH,
        'El userId del body no coincide con el del token',
        data.userId,
        data.companyId,
      );
      return err(new EmbedBodyTokenMismatchError());
    }
    if (
      command.expectedCompanyId !== undefined &&
      command.expectedCompanyId !== data.companyId
    ) {
      publishFailure(
        EmbedAuthFailureReason.EMBED_BODY_TOKEN_MISMATCH,
        'El companyId del body no coincide con el del token',
        data.userId,
        data.companyId,
      );
      return err(new EmbedBodyTokenMismatchError());
    }

    // 3. Crear la BFF session con el embedTokenRef para trazabilidad
    const sessionResult = await this.bffSessions.createSession(
      {
        userId: data.userId,
        companyId: data.companyId,
        roles: data.roles,
        createdAt: data.createdAt,
      },
      command.embedToken,
    );

    if (sessionResult.isErr()) {
      publishFailure(
        EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
        sessionResult.error.message,
        data.userId,
        data.companyId,
      );
      return err(sessionResult.error);
    }

    // 4. Success: emit success event
    tryPublish(
      this.eventBus,
      new EmbedTokenAuthenticatedEvent({
        companyId: data.companyId,
        userId: data.userId,
        origin: command.origin,
        timestamp: now(),
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        endpoint: '/embed/authenticate-session',
      }),
      this.logger,
      'authenticate-embed-session',
    );

    return ok(sessionResult.unwrap());
  }
}
