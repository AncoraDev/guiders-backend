/**
 * Command handler que orquesta la revocación en cascada de una BFF
 * session y su embed token padre.
 *
 * Story 2.3 + PR #115 review fixes:
 *
 * Flujo (3 pasos):
 *  1. Lee la BFF session de Redis via `BffSessionService.getSession`.
 *     Si no existe → 401 + emite failure event.
 *  2. Llama a `BffSessionService.cascadeRevoke(sessionId, embedTokenRef)`
 *     que borra atómicamente session + token vía Lua EVAL (elimina la
 *     ventana TOCTOU entre revokeSession + revokeToken separada).
 *  3. Emite evento de auditoría al bus (tryPublish).
 *
 * Casos de resultado (LogoutCascadeResult):
 *   SUCCESS   - ambos DELs retornaron 1 (caso normal)
 *   PARTIAL   - session borrada, embed token ya no existía (race)
 *   NOT_FOUND - session no existía al momento del logout (idempotencia)
 *   FAILURE   - error de Redis irrecuperable
 *
 * Spec compliance:
 *  - AC2 (idempotency): 2nd call retorna 200 (con cascadingResult='not_found')
 *  - AC3 (validation): session no encontrada + cookie faltante → 401
 *    (el no-cookie se valida en el controller, no llega aquí)
 *  - AC4 (multi-tenant): cascade solo afecta sessionId + embedTokenRef específicos
 *  - AC5 (partial): cascadingResult='partial' cuando token ya no existía
 *  - AC6 (audit log): EmbedTokenAuthenticatedEvent con logoutTimestamp,
 *    cascadingResult, embedTokenRevoked
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  BFF_SESSION_SERVICE,
  IBffSessionService,
  CascadeRevokeResult,
} from '../../domain/services/bff-session.service';
import {
  BffSessionCorruptedError,
  BffSessionInvalidFormatError,
  BffSessionNotFoundError,
  BffSessionServiceUnavailableError,
} from '../../domain/errors/bff-session.errors';
import { EmbedTokenAuthenticatedEvent } from 'src/context/auth/integration-api-key/domain/events/embed-token-authenticated.event';
import { EmbedTokenAuthenticationFailedEvent } from 'src/context/auth/integration-api-key/domain/events/embed-token-authentication-failed.event';
import { EmbedAuthFailureReason } from 'src/context/auth/integration-api-key/domain/events/embed-auth-failure-reason.enum';
import { tryPublish } from 'src/context/shared/events/try-publish';
import { LogoutCascadeResultValue } from '../../domain/value-objects/logout-cascade-result';
import { LogoutCommand } from './logout.command';

export interface LogoutCommandResult {
  cascadingResult: LogoutCascadeResultValue;
  sessionId: string;
  embedTokenRevoked: boolean;
}

@Injectable()
@CommandHandler(LogoutCommand)
export class LogoutCommandHandler implements ICommandHandler<LogoutCommand> {
  private readonly logger = new Logger(LogoutCommandHandler.name);

  constructor(
    @Inject(BFF_SESSION_SERVICE)
    private readonly bffSessions: IBffSessionService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(
    command: LogoutCommand,
  ): Promise<Result<LogoutCommandResult, DomainError>> {
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
          endpoint: '/bff/auth/logout',
          failureReason: reason,
          failureDetail: detail,
        }),
        this.logger,
        'logout',
      );
    };

    // 1. Leer la BFF session de Redis (para conocer companyId/userId/embedTokenRef)
    const sessionResult = await this.bffSessions.getSession(command.sessionId);

    if (sessionResult.isErr()) {
      const errValue = sessionResult.error;
      if (errValue instanceof BffSessionInvalidFormatError) {
        // AC3: 400 (formato inválido) + emit failure event
        publishFailure(
          EmbedAuthFailureReason.EMBED_SESSION_NOT_FOUND,
          errValue.message,
        );
        return err(errValue);
      }
      if (errValue instanceof BffSessionNotFoundError) {
        // AC2 (idempotency): session no existe en Redis. El cliente
        // probablemente llamó logout antes o el TTL expiró. Retornamos
        // OK con cascadingResult='not_found' para que el controller mapee
        // a 200 OK. NO emitimos failure event (AC2.2: "No error is emitted
        // to the audit log — avoids alert noise").
        return ok({
          cascadingResult: LogoutCascadeResultValue.notFound(),
          sessionId: command.sessionId,
          embedTokenRevoked: false,
        });
      }
      if (errValue instanceof BffSessionServiceUnavailableError) {
        publishFailure(
          EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
          errValue.message,
        );
        return err(errValue);
      }
      if (errValue instanceof BffSessionCorruptedError) {
        // N6 (PR #115 re-review): BffSessionCorruptedError indica data
        // corruption (JSON inválido en Redis, schema migration bug, etc.)
        // Es un INCIDENTE de seguridad que requiere alerta inmediata
        // (no es un error de cliente). Emitimos UNKNOWN_ERROR sigue siendo
        // engañoso — usamos EMBED_SERVICE_UNAVAILABLE para que las
        // alertas se disparen correctamente.
        // TODO: añadir un nuevo valor al enum EmbedAuthFailureReason
        // (ej. EMBED_DATA_CORRUPTION) en Story 2.4.
        publishFailure(
          EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
          `Data corruption: ${errValue.message}`,
        );
        return err(errValue);
      }
      // Error no clasificado (futuros errores no anticipados)
      publishFailure(EmbedAuthFailureReason.UNKNOWN_ERROR, errValue.message);
      return err(errValue);
    }

    const session = sessionResult.unwrap();
    const embedTokenRef = session.embedTokenRef || undefined;

    // 2. Cascade revoke atómico (Lua EVAL: DEL session + DEL token)
    const cascadeResult = await this.bffSessions.cascadeRevoke(
      command.sessionId,
      embedTokenRef,
    );

    if (cascadeResult.isErr()) {
      // Redis down durante el cascade. La session NO fue tocada (atómico).
      publishFailure(
        EmbedAuthFailureReason.EMBED_SERVICE_UNAVAILABLE,
        cascadeResult.error.message,
        session.userId,
        session.companyId,
      );
      return err(cascadeResult.error);
    }

    const { sessionDeleted, tokenDeleted } = cascadeResult.unwrap();

    // 3. Clasificar el resultado
    let cascadingResult: LogoutCascadeResultValue;
    let embedTokenRevoked: boolean;
    let failureDetail: string | undefined;

    if (sessionDeleted === 1 && tokenDeleted === 1) {
      cascadingResult = LogoutCascadeResultValue.success();
      embedTokenRevoked = true;
    } else if (sessionDeleted === 1 && tokenDeleted === 0) {
      // AC5: race condition — token ya no existía
      cascadingResult = LogoutCascadeResultValue.partial();
      embedTokenRevoked = false;
      failureDetail = 'partial: token already revoked';
    } else {
      // sessionDeleted === 0 — race con otro logout que ya borró la session.
      // El token SÍ fue borrado (o no — depende). Tratamos como NOT_FOUND.
      cascadingResult = LogoutCascadeResultValue.notFound();
      embedTokenRevoked = tokenDeleted === 1;
    }

    // 4. Emitir evento de éxito al audit log
    tryPublish(
      this.eventBus,
      new EmbedTokenAuthenticatedEvent({
        companyId: session.companyId,
        userId: session.userId,
        origin: command.origin,
        timestamp: now(),
        ipAddress: command.ipAddress,
        userAgent: command.userAgent,
        endpoint: '/bff/auth/logout',
        logoutTimestamp: now(),
        cascadingResult: cascadingResult.toJSON(),
        embedTokenRevoked,
        failureDetail,
      }),
      this.logger,
      'logout',
    );

    return ok({
      cascadingResult,
      sessionId: command.sessionId,
      embedTokenRevoked,
    });
  }
}
