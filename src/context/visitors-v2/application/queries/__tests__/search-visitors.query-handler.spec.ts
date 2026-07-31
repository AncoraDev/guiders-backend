import { Test, TestingModule } from '@nestjs/testing';
import { SearchVisitorsQueryHandler } from '../search-visitors.query-handler';
import { SearchVisitorsQuery } from '../search-visitors.query';
import {
  VisitorV2Repository,
  VISITOR_V2_REPOSITORY,
} from '../../../domain/visitor-v2.repository';
import {
  IChatRepository,
  CHAT_V2_REPOSITORY,
} from '../../../../../context/conversations-v2/domain/chat.repository';
import {
  CommercialRepository,
  COMMERCIAL_REPOSITORY,
} from '../../../../commercial/domain/commercial.repository';
import { ok, err } from '../../../../shared/domain/result';
import { Uuid } from '../../../../shared/domain/value-objects/uuid';
import { VisitorV2PersistenceError } from '../../../domain/errors/visitor-v2.error';
import {
  VisitorSortField,
  SortDirection,
} from '../../dtos/visitor-filters.dto';

describe('SearchVisitorsQueryHandler', () => {
  let handler: SearchVisitorsQueryHandler;
  let visitorRepository: jest.Mocked<VisitorV2Repository>;
  let _chatRepository: jest.Mocked<IChatRepository>;
  let commercialRepository: jest.Mocked<CommercialRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchVisitorsQueryHandler,
        {
          provide: VISITOR_V2_REPOSITORY,
          useValue: {
            searchWithFilters: jest.fn(),
          },
        },
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: {
            countByVisitorIds: jest.fn().mockResolvedValue(ok(new Map())),
            getAvailableChats: jest.fn().mockResolvedValue(ok([])),
          },
        },
        {
          provide: COMMERCIAL_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue(ok(null)),
          },
        },
      ],
    }).compile();

    handler = module.get<SearchVisitorsQueryHandler>(
      SearchVisitorsQueryHandler,
    );
    visitorRepository = module.get(VISITOR_V2_REPOSITORY);
    _chatRepository = module.get(CHAT_V2_REPOSITORY);
    commercialRepository = module.get(COMMERCIAL_REPOSITORY);
  });

  describe('execute', () => {
    const tenantId = Uuid.random().value;
    const siteId = Uuid.random().value;

    const createMockVisitor = (sessions: any[] = [], fingerprint?: string) => {
      const id = Uuid.random().value;
      return {
        getId: () => ({ getValue: () => id }),
        toPrimitives: () => ({
          id,
          tenantId,
          siteId,
          fingerprint: fingerprint || `fp_${id}`,
          lifecycle: 'visitor',
          connectionStatus: 'online',
          hasAcceptedPrivacyPolicy: true,
          isInternal: false,
          currentUrl: 'https://example.com',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sessions,
        }),
      };
    };

    const createQuery = (
      filters = {},
      sort = {},
      pagination = {},
      requestIpAddress?: string,
      requestUserAgent?: string,
      commercialId?: string,
    ) => {
      return new SearchVisitorsQuery(
        tenantId,
        filters,
        {
          field: VisitorSortField.LAST_ACTIVITY,
          direction: SortDirection.DESC,
          ...sort,
        },
        { page: 1, limit: 20, ...pagination },
        requestIpAddress,
        requestUserAgent,
        commercialId,
      );
    };

    it('should return visitors with pagination info', async () => {
      const visitors = [createMockVisitor(), createMockVisitor()];
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: visitors as any,
          total: 2,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );

      const query = createQuery();
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors).toHaveLength(2);
      expect(response.pagination.total).toBe(2);
      expect(response.pagination.totalPages).toBe(1);
    });

    it('should apply lifecycle filter', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ lifecycle: ['lead', 'visitor'] });
      await handler.execute(query);

      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lifecycle: ['lead', 'visitor'] }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should apply isInternal filter when filtering for internal visitors', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ isInternal: true });
      await handler.execute(query);

      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isInternal: true }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should apply isInternal filter when filtering for external visitors', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ isInternal: false });
      await handler.execute(query);

      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ isInternal: false }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return error when repository fails', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        err(new VisitorV2PersistenceError('Error de conexión')),
      );

      const query = createQuery();
      const result = await handler.execute(query);

      expect(result.isErr()).toBe(true);
    });

    it('should calculate pagination correctly', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 100,
          page: 2,
          limit: 20,
          totalPages: 5,
        }),
      );

      const query = createQuery({}, {}, { page: 2, limit: 20 });
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.pagination.hasNextPage).toBe(true);
      expect(response.pagination.hasPreviousPage).toBe(true);
    });

    it('should map sort fields correctly', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery(
        {},
        { field: VisitorSortField.CREATED_AT, direction: SortDirection.ASC },
      );
      await handler.execute(query);

      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          field: 'createdAt',
          direction: 'ASC',
        }),
        expect.anything(),
      );
    });

    it('should auto-adjust page when requested page exceeds totalPages', async () => {
      const visitors = [createMockVisitor()];

      // Primera llamada: página 4 pero solo hay 1 página total
      visitorRepository.searchWithFilters.mockResolvedValueOnce(
        ok({
          visitors: [],
          total: 15,
          page: 4,
          limit: 100,
          totalPages: 1,
        }),
      );

      // Segunda llamada: página ajustada a 1
      visitorRepository.searchWithFilters.mockResolvedValueOnce(
        ok({
          visitors: visitors as any,
          total: 15,
          page: 1,
          limit: 100,
          totalPages: 1,
        }),
      );

      const query = createQuery({}, {}, { page: 4, limit: 100 });
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();

      // Verificar que se llamó dos veces al repositorio
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledTimes(2);

      // Primera llamada con página 4
      expect(visitorRepository.searchWithFilters).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ page: 4, limit: 100 }),
      );

      // Segunda llamada con página ajustada a 1
      expect(visitorRepository.searchWithFilters).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ page: 1, limit: 100 }),
      );

      // Verificar que la respuesta tiene datos (no vacía)
      expect(response.visitors).toHaveLength(1);
      expect(response.pagination.page).toBe(1);
      expect(response.pagination.totalPages).toBe(1);
    });

    it('should not auto-adjust when page is within valid range', async () => {
      const visitors = [createMockVisitor(), createMockVisitor()];

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: visitors as any,
          total: 100,
          page: 2,
          limit: 20,
          totalPages: 5,
        }),
      );

      const query = createQuery({}, {}, { page: 2, limit: 20 });
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);

      // Solo debe llamarse una vez, sin ajuste
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledTimes(1);
    });

    it('should NOT filter by isInternal (show both regular and internal visitors)', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery(); // Sin filtros explícitos
      await handler.execute(query);

      // Verificar que NO se aplica filtro isInternal (debe ser undefined)
      const callArgs = visitorRepository.searchWithFilters.mock.calls[0];
      const filtersArg = callArgs[1];
      expect(filtersArg.isInternal).toBeUndefined();
    });

    it('should NOT add isInternal filter even when other filters are present', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({
        lifecycle: ['lead'],
        connectionStatus: ['online'],
        hasAcceptedPrivacyPolicy: true,
      });
      await handler.execute(query);

      // Verificar que isInternal NO está presente, solo los filtros explícitos
      const callArgs = visitorRepository.searchWithFilters.mock.calls[0];
      const filtersArg = callArgs[1];
      expect(filtersArg.lifecycle).toEqual(['lead']);
      expect(filtersArg.connectionStatus).toEqual(['online']);
      expect(filtersArg.hasAcceptedPrivacyPolicy).toBe(true);
      expect(filtersArg.isInternal).toBeUndefined(); // NO debe estar presente
    });

    it('should set isMe to true when request IP matches visitor session IP', async () => {
      const requestIp = '192.168.1.100';
      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: requestIp, // Coincide con la IP del request
          userAgent: 'Mozilla/5.0',
        },
      ];

      const visitor = createMockVisitor(sessions);
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery({}, {}, {}, requestIp);
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(true);
    });

    it('should set isMe to false when request IP does not match any visitor session IP', async () => {
      const requestIp = '192.168.1.100';
      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: '10.0.0.1', // NO coincide con la IP del request
          userAgent: 'Mozilla/5.0',
        },
      ];

      const visitor = createMockVisitor(sessions);
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery({}, {}, {}, requestIp);
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(false);
    });

    it('should set isMe to false when requestIpAddress is not provided', async () => {
      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
        },
      ];

      const visitor = createMockVisitor(sessions);
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(); // Sin requestIpAddress
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(false);
    });

    it('should set isMe to true when request IP matches any session (not just the most recent)', async () => {
      const requestIp = '192.168.1.100';
      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date(Date.now() - 3600000).toISOString(), // Más antigua
          lastActivityAt: new Date(Date.now() - 3600000).toISOString(),
          endedAt: new Date(Date.now() - 3000000).toISOString(),
          currentUrl: 'https://example.com/old',
          ipAddress: requestIp, // Sesión antigua con IP coincidente
          userAgent: 'Mozilla/5.0',
        },
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(), // Más reciente
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com/new',
          ipAddress: '10.0.0.1', // Sesión reciente con IP diferente
          userAgent: 'Mozilla/5.0',
        },
      ];

      const visitor = createMockVisitor(sessions);
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery({}, {}, {}, requestIp);
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(true); // Aunque la IP coincida solo con una sesión antigua
    });

    // ===== TESTS PARA LÓGICA HÍBRIDA (FINGERPRINT + IP+USERAGENT) =====

    it('should set isMe to true when visitor fingerprint matches commercial known fingerprints', async () => {
      const commercialId = Uuid.random().value;
      const visitorFingerprint = 'fp_commercial_browser';
      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
        },
      ];

      const visitor = createMockVisitor(sessions, visitorFingerprint);

      // Mock del comercial con el fingerprint conocido
      const mockCommercial = {
        getKnownFingerprints: jest
          .fn()
          .mockReturnValue([visitorFingerprint, 'fp_other']),
      } as any;
      commercialRepository.findById.mockResolvedValue(ok(mockCommercial));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(
        {},
        {},
        {},
        '192.168.1.100',
        'Mozilla/5.0',
        commercialId,
      );
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(true); // Match por fingerprint
      expect(commercialRepository.findById).toHaveBeenCalledWith(
        expect.objectContaining({ value: commercialId }),
      );
    });

    it('should set isMe to true when IP and UserAgent both match (fallback from fingerprint)', async () => {
      const commercialId = Uuid.random().value;
      const requestIp = '192.168.1.100';
      const requestUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
      const visitorFingerprint = 'fp_different_visitor';

      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: requestIp, // IP coincide
          userAgent: requestUserAgent, // UserAgent coincide
        },
      ];

      const visitor = createMockVisitor(sessions, visitorFingerprint);

      // Mock del comercial con fingerprints diferentes
      const mockCommercial = {
        getKnownFingerprints: jest
          .fn()
          .mockReturnValue(['fp_commercial_other', 'fp_commercial_other2']),
      } as any;
      commercialRepository.findById.mockResolvedValue(ok(mockCommercial));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(
        {},
        {},
        {},
        requestIp,
        requestUserAgent,
        commercialId,
      );
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(true); // Match por IP + UserAgent
    });

    it('should set isMe to false when only IP matches but UserAgent does not', async () => {
      const commercialId = Uuid.random().value;
      const requestIp = '192.168.1.100';
      const requestUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: requestIp, // IP coincide
          userAgent: 'Chrome/91.0 Different UserAgent', // UserAgent NO coincide
        },
      ];

      const visitor = createMockVisitor(sessions, 'fp_different');

      // Mock del comercial sin fingerprint match
      const mockCommercial = {
        getKnownFingerprints: jest.fn().mockReturnValue(['fp_commercial_only']),
      } as any;
      commercialRepository.findById.mockResolvedValue(ok(mockCommercial));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(
        {},
        {},
        {},
        requestIp,
        requestUserAgent,
        commercialId,
      );
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(false); // NO match (solo IP no es suficiente)
    });

    it('should set isMe to false when only UserAgent matches but IP does not', async () => {
      const commercialId = Uuid.random().value;
      const requestIp = '192.168.1.100';
      const requestUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: '10.0.0.1', // IP NO coincide
          userAgent: requestUserAgent, // UserAgent coincide
        },
      ];

      const visitor = createMockVisitor(sessions, 'fp_different');

      // Mock del comercial sin fingerprint match
      const mockCommercial = {
        getKnownFingerprints: jest.fn().mockReturnValue(['fp_commercial_only']),
      } as any;
      commercialRepository.findById.mockResolvedValue(ok(mockCommercial));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(
        {},
        {},
        {},
        requestIp,
        requestUserAgent,
        commercialId,
      );
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(false); // NO match (solo UserAgent no es suficiente)
    });

    it('should set isMe to false when neither fingerprint nor IP+UserAgent match', async () => {
      const commercialId = Uuid.random().value;
      const requestIp = '192.168.1.100';
      const requestUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: '10.0.0.1', // IP diferente
          userAgent: 'Chrome/91.0 Different', // UserAgent diferente
        },
      ];

      const visitor = createMockVisitor(sessions, 'fp_visitor_unique');

      // Mock del comercial con fingerprints diferentes
      const mockCommercial = {
        getKnownFingerprints: jest.fn().mockReturnValue(['fp_commercial_diff']),
      } as any;
      commercialRepository.findById.mockResolvedValue(ok(mockCommercial));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(
        {},
        {},
        {},
        requestIp,
        requestUserAgent,
        commercialId,
      );
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(false); // Ningún criterio coincide
    });

    it('should prioritize fingerprint match over IP+UserAgent match', async () => {
      const commercialId = Uuid.random().value;
      const visitorFingerprint = 'fp_commercial_browser';
      const requestIp = '10.0.0.1'; // IP diferente
      const requestUserAgent = 'Different UserAgent'; // UserAgent diferente

      const sessions = [
        {
          id: Uuid.random().value,
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          endedAt: null,
          currentUrl: 'https://example.com',
          ipAddress: requestIp,
          userAgent: requestUserAgent,
        },
      ];

      const visitor = createMockVisitor(sessions, visitorFingerprint);

      // Mock del comercial con el fingerprint coincidente
      const mockCommercial = {
        getKnownFingerprints: jest.fn().mockReturnValue([visitorFingerprint]),
      } as any;
      commercialRepository.findById.mockResolvedValue(ok(mockCommercial));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [visitor] as any,
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      );
      _chatRepository.countByVisitorIds.mockResolvedValue(ok(new Map()));
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      const query = createQuery(
        {},
        {},
        {},
        requestIp,
        requestUserAgent,
        commercialId,
      );
      const result = await handler.execute(query);

      expect(result.isOk()).toBe(true);
      const response = result.unwrap();
      expect(response.visitors[0].isMe).toBe(true); // Match por fingerprint tiene prioridad
    });

    // ===== TESTS PARA FILTRO hasPendingChats =====

    it('should filter by visitorIds when hasPendingChats is true and there are pending chats', async () => {
      const visitorId1 = Uuid.random().value;
      const visitorId2 = Uuid.random().value;

      // Mock chats pendientes con visitorIds específicos
      const mockPendingChats = [
        { visitorId: { getValue: () => visitorId1 } },
        { visitorId: { getValue: () => visitorId2 } },
      ];
      _chatRepository.getAvailableChats.mockResolvedValue(
        ok(mockPendingChats as any),
      );

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ hasPendingChats: true });
      await handler.execute(query);

      // Verificar que se llamó con visitorIds
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          visitorIds: expect.arrayContaining([visitorId1, visitorId2]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should use impossible ID when hasPendingChats is true but no pending chats exist', async () => {
      // Mock sin chats pendientes
      _chatRepository.getAvailableChats.mockResolvedValue(ok([]));

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ hasPendingChats: true });
      await handler.execute(query);

      // Verificar que se llamó con ID imposible para forzar resultado vacío
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          visitorIds: ['00000000-0000-0000-0000-000000000000'],
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should filter by excludeVisitorIds when hasPendingChats is false', async () => {
      const visitorId1 = Uuid.random().value;
      const visitorId2 = Uuid.random().value;

      // Mock chats pendientes
      const mockPendingChats = [
        { visitorId: { getValue: () => visitorId1 } },
        { visitorId: { getValue: () => visitorId2 } },
      ];
      _chatRepository.getAvailableChats.mockResolvedValue(
        ok(mockPendingChats as any),
      );

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ hasPendingChats: false });
      await handler.execute(query);

      // Verificar que se llamó con excludeVisitorIds
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          excludeVisitorIds: expect.arrayContaining([visitorId1, visitorId2]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should not apply visitorIds filter when hasPendingChats is undefined', async () => {
      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({}); // Sin hasPendingChats
      await handler.execute(query);

      // Verificar que NO se aplicó visitorIds ni excludeVisitorIds
      const callArgs = visitorRepository.searchWithFilters.mock.calls[0];
      const filtersArg = callArgs[1];
      expect(filtersArg.visitorIds).toBeUndefined();
      expect(filtersArg.excludeVisitorIds).toBeUndefined();
    });

    it('should deduplicate visitorIds when same visitor has multiple pending chats', async () => {
      const visitorId = Uuid.random().value;

      // Mock con múltiples chats del mismo visitante
      const mockPendingChats = [
        { visitorId: { getValue: () => visitorId } },
        { visitorId: { getValue: () => visitorId } },
        { visitorId: { getValue: () => visitorId } },
      ];
      _chatRepository.getAvailableChats.mockResolvedValue(
        ok(mockPendingChats as any),
      );

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({ hasPendingChats: true });
      await handler.execute(query);

      // Verificar que solo hay un visitorId (deduplicado)
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          visitorIds: [visitorId], // Solo uno, no tres
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should combine hasPendingChats with other filters', async () => {
      const visitorId = Uuid.random().value;

      const mockPendingChats = [{ visitorId: { getValue: () => visitorId } }];
      _chatRepository.getAvailableChats.mockResolvedValue(
        ok(mockPendingChats as any),
      );

      visitorRepository.searchWithFilters.mockResolvedValue(
        ok({
          visitors: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }),
      );

      const query = createQuery({
        hasPendingChats: true,
        lifecycle: ['LEAD'],
        connectionStatus: ['online'],
      });
      await handler.execute(query);

      // Verificar que se combinan todos los filtros
      expect(visitorRepository.searchWithFilters).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          visitorIds: [visitorId],
          lifecycle: ['lead'],
          connectionStatus: ['online'],
        }),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
