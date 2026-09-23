/**
 * Helper para publicar eventos de CQRS de forma segura (best-effort).
 *
 * Story 2.2 code review (F4/E15): `eventBus.publish()` puede lanzar
 * síncronamente (ej. si no hay handler registrado, o si un handler
 * pre-hook falla). El contract del AC7 del audit log dice que la
 * publicación de eventos NO debe romper el main flow.
 *
 * Uso:
 *   import { tryPublish } from 'src/context/shared/events/try-publish';
 *
 *   tryPublish(this.eventBus, event, this.logger, 'authenticate-session');
 *
 * Si la publicación falla, se loggea WARN y la función retorna
 * normalmente (no propaga la excepción).
 */

import { EventBus } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';

export function tryPublish<TEvent extends { constructor: { name: string } }>(
  eventBus: EventBus,
  event: TEvent,
  logger: Logger,
  context: string,
): void {
  try {
    eventBus.publish(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    logger.warn(
      `[tryPublish ${context}] Failed to publish ${event.constructor.name}: ${message}`,
    );
  }
}
