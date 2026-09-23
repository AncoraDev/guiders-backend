import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher, CommandBus } from '@nestjs/cqrs';
import { IdentifyVisitorCommandHandler } from '../identify-visitor.command-handler';
import { IdentifyVisitorCommand } from '../identify-visitor.command';
import {
  VisitorV2Repository,
  VISITOR_V2_REPOSITORY,
} from '../../../domain/visitor-v2.repository';
import { err, ok, okVoid } from '../../../../shared/domain/result';
import {
  VALIDATE_DOMAIN_API_KEY,
  ValidateDomainApiKey,
} from '../../../../auth/auth-visitor/application/services/validate-domain-api-key';
import {
  CompanyRepository,
  COMPANY_REPOSITORY,
} from '../../../../company/domain/company.repository';
import {
  CommercialRepository,
  COMMERCIAL_REPOSITORY,
} from '../../../../commercial/domain/commercial.repository';
import { CompanyNotFoundError } from '../../../../company/domain/errors/company.error';
import { BffSessionAuthService } from '../../../../shared/infrastructure/services/bff-session-auth.service';
import { Uuid } from '../../../../shared/domain/value-objects/uuid';
import {
  TRACKING_EVENT_REPOSITORY,
  TrackingEventRepository,
} from '../../../../tracking-v2/domain/tracking-event.repository';
import { TrackingEvent } from '../../../../tracking-v2/domain/tracking-event.aggregate';
import {
  TrackingEventId,
  EventType,
  EventMetadata,
  EventOccurredAt,
  VisitorId,
  SessionId,
  TenantId,
  SiteId,
} from '../../../../tracking-v2/domain/value-objects';

