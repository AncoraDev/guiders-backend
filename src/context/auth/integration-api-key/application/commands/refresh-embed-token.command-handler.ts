/**
 * Command handler que refresca un embed token.
 *
 * Validaciones (en orden):
 *  1. `validateToken(oldToken)` — si falla, distinguir:
 *     - NotFound (token expirado o revocado) → EmbedTokenExpiredError → 401
 *     - InvalidFormat / Corrupted / generic Error → EmbedTokenInvalidError → 401
 *  2. Cross-check de tenant: si la API key está presente (defense in depth),
 *     el `companyId` de la API key debe coincidir con el del token.
 *  3. Verifica `embedEnabled=true` para el `companyId` del token
 *     (defense in depth: si el tenant desactivó embed post-emisión, el
 *     token existente también es revocado) → EmbedTokenExpiredError → 401
 *     o si Mongo down → EmbedTokenError (genérico) → 503
 *  4. Si el comando incluye un `expectedUserId` (opcional), valida que
 *     coincida con el del token. Si no → EmbedTokenUserMismatchError → 403
 *  5. Llama `embedTokens.refreshToken(oldToken)` (atomic Lua script)
 *  6. Retorna `ok({ token, expiresAt })`
 *
 * El `userId` del token se preserva implícitamente porque `refreshToken`
 * lee los datos del token viejo y los usa para el nuevo.
 *
 * Story 2.2: emite `EmbedTokenAuthenticatedEvent` (success) o
 * `EmbedTokenAuthenticationFailedEvent` (failure) al bus de eventos.
 * Importante: en success, el `userId`/`companyId` del evento son del
 * token refrescado (los mismos del token viejo, pero fuente única de verdad).
 *
 * Code review Story 2.2:
 *  - F4/E15: todas las publicaciones van por `tryPublish` (best-effort)
 *    para no romper el main flow si el bus falla síncronamente.
 *  - F10: misma jerarquía de errores que `authenticate-embed-session`
 *    (InvalidFormat/Corrupted → EMBED_TOKEN_INVALID; EmbedTokenError
 *    genérico → EMBED_SERVICE_UNAVAILABLE).
 *  - E7: 'unknown' se usa SOLO como último fallback. Si apiKeyCompanyId
 *    está presente, se prefiere (más informativo).
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
  EMBED_TOKEN_SERVICE,
  IEmbedTokenService,
} from '../../domain/services/embed-token.service';
import {
  EmbedTokenExpiredError,
  EmbedTokenInvalidError,
  EmbedTokenUserMismatchError,
  EmbedTokenError,
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenCorruptedError,
} from '../../domain/errors/embed-token.errors';
import { RefreshEmbedTokenCommand } from './refresh-embed-token.command';
import { EmbedTokenAuthenticatedEvent } from '../../domain/events/embed-token-authenticated.event';
import { EmbedTokenAuthenticationFailedEvent } from '../../domain/events/embed-token-authentication-failed.event';
import { EmbedAuthFailureReason } from '../../domain/events/embed-auth-failure-reason.enum';
import { tryPublish } from 'src/context/shared/events/try-publish';

export interface RefreshEmbedTokenResult {
  token: string;
  expiresAt: string;
}

@Injectable()
@CommandHandler(RefreshEmbedTokenCommand)
export class RefreshEmbedTokenCommandHandler
  implements ICommandHandler<RefreshEmbedTokenCommand>
{
  private readonly logger = new Logger(RefreshEmbedTokenCommandHandler.name);

  constructor(
    @Inject(EMBED_TOKEN_SERVICE)
    private readonly embedTokens: IEmbedTokenService,
    @Inject(WHITE_LABEL_CONFIG_REPOSITORY)
    private readonly whiteLabelRepository: IWhiteLabelConfigRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: RefreshEmbedTokenCommand,
  ): Promise<Result<RefreshEmbedTokenResult, DomainError>> {
    const now = () => new Date().toISOString();
    // For failure events before we know the userId, we use null and
    // the event class allows it (defense-in-depth: PII-safe).
    // companyId fallback: apiKeyCompanyId > 'unknown' (never userId —
    // it's null at this point, so it would be misleading).
    const baseEvent = (
      failureReason: EmbedAuthFailureReason,
      failureDetail: string,
      userId: string | null = null,
    ) =>
      new EmbedTokenAuthenticationFailedEvent({
        companyId: command.apiKeyCompanyId ?? 'unknown',
        userId,
        origin: command.origin,
        timestamp: now(),
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        endpoint: '/v2/integration/embed/refresh',
        failureReason,
        failureDetail,
      });

    // 1. Validate token
    const tokenData = await this.embedTokens.validateToken(command.token);
    if (tokenData.isErr()) {
      const errValue = tokenData.error;
      // F10: classify by error type (matches authenticate-session)
      if (errValue instanceof EmbedTokenNotFoundError) {
        tryPublish(
          this.eventBus,
          baseEvent(
            EmbedAuthFailureReason.EMBED_TOKEN_EXPIRED,
            'Token expirado o revocado',
          ),
          this.logger,
          'refresh-embed-token',
        );
        return err(new EmbedTokenExpiredError());
      }
      if (
        errValue instanceof EmbedTokenInvalidFormatError ||
        errValue instanceof EmbedTokenCorruptedError
      ) {
        tryPublish(
          this.eventBus,
          baseEvent(
            EmbedAuthFailureReason.EMBED_TOKEN_INVALID,
            'Token con formato o contenido inválido',
          ),
          this.logger,
          'refresh-embed-token',
        );
        return err(new EmbedTokenInvalidError());
      }
      if (errValue instanceof EmbedTokenError) {
        tryPublish(
          this.eventBus,
          baseEvent(
            EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
            errValue.message,
          ),
          this.logger,
          'refresh-embed-token',
        );
        return err(errValue);
      }
      tryPublish(
        this.eventBus,
        baseEvent(EmbedAuthFailureReason.UNKNOWN_ERROR, errValue.message),
        this.logger,
        'refresh-embed-token',
      );
      return err(new EmbedTokenInvalidError());
    }

    const tokenInfo = tokenData.unwrap();

    // 2. Cross-check tenant
    if (
      command.apiKeyCompanyId &&
      command.apiKeyCompanyId !== tokenInfo.companyId
    ) {
      this.logger.warn(
        `Tenant mismatch en refresh: API key companyId=${command.apiKeyCompanyId} vs token companyId=${tokenInfo.companyId}`,
      );
      tryPublish(
        this.eventBus,
        baseEvent(
          EmbedAuthFailureReason.EMBED_TENANT_MISMATCH,
          'API key companyId no coincide con el del token',
          tokenInfo.userId,
        ),
        this.logger,
        'refresh-embed-token',
      );
      return err(new EmbedTokenUserMismatchError());
    }

    // 3. Defense in depth: verify embed still enabled
    const configResult = await this.whiteLabelRepository.findByCompanyId(
      tokenInfo.companyId,
    );
    if (configResult.isErr()) {
      const errValue = configResult.error;
      const isConfigNotFound =
        errValue.name === 'WhiteLabelConfigNotFoundError';
      if (isConfigNotFound) {
        this.logger.warn(
          `Refresh rechazado: white_label_config no encontrada para companyId=${tokenInfo.companyId}`,
        );
        tryPublish(
          this.eventBus,
          baseEvent(
            EmbedAuthFailureReason.EMBED_DISABLED_FOR_TENANT,
            'White-label config no encontrada para el tenant',
            tokenInfo.userId,
          ),
          this.logger,
          'refresh-embed-token',
        );
        return err(new EmbedTokenExpiredError());
      }
      this.logger.error(
        `Error de infraestructura buscando white_label_config para companyId=${tokenInfo.companyId}: ${errValue.message}`,
      );
      tryPublish(
        this.eventBus,
        baseEvent(
          EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
          `White-label config no disponible: ${errValue.message}`,
          tokenInfo.userId,
        ),
        this.logger,
        'refresh-embed-token',
      );
      return err(
        new EmbedTokenError(
          `White-label config no disponible: ${errValue.message}`,
        ),
      );
    }
    if (!configResult.unwrap().embedEnabled) {
      this.logger.warn(
        `Refresh rechazado: embed deshabilitado para companyId=${tokenInfo.companyId}`,
      );
      tryPublish(
        this.eventBus,
        baseEvent(
          EmbedAuthFailureReason.EMBED_DISABLED_FOR_TENANT,
          'Embed deshabilitado para el tenant (admin toggled embedEnabled=false)',
          tokenInfo.userId,
        ),
        this.logger,
        'refresh-embed-token',
      );
      return err(new EmbedTokenExpiredError());
    }

    // 4. Optional userId match
    if (command.expectedUserId && command.expectedUserId !== tokenInfo.userId) {
      tryPublish(
        this.eventBus,
        baseEvent(
          EmbedAuthFailureReason.EMBED_BODY_TOKEN_MISMATCH,
          'El userId del body no coincide con el del token',
          tokenInfo.userId,
        ),
        this.logger,
        'refresh-embed-token',
      );
      return err(new EmbedTokenUserMismatchError());
    }

    // 5. Refresh the token
    const refreshResult = await this.embedTokens.refreshToken(command.token);
    if (refreshResult.isErr()) {
      tryPublish(
        this.eventBus,
        baseEvent(
          EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
          refreshResult.error.message,
          tokenInfo.userId,
        ),
        this.logger,
        'refresh-embed-token',
      );
      return err(refreshResult.error);
    }

    // 6. Success: emit success event
    tryPublish(
      this.eventBus,
      new EmbedTokenAuthenticatedEvent({
        companyId: tokenInfo.companyId,
        userId: tokenInfo.userId,
        origin: command.origin,
        timestamp: now(),
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        endpoint: '/v2/integration/embed/refresh',
      }),
      this.logger,
      'refresh-embed-token',
    );

    const issued = refreshResult.unwrap();
    return ok({
      token: issued.token,
      expiresAt: issued.expiresAt,
    });
  }
}
