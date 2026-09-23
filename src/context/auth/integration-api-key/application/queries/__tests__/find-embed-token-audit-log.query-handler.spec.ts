/**
 * Tests del FindEmbedTokenAuditLogQueryHandler (Story 2.2, Task 7.3).
 *
 * Estrategia: mock del IEmbedTokenAuditLogRepository. Valida que el handler
 * filtra por companyId siempre, y aplica filtros opcionales correctamente.
 *
 * Estos tests deben fallar (RED) hasta que Task 7.3 implemente
 * `../find-embed-token-audit-log.query-handler.ts`.
 */

import { FindEmbedTokenAuditLogQueryHandler } from '../find-embed-token-audit-log.query-handler';
import { FindEmbedTokenAuditLogQuery } from '../find-embed-token-audit-log.query';
import {
  IEmbedTokenAuditLogRepository,
  EmbedTokenAuditLogPrimitives,
} from '../../../domain/repositories/embed-token-audit-log.repository';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { ok, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

class TestDomainError extends DomainError {
  constructor() {
    super('Test repository failure');
  }
}

describe('FindEmbedTokenAuditLogQueryHandler - Story 2.2 (unit)', () => {
  let handler: FindEmbedTokenAuditLogQueryHandler;
  let mockRepo: jest.Mocked<IEmbedTokenAuditLogRepository>;

  const COMPANY_ID = Uuid.random().value;
  const USER_ID = Uuid.random().value;

  const sampleEvent: EmbedTokenAuditLogPrimitives = {
    id: Uuid.random().value,
    companyId: COMPANY_ID,
    userId: USER_ID,
    origin: 'https://app.integrator.com',
    timestamp: new Date(),
    ipAddressHash: 'a'.repeat(16),
    userAgent: 'Mozilla/5.0',
    endpoint: '/embed/authenticate-session',
    result: 'success',
    // TD-1: createdAt/updatedAt son Mongoose-managed, no se incluyen
    // en primitives.
  };

  beforeEach(() => {
    mockRepo = {
      save: jest.fn(),
      findByQuery: jest.fn(),
    } as unknown as jest.Mocked<IEmbedTokenAuditLogRepository>;

    handler = new FindEmbedTokenAuditLogQueryHandler(mockRepo);
  });

  it('debe retornar empty list si no hay resultados', async () => {
    mockRepo.findByQuery.mockResolvedValue(ok({ events: [], total: 0 }));

    const result = await handler.execute(
      new FindEmbedTokenAuditLogQuery({ companyId: COMPANY_ID }),
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.events).toEqual([]);
      expect(result.value.total).toBe(0);
    }
  });

  it('debe filtrar por companyId (siempre)', async () => {
    mockRepo.findByQuery.mockResolvedValue(
      ok({ events: [sampleEvent], total: 1 }),
    );

    await handler.execute(
      new FindEmbedTokenAuditLogQuery({ companyId: COMPANY_ID }),
    );

    expect(mockRepo.findByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_ID }),
    );
  });

  it('debe filtrar por userId cuando se proporciona', async () => {
    mockRepo.findByQuery.mockResolvedValue(ok({ events: [], total: 0 }));

    await handler.execute(
      new FindEmbedTokenAuditLogQuery({
        companyId: COMPANY_ID,
        userId: USER_ID,
      }),
    );

    expect(mockRepo.findByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY_ID, userId: USER_ID }),
    );
  });

  it('debe filtrar por result (success/failure) cuando se proporciona', async () => {
    mockRepo.findByQuery.mockResolvedValue(ok({ events: [], total: 0 }));

    await handler.execute(
      new FindEmbedTokenAuditLogQuery({
        companyId: COMPANY_ID,
        result: 'failure',
      }),
    );

    expect(mockRepo.findByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failure' }),
    );
  });

  it('debe pasar limit al repository (sin defaults — el repository los aplica)', async () => {
    mockRepo.findByQuery.mockResolvedValue(ok({ events: [], total: 0 }));

    // Con limit custom
    await handler.execute(
      new FindEmbedTokenAuditLogQuery({ companyId: COMPANY_ID, limit: 50 }),
    );
    expect(mockRepo.findByQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('debe respetar skip (default 0)', async () => {
    mockRepo.findByQuery.mockResolvedValue(ok({ events: [], total: 0 }));

    await handler.execute(
      new FindEmbedTokenAuditLogQuery({ companyId: COMPANY_ID, skip: 200 }),
    );

    expect(mockRepo.findByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 200 }),
    );
  });

  it('debe propagar error del repository', async () => {
    mockRepo.findByQuery.mockResolvedValue(err(new TestDomainError()));

    const result = await handler.execute(
      new FindEmbedTokenAuditLogQuery({ companyId: COMPANY_ID }),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Test repository failure');
    }
  });
});