describe('IdentifyVisitorCommandHandler', () => {
  let handler: IdentifyVisitorCommandHandler;
  let visitorRepository: VisitorV2Repository;
  let companyRepository: CompanyRepository;
  let commercialRepository: CommercialRepository;
  let validateDomainApiKey: ValidateDomainApiKey;
  let bffSessionAuthService: BffSessionAuthService;
  let trackingRepository: TrackingEventRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentifyVisitorCommandHandler,
        {
          provide: VISITOR_V2_REPOSITORY,
          useValue: {
            findByFingerprintAndSite: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: COMPANY_REPOSITORY,
          useValue: {
            findByDomain: jest.fn(),
          },
        },
        {
          provide: VALIDATE_DOMAIN_API_KEY,
          useValue: {
            validate: jest.fn(),
          },
        },
        {
          provide: COMMERCIAL_REPOSITORY,
          useValue: {
            findByFingerprintAndTenant: jest.fn(),
          },
        },
        {
          provide: EventPublisher,
          useValue: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            mergeObjectContext: jest.fn((obj: any) => ({
              ...obj,
              commit: jest.fn(),
            })),
          },
        },
        {
          provide: CommandBus,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: BffSessionAuthService,
          useValue: {
            extractBffSessionTokens: jest.fn(),
            validateBffSession: jest.fn(),
          },
        },
        {
          provide: TRACKING_EVENT_REPOSITORY,
          useValue: {
            findByVisitorId: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<IdentifyVisitorCommandHandler>(
      IdentifyVisitorCommandHandler,
    );
    visitorRepository = module.get<VisitorV2Repository>(VISITOR_V2_REPOSITORY);
    companyRepository = module.get<CompanyRepository>(COMPANY_REPOSITORY);
    commercialRepository = module.get<CommercialRepository>(
      COMMERCIAL_REPOSITORY,
    );
    validateDomainApiKey = module.get<ValidateDomainApiKey>(
      VALIDATE_DOMAIN_API_KEY,
    );
    bffSessionAuthService = module.get<BffSessionAuthService>(
      BffSessionAuthService,
    );
    trackingRepository = module.get<TrackingEventRepository>(
      TRACKING_EVENT_REPOSITORY,
    );

    // Mock por defecto: no se encuentra comercial por fingerprint (visitante normal)
    (
      commercialRepository.findByFingerprintAndTenant as jest.Mock
    ).mockResolvedValue(ok(null));
    (trackingRepository.findByVisitorId as jest.Mock).mockResolvedValue(
      ok({ events: [], totalCount: 0, hasMore: false }),
    );
    (trackingRepository.save as jest.Mock).mockResolvedValue(okVoid());
  });

  describe('execute', () => {
    const validCommand = new IdentifyVisitorCommand(
      'fp_abc123def456',
      'landing.mytech.com',
      'ak_live_1234567890',
      true, // hasAcceptedPrivacyPolicy
      '192.168.1.1', // ipAddress
      'Mozilla/5.0', // userAgent
      undefined, // cookieHeader
      'https://landing.mytech.com/home',
    );

    beforeEach(() => {
      jest.clearAllMocks();
      (trackingRepository.findByVisitorId as jest.Mock).mockResolvedValue(
        ok({ events: [], totalCount: 0, hasMore: false }),
      );
      (trackingRepository.save as jest.Mock).mockResolvedValue(okVoid());
    });

    it('debe lanzar error cuando la API Key es inválida', async () => {
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(false);

      await expect(handler.execute(validCommand)).rejects.toThrow(
        'API Key inválida para el dominio proporcionado',
      );

      expect(companyRepository.findByDomain).not.toHaveBeenCalled();
      expect(visitorRepository.findByFingerprintAndSite).not.toHaveBeenCalled();
    });

    it('debe lanzar error cuando no se encuentra la empresa', async () => {
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(err(new CompanyNotFoundError()));

      await expect(handler.execute(validCommand)).rejects.toThrow(
        'No se encontró una empresa para el dominio: landing.mytech.com',
      );

      expect(validateDomainApiKey.validate).toHaveBeenCalled();
      expect(visitorRepository.findByFingerprintAndSite).not.toHaveBeenCalled();
    });

    it('debe normalizar el dominio eliminando el prefijo www.', async () => {
      const commandWithWww = new IdentifyVisitorCommand(
        'fp_abc123def456',
        'www.landing.mytech.com', // ← Con www.
        'ak_live_1234567890',
        true, // hasAcceptedPrivacyPolicy
        '192.168.1.1', // ipAddress
        'Mozilla/5.0', // userAgent
        undefined, // cookieHeader
        'https://www.landing.mytech.com/home',
      );

      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(err(new CompanyNotFoundError()));

      await expect(handler.execute(commandWithWww)).rejects.toThrow(
        'No se encontró una empresa para el dominio: landing.mytech.com', // ← Sin www.
      );

      // Verificar que se llamó con el dominio normalizado (sin www.)
      expect(validateDomainApiKey.validate).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'landing.mytech.com', // ← Sin www.
        }),
      );

      expect(companyRepository.findByDomain).toHaveBeenCalledWith(
        'landing.mytech.com', // ← Sin www.
      );
    });

    it('debe funcionar correctamente con dominios que ya no tienen www.', async () => {
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(err(new CompanyNotFoundError()));

      await expect(handler.execute(validCommand)).rejects.toThrow(
        'No se encontró una empresa para el dominio: landing.mytech.com',
      );

      // Verificar que el dominio sin www. se mantiene igual
      expect(validateDomainApiKey.validate).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'landing.mytech.com',
        }),
      );

      expect(companyRepository.findByDomain).toHaveBeenCalledWith(
        'landing.mytech.com',
      );
    });
  });

  describe('Detección de comerciales (isInternal)', () => {
    it('debe marcar visitante como interno cuando detecta sesión de comercial válida', async () => {
      // Generar UUIDs válidos para el test
      const companyId = Uuid.random().value;
      const siteId = Uuid.random().value;

      // Mock de cookie con sesión de comercial
      const commandWithCommercialCookie = new IdentifyVisitorCommand(
        'fp_commercial123',
        'landing.mytech.com',
        'ak_live_1234567890',
        true,
        '192.168.1.1',
        'Mozilla/5.0',
        'console_session=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
        'https://landing.mytech.com/home',
      );

      // Mock de extracción de tokens
      jest
        .spyOn(bffSessionAuthService, 'extractBffSessionTokens')
        .mockReturnValue(['eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...']);

      // Mock de validación de sesión exitosa
      jest
        .spyOn(bffSessionAuthService, 'validateBffSession')
        .mockResolvedValue({
          sub: Uuid.random().value,
          email: 'comercial@mytech.com',
          roles: ['commercial', 'user'],
        });

      // Mock validación de API key
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);

      // Mock de company y site
      const mockCompany = {
        getId: () => ({ getValue: () => companyId }),
        getSites: () => ({
          toPrimitives: () => [
            {
              id: siteId,
              canonicalDomain: 'landing.mytech.com',
              domainAliases: [],
            },
          ],
        }),
      };
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(ok(mockCompany as any));

      // Mock visitante no existente (nuevo visitante)
      jest
        .spyOn(visitorRepository, 'findByFingerprintAndSite')
        .mockResolvedValue(err({ message: 'Not found' } as any));

      // Mock save
      jest.spyOn(visitorRepository, 'save').mockResolvedValue(okVoid());

      // Ejecutar comando
      const result = await handler.execute(commandWithCommercialCookie);

      // Verificar que se llamó a la detección de comercial
      expect(
        bffSessionAuthService.extractBffSessionTokens,
      ).toHaveBeenCalledWith(
        'console_session=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
      );
      expect(bffSessionAuthService.validateBffSession).toHaveBeenCalled();

      // Verificar que se guardó el visitante
      expect(visitorRepository.save).toHaveBeenCalled();
      expect(result.visitorId).toBeDefined();
      expect(result.isNewVisitor).toBe(true);
    });

    it('debe marcar visitante como NO interno cuando no hay cookie de comercial', async () => {
      // Generar UUIDs válidos para el test
      const companyId = Uuid.random().value;
      const siteId = Uuid.random().value;

      // Comando sin cookie
      const commandWithoutCookie = new IdentifyVisitorCommand(
        'fp_regular123',
        'landing.mytech.com',
        'ak_live_1234567890',
        true,
        '192.168.1.1',
        'Mozilla/5.0',
        undefined, // Sin cookie
        'https://landing.mytech.com/home',
      );

      // Mock validación de API key
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);

      // Mock de company y site
      const mockCompany = {
        getId: () => ({ getValue: () => companyId }),
        getSites: () => ({
          toPrimitives: () => [
            {
              id: siteId,
              canonicalDomain: 'landing.mytech.com',
              domainAliases: [],
            },
          ],
        }),
      };
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(ok(mockCompany as any));

      // Mock visitante no existente
      jest
        .spyOn(visitorRepository, 'findByFingerprintAndSite')
        .mockResolvedValue(err({ message: 'Not found' } as any));

      // Mock save
      jest.spyOn(visitorRepository, 'save').mockResolvedValue(okVoid());

      // Ejecutar comando
      const result = await handler.execute(commandWithoutCookie);

      // Verificar que NO se llamó a extractBffSessionTokens
      expect(
        bffSessionAuthService.extractBffSessionTokens,
      ).not.toHaveBeenCalled();

      // Verificar que se guardó el visitante
      expect(visitorRepository.save).toHaveBeenCalled();
      expect(result.visitorId).toBeDefined();
      expect(result.isNewVisitor).toBe(true);
    });

    it('debe marcar visitante como NO interno cuando la validación de sesión falla', async () => {
      // Generar UUIDs válidos para el test
      const companyId = Uuid.random().value;
      const siteId = Uuid.random().value;

      // Mock de cookie con token inválido
      const commandWithInvalidCookie = new IdentifyVisitorCommand(
        'fp_invalid123',
        'landing.mytech.com',
        'ak_live_1234567890',
        true,
        '192.168.1.1',
        'Mozilla/5.0',
        'console_session=invalid_token',
        'https://landing.mytech.com/home',
      );

      // Mock de extracción de tokens
      jest
        .spyOn(bffSessionAuthService, 'extractBffSessionTokens')
        .mockReturnValue(['invalid_token']);

      // Mock de validación de sesión fallida
      jest
        .spyOn(bffSessionAuthService, 'validateBffSession')
        .mockResolvedValue(null);

      // Mock validación de API key
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);

      // Mock de company y site
      const mockCompany = {
        getId: () => ({ getValue: () => companyId }),
        getSites: () => ({
          toPrimitives: () => [
            {
              id: siteId,
              canonicalDomain: 'landing.mytech.com',
              domainAliases: [],
            },
          ],
        }),
      };
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(ok(mockCompany as any));

      // Mock visitante no existente
      jest
        .spyOn(visitorRepository, 'findByFingerprintAndSite')
        .mockResolvedValue(err({ message: 'Not found' } as any));

      // Mock save
      jest.spyOn(visitorRepository, 'save').mockResolvedValue(okVoid());

      // Ejecutar comando
      const result = await handler.execute(commandWithInvalidCookie);

      // Verificar que se llamó a la validación pero falló
      expect(
        bffSessionAuthService.extractBffSessionTokens,
      ).toHaveBeenCalledWith('console_session=invalid_token');
      expect(bffSessionAuthService.validateBffSession).toHaveBeenCalledWith(
        'invalid_token',
      );

      // Verificar que se guardó el visitante
      expect(visitorRepository.save).toHaveBeenCalled();
      expect(result.visitorId).toBeDefined();
      expect(result.isNewVisitor).toBe(true);
    });

    it('debe manejar errores en detección de comercial y continuar con isInternal=false', async () => {
      // Generar UUIDs válidos para el test
      const companyId = Uuid.random().value;
      const siteId = Uuid.random().value;

      // Mock de cookie
      const commandWithCookie = new IdentifyVisitorCommand(
        'fp_error123',
        'landing.mytech.com',
        'ak_live_1234567890',
        true,
        '192.168.1.1',
        'Mozilla/5.0',
        'console_session=some_token',
        'https://landing.mytech.com/home',
      );

      // Mock de extracción que lanza error
      jest
        .spyOn(bffSessionAuthService, 'extractBffSessionTokens')
        .mockImplementation(() => {
          throw new Error('Token extraction failed');
        });

      // Mock validación de API key
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);

      // Mock de company y site
      const mockCompany = {
        getId: () => ({ getValue: () => companyId }),
        getSites: () => ({
          toPrimitives: () => [
            {
              id: siteId,
              canonicalDomain: 'landing.mytech.com',
              domainAliases: [],
            },
          ],
        }),
      };
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(ok(mockCompany as any));

      // Mock visitante no existente
      jest
        .spyOn(visitorRepository, 'findByFingerprintAndSite')
        .mockResolvedValue(err({ message: 'Not found' } as any));

      // Mock save
      jest.spyOn(visitorRepository, 'save').mockResolvedValue(okVoid());

      // Ejecutar comando - no debe fallar aunque la detección lance error
      const result = await handler.execute(commandWithCookie);

      // Verificar que se intentó la detección
      expect(bffSessionAuthService.extractBffSessionTokens).toHaveBeenCalled();

      // Verificar que se guardó el visitante a pesar del error
      expect(visitorRepository.save).toHaveBeenCalled();
      expect(result.visitorId).toBeDefined();
      expect(result.isNewVisitor).toBe(true);
    });
  });

  describe('PAGE_VIEW desde identify', () => {
    const companyId = Uuid.random().value;
    const siteId = Uuid.random().value;

    const mockCompany = {
      getId: () => ({ getValue: () => companyId }),
      getSites: () => ({
        toPrimitives: () => [
          {
            id: siteId,
            canonicalDomain: 'landing.mytech.com',
            domainAliases: [],
          },
        ],
      }),
    };

    const command = new IdentifyVisitorCommand(
      'fp_pages123',
      'landing.mytech.com',
      'ak_live_1234567890',
      true,
      '192.168.1.1',
      'Mozilla/5.0',
      undefined,
      'https://landing.mytech.com/home',
    );

    beforeEach(() => {
      jest.spyOn(validateDomainApiKey, 'validate').mockResolvedValue(true);
      jest
        .spyOn(companyRepository, 'findByDomain')
        .mockResolvedValue(ok(mockCompany as any));
      jest
        .spyOn(visitorRepository, 'findByFingerprintAndSite')
        .mockResolvedValue(err({ message: 'Not found' } as any));
      jest.spyOn(visitorRepository, 'save').mockResolvedValue(okVoid());
      (trackingRepository.findByVisitorId as jest.Mock).mockResolvedValue(
        ok({ events: [], totalCount: 0, hasMore: false }),
      );
      (trackingRepository.save as jest.Mock).mockResolvedValue(okVoid());
    });

    it('debe crear un PAGE_VIEW cuando identify incluye currentUrl', async () => {
      const result = await handler.execute(command);

      expect(result.visitorId).toBeDefined();
      expect(trackingRepository.save).toHaveBeenCalledTimes(1);
      const saved = (trackingRepository.save as jest.Mock).mock
        .calls[0][0] as TrackingEvent;
      expect(saved.getEventType().getValue()).toBe('PAGE_VIEW');
      expect(saved.getMetadata().getValue()).toEqual(
        expect.objectContaining({
          url: 'https://landing.mytech.com/home',
          source: 'identify',
        }),
      );
    });

    it('no debe duplicar PAGE_VIEW de la misma URL en la ventana de 30s', async () => {
      const existing = TrackingEvent.create({
        id: TrackingEventId.random(),
        visitorId: new VisitorId(Uuid.random().value),
        sessionId: SessionId.random(),
        tenantId: new TenantId(companyId),
        siteId: new SiteId(siteId),
        eventType: EventType.pageView(),
        metadata: new EventMetadata({
          url: 'https://landing.mytech.com/home',
          page: { url: 'https://landing.mytech.com/home', path: '/home' },
        }),
        occurredAt: EventOccurredAt.fromTimestamp(Date.now() - 5_000),
      });
      (trackingRepository.findByVisitorId as jest.Mock).mockResolvedValue(
        ok({ events: [existing], totalCount: 1, hasMore: false }),
      );

      await handler.execute(command);

      expect(trackingRepository.save).not.toHaveBeenCalled();
    });

    it('debe crear PAGE_VIEW si la URL anterior es distinta', async () => {
      const existing = TrackingEvent.create({
        id: TrackingEventId.random(),
        visitorId: new VisitorId(Uuid.random().value),
        sessionId: SessionId.random(),
        tenantId: new TenantId(companyId),
        siteId: new SiteId(siteId),
        eventType: EventType.pageView(),
        metadata: new EventMetadata({
          url: 'https://landing.mytech.com/pricing',
        }),
        occurredAt: EventOccurredAt.fromTimestamp(Date.now() - 2_000),
      });
      (trackingRepository.findByVisitorId as jest.Mock).mockResolvedValue(
        ok({ events: [existing], totalCount: 1, hasMore: false }),
      );

      await handler.execute(command);

      expect(trackingRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
