import { Injectable } from '@nestjs/common';
import {
  ChatQueueConfig,
  ChatQueueConfigService,
} from '../../domain/services/chat-queue-config.service';

/**
 * Implementación del servicio de configuración del modo cola.
 * Por defecto ACTIVADO: los chats de visitantes quedan PENDING hasta que
 * un comercial los reclama (flujo Atención). Desactivar con
 * CHAT_QUEUE_MODE_ENABLED=false para auto-asignación inmediata.
 */
@Injectable()
export class ChatQueueConfigServiceImpl implements ChatQueueConfigService {
  private readonly config: ChatQueueConfig = {
    queueModeEnabled: process.env.CHAT_QUEUE_MODE_ENABLED !== 'false',
    maxQueueWaitTimeSeconds: parseInt(
      process.env.CHAT_QUEUE_MAX_WAIT_SECONDS || '300',
      10,
    ), // 5 minutos
    maxQueueSizePerDepartment: parseInt(
      process.env.CHAT_QUEUE_MAX_SIZE_PER_DEPARTMENT || '50',
      10,
    ),
    notifyCommercialsOnNewChats:
      process.env.CHAT_QUEUE_NOTIFY_COMMERCIALS === 'false' ? false : true,
  };

  /**
   * Obtiene la configuración actual del sistema de colas
   */
  getConfig(): ChatQueueConfig {
    return { ...this.config };
  }

  /**
   * Verifica si el modo cola está activado
   */
  isQueueModeEnabled(): boolean {
    return this.config.queueModeEnabled;
  }

  /**
   * Verifica si un chat debe ir a cola o asignarse directamente
   *
   * Lógica actual:
   * - Si modo cola desactivado → asignación directa (comportamiento actual)
   * - Si modo cola activado → va a cola primero
   * - Excepción: chats con prioridad URGENT siempre se asignan directamente
   */
  shouldUseQueue(_chatId: string, priority?: string): boolean {
    // Si el modo cola está desactivado, siempre asignar directamente
    if (!this.isQueueModeEnabled()) {
      return false;
    }

    // Los chats urgentes siempre se asignan directamente, sin cola
    if (priority === 'URGENT') {
      return false;
    }

    return true;
  }

  /**
   * Obtiene el tiempo máximo de espera en cola
   */
  getMaxQueueWaitTime(): number {
    return this.config.maxQueueWaitTimeSeconds;
  }
}
