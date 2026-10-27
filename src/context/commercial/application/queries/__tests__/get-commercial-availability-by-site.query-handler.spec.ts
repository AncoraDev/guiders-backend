import { GetCommercialAvailabilityBySiteQueryHandler } from '../get-commercial-availability-by-site.query-handler';
import { GetCommercialAvailabilityBySiteQuery } from '../get-commercial-availability-by-site.query';
import { CommercialConnectionDomainService } from '../../../domain/commercial-connection.domain-service';
import { CommercialRepository } from '../../../domain/commercial.repository';
import { CommercialId } from '../../../domain/value-objects/commercial-id';
import { Uuid } from '../../../../shared/domain/value-objects/uuid';
import { err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

describe('GetCommercialAvailabilityBySiteQueryHandler', () => {
  let handler: GetCommercialAvailabilityBySiteQueryHandler;
  let connectionService: jest.Mocked<CommercialConnectionDomainService>;
  let commercialRepository: jest.Mocked<CommercialRepository>;

  const siteId = Uuid.random().value;
  const companyId = Uuid.random().value;

  beforeEach(() => {
    connectionService = {
      getAvailableCommercials: jest.fn(),
      getOnlineCountByTenant: jest.fn(),
      getCompanyIdByCommercial: jest.fn(),
      setConnectionStatus: jest.fn(),
      getConnectionStatus: jest.fn(),
      updateLastActivity: jest.fn(),
      getLastActivity: jest.fn(),
      removeConnection: jest.fn(),
      isCommercialOnline: jest.fn(),
      isCommercialActive: jest.fn(),
      getOnlineCommercials: jest.fn(),
      getBusyCommercials: jest.fn(),
      getActiveCommercials: jest.fn(),
      setTyping: jest.fn(),
      isTyping: jest.fn(),
      clearTyping: jest.fn(),
      getTypingInChat: jest.fn(),
      renewOnlinePresence: jest.fn(),
    } as jest.Mocked<CommercialConnectionDomainService>;

    commercialRepository = {
      findById: jest.fn().mockResolvedValue(
        err(
          new (class MissingCommercial extends DomainError {
            constructor() {
              super('no está');
            }
          })(),
        ),
      ),
    } as unknown as jest.Mocked<CommercialRepository>;

    handler = new GetCommercialAvailabilityBySiteQueryHandler(
      connectionService,
      commercialRepository,
    );
  });

  describe('execute', () => {
    it('debe retornar available=true cuando hay comerciales disponibles en el tenant', async () => {
      const commercialId1 = new CommercialId(Uuid.random().value);
      const commercialId2 = new CommercialId(Uuid.random().value);
      connectionService.getAvailableCommercials.mockResolvedValue([
        commercialId1,
        commercialId2,
      ]);

      const query = new GetCommercialAvailabilityBySiteQuery(siteId, companyId);
      const result = await handler.execute(query);

      expect(result.available).toBe(true);
      expect(result.onlineCount).toBe(2);
      expect(result.onlineAgents).toEqual([]);
      expect(result.tenantId).toBe(companyId);
      expect(result.siteId).toBe(siteId);
      expect(result.timestamp).toBeDefined();
    });

    it('debe retornar available=false cuando no hay comerciales disponibles en el tenant', async () => {
      connectionService.getAvailableCommercials.mockResolvedValue([]);

      const query = new GetCommercialAvailabilityBySiteQuery(siteId, companyId);
      const result = await handler.execute(query);

      expect(result.available).toBe(false);
      expect(result.onlineCount).toBe(0);
      expect(result.onlineAgents).toEqual([]);
    });

    it('debe filtrar por companyId pasándolo a getAvailableCommercials', async () => {
      connectionService.getAvailableCommercials.mockResolvedValue([]);

      const query = new GetCommercialAvailabilityBySiteQuery(siteId, companyId);
      await handler.execute(query);

      expect(connectionService.getAvailableCommercials).toHaveBeenCalledWith(
        companyId,
      );
    });

    it('debe retornar available=false y onlineCount=0 si el connectionService lanza error', async () => {
      connectionService.getAvailableCommercials.mockRejectedValue(
        new Error('Redis connection error'),
      );

      const query = new GetCommercialAvailabilityBySiteQuery(siteId, companyId);
      const result = await handler.execute(query);

      expect(result.available).toBe(false);
      expect(result.onlineCount).toBe(0);
      expect(result.onlineAgents).toEqual([]);
    });

    it('incluye nombre y avatar de los comerciales online', async () => {
      const commercialId = new CommercialId(Uuid.random().value);
      connectionService.getAvailableCommercials.mockResolvedValue([
        commercialId,
      ]);
      commercialRepository.findById.mockResolvedValue(
        ok({
          name: { value: 'María' },
          avatarUrl: 'https://cdn.example.com/maria.jpg',
        } as never),
      );

      const result = await handler.execute(
        new GetCommercialAvailabilityBySiteQuery(siteId, companyId),
      );

      expect(result.onlineAgents).toEqual([
        {
          name: 'María',
          avatarUrl: 'https://cdn.example.com/maria.jpg',
        },
      ]);
    });
  });
});
