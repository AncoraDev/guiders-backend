/**
 * Tests del PersistEmbedTokenAuthenticatedEventHandler (Story 2.2, Task 3.1).
 *
 * Estrategia: mock del IEmbedTokenAuditLogRepository con jest.Mocked.
 * Valida que el handler persiste el evento correctamente Y que no propaga
 * errores del repository (AC7: event publishing no debe romper el main flow).
 *
 * Estos tests deben fallar (RED) hasta que Task 3.1 implemente
 * `../persist-embed-token-authenticated.event-handler.ts`.
 */

import { PersistEmbedTokenAuthenticatedEventHandler } from '../persist-embed-token-authenticated.event-handler';
import { EmbedTokenAuthenticatedEvent } from '../../../domain/events/embed-token-authenticated.event';
import { IEmbedTokenAuditLogRepository } from '../../../domain/repositories/embed-token-audit-log.repository';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { err, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

class TestDomainError extends DomainError {
  constructor() {
    super('Test repository failure');
  }
}

describe('PersistEmbedTokenAuthenticatedEventHandler - Story 2.2 (unit)', () => {
  let handler: PersistEmbedTokenAuthenticatedEventHandler;
  let mockRepo: jest.Mocked<IEmbedTokenAuditLogRepository>;

  const buildEvent = () => {
    const attributes = {
      companyId: Uuid.random().value,
      userId: Uuid.random().value,
      origin: 'https://app.integrator.com',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      endpoint: '/embed/authenticate-session',
    };
    return new EmbedTokenAuthenticatedEvent(attributes);
  };

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findByQuery: jest.fn(),
    } as unknown as jest.Mocked<IEmbedTokenAuditLogRepository>;

    handler = new PersistEmbedTokenAuthenticatedEventHandler(mockRepo);
  });

  it('debe persistir el evento correctamente (happy path)', async () => {
    const event = buildEvent();
    mockRepo.save.mockResolvedValue(okVoid());

    await handler.handle(event);

    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('debe convertir event attributes a EmbedTokenAuditLogPrimitives con ipAddressHash (no raw IP)', async () => {
    const event = buildEvent();
    mockRepo.save.mockResolvedValue(okVoid());

    await handler.handle(event);

    const callArgs = mockRepo.save.mock.calls[0][0];
    // ipAddressHash debe ser 16 chars hex, NO la IP raw
    expect(callArgs.ipAddressHash).toMatch(/^[0-9a-f]{16}$/);
    expect(callArgs.ipAddressHash).not.toBe('192.168.1.1');
  });

  it('debe incluir companyId, userId, origin, endpoint, result, timestamp en el documento', async () => {
    const event = buildEvent();
    mockRepo.save.mockResolvedValue(okVoid());

    await handler.handle(event);

    const saved = mockRepo.save.mock.calls[0][0];
    expect(saved.companyId).toBe(event.attributes.companyId);
    expect(saved.userId).toBe(event.attributes.userId);
    expect(saved.origin).toBe(event.attributes.origin);
    expect(saved.endpoint).toBe(event.attributes.endpoint);
    expect(saved.result).toBe('success');
    expect(saved.timestamp).toBeInstanceOf(Date);
  });

  it('debe retornar ok (no throw) si el repository.save retorna err (AC7)', async () => {
    const event = buildEvent();
    mockRepo.save.mockResolvedValue(err(new TestDomainError()));

    // AC7: el handler NO debe throw ni propagar el error.
    // Debe loggear WARN y retornar void.
    await expect(handler.handle(event)).resolves.toBeUndefined();
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('debe loggear WARN con el payload si el repository falla (AC7)', async () => {
    const event = buildEvent();
    mockRepo.save.mockResolvedValue(err(new TestDomainError()));
    const warnSpy = jest.spyOn(handler['logger'] ?? console, 'warn');

    await handler.handle(event);

    // Verifica que se loggeó WARN (Logger del handler debe tener método warn)
    // Si el handler usa console.log, ajustamos a console.log
    // Aceptamos que el loggee o no, lo importante es que NO throw
    expect(warnSpy).toHaveBeenCalled();
  });
});
