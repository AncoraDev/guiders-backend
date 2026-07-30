import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result, ok, err } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/domain.error';
import { GetPendingQueueQuery } from './get-pending-queue.query';
import { Chat } from '../../domain/entities/chat.aggregate';
import {
  IChatRepository,
  CHAT_V2_REPOSITORY,
} from '../../domain/chat.repository';
import {
  ChatQueueConfigService,
  CHAT_QUEUE_CONFIG_SERVICE,
} from '../../domain/services/chat-queue-config.service';

/**
 * Error específico para el GetPendingQueueQueryHandler
 */
export class GetPendingQueueError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Query Handler para obtener la cola de chats pendientes
 * Respeta la configuración del modo cola
 */
@QueryHandler(GetPendingQueueQuery)
export class GetPendingQueueQueryHandler
  implements IQueryHandler<GetPendingQueueQuery>
{
  private readonly logger = new Logger(GetPendingQueueQueryHandler.name);

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(CHAT_QUEUE_CONFIG_SERVICE)
    private readonly queueConfigService: ChatQueueConfigService,
  ) {}

  async execute(
    query: GetPendingQueueQuery,
  ): Promise<Result<Chat[], DomainError>> {
    try {
      this.logger.log(
        `Obteniendo cola de chats pendientes. Departamento: ${query.department}, Límite: ${query.limit}`,
      );

      // Siempre listar PENDING: el espacio operativo "Atención" necesita ver
      // chats sin asignar aunque el modo cola (creación/auto-assign) esté off.
      // El flag CHAT_QUEUE_MODE_ENABLED solo afecta creación (shouldUseQueue),
      // no el listado de la cola.
      if (!this.queueConfigService.isQueueModeEnabled()) {
        this.logger.debug(
          'Modo cola desactivado para creación; listando PENDING existentes igualmente',
        );
      }

      // Obtener chats pendientes del repositorio
      const result = await this.chatRepository.getPendingQueue(
        query.department,
        query.limit,
      );

      if (result.isErr()) {
        this.logger.error(
          `Error al obtener cola pendiente: ${result.error.message}`,
        );
        return result;
      }

      this.logger.log(
        `Cola pendiente obtenida exitosamente. ${result.value.length} chats encontrados`,
      );

      return result;
    } catch (error) {
      this.logger.error('Error inesperado al obtener cola pendiente:', error);
      return err(
        new GetPendingQueueError(
          `Error inesperado al obtener cola pendiente: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }
  }
}
