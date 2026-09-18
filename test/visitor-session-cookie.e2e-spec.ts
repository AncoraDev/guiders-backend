import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { CqrsModule } from '@nestjs/cqrs';
import * as cookieParser from 'cookie-parser';
import { VisitorV2Controller } from '../src/context/visitors-v2/infrastructure/controllers/visitor-v2.controller';
import { IdentifyVisitorCommandHandler } from '../src/context/visitors-v2/application/commands/identify-visitor.command-handler';
import { EndSessionCommandHandler } from '../src/context/visitors-v2/application/commands/end-session.command-handler';
import { ResolveSiteCommandHandler } from '../src/context/visitors-v2/application/commands/resolve-site.command-handler';
import {
  VisitorV2Repository,
  VISITOR_V2_REPOSITORY,
} from '../src/context/visitors-v2/domain/visitor-v2.repository';
import {
  CompanyRepository,
  COMPANY_REPOSITORY,
} from '../src/context/company/domain/company.repository';
import {
  VALIDATE_DOMAIN_API_KEY,
  ValidateDomainApiKey,
} from '../src/context/auth/auth-visitor/application/services/validate-domain-api-key';
import { EventPublisher } from '@nestjs/cqrs';
import { ok, err, okVoid } from '../src/context/shared/domain/result';
import { VisitorV2PersistenceError } from '../src/context/visitors-v2/infrastructure/persistence/impl/visitor-v2-mongo.repository.impl';
import { VisitorV2 } from '../src/context/visitors-v2/domain/visitor-v2.aggregate';
import { VisitorId } from '../src/context/visitors-v2/domain/value-objects/visitor-id';
import { SessionId } from '../src/context/visitors-v2/domain/value-objects/session-id';
import { TenantId } from '../src/context/visitors-v2/domain/value-objects/tenant-id';
import { SiteId } from '../src/context/visitors-v2/domain/value-objects/site-id';
import { VisitorFingerprint } from '../src/context/visitors-v2/domain/value-objects/visitor-fingerprint';
import {
  VisitorLifecycleVO,
  VisitorLifecycle,
} from '../src/context/visitors-v2/domain/value-objects/visitor-lifecycle';
import { Company } from '../src/context/company/domain/company.aggregate';
import { CompanyName } from '../src/context/company/domain/value-objects/company-name';
import { CompanySites } from '../src/context/company/domain/value-objects/company-sites';
import { Site } from '../src/context/company/domain/entities/site';
import { SiteName } from '../src/context/company/domain/value-objects/site-name';
import { CanonicalDomain } from '../src/context/company/domain/value-objects/canonical-domain';
import { DomainAliases } from '../src/context/company/domain/value-objects/domain-aliases';
import { Uuid } from '../src/context/shared/domain/value-objects/uuid';
import { RecordConsentCommandHandler } from '../src/context/consent/application/commands/record-consent.command-handler';
import { DenyConsentCommandHandler } from '../src/context/consent/application/commands/deny-consent.command-handler';
import {
  ConsentRepository,
  CONSENT_REPOSITORY,
} from '../src/context/consent/domain/consent.repository';
import {
  VisitorConnectionDomainService,
  VISITOR_CONNECTION_DOMAIN_SERVICE,
} from '../src/context/visitors-v2/domain/visitor-connection.domain-service';
import {
  LEAD_SCORING_SERVICE,
  LeadScoringService,
} from '../src/context/lead-scoring/domain/lead-scoring.service';
import {
  TRACKING_EVENT_REPOSITORY,
  TrackingEventRepository,
} from '../src/context/tracking-v2/domain/tracking-event.repository';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../src/context/conversations-v2/domain/chat.repository';
import { EventBus } from '@nestjs/cqrs';
import { DualAuthGuard } from '../src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from '../src/context/shared/infrastructure/guards/role.guard';
import {
  CommercialRepository,
  COMMERCIAL_REPOSITORY,
} from '../src/context/commercial/domain/commercial.repository';
import { BffSessionAuthService } from '../src/context/shared/infrastructure/services/bff-session-auth.service';

class MockDualAuthGuard {
  canActivate() {
    return true;
  }
}

class MockRolesGuard {
  canActivate() {
    return true;
  }
}

// Este test valida que el backend acepta heartbeats y endSession usando únicamente la cookie HttpOnly
// sin enviar sessionId explícito en el body.

describe('Visitor Session Cookie Fallback E2E', () => {
  let app: INestApplication;
  let mockVisitorRepository: jest.Mocked<VisitorV2Repository>;
  let mockCompanyRepository: jest.Mocked<CompanyRepository>;
  let mockCommercialRepository: jest.Mocked<CommercialRepository>;
  let mockValidateDomainApiKey: jest.Mocked<ValidateDomainApiKey>;
  let mockBffSessionAuthService: jest.Mocked<BffSessionAuthService>;
  let mockEventPublisher: jest.Mocked<EventPublisher>;
  let mockConsentRepository: jest.Mocked<ConsentRepository>;
  let mockConnectionService: jest.Mocked<VisitorConnectionDomainService>;
  let mockLeadScoringService: jest.Mocked<LeadScoringService>;
  let mockTrackingRepository: jest.Mocked<TrackingEventRepository>;
  let mockChatRepository: jest.Mocked<IChatRepository>;
  let mockEventBus: jest.Mocked<EventBus>;

  const mockVisitorId = '01234567-8901-4234-9567-890123456789';
  const mockTenantId = '23456789-0123-4567-8901-234567890123';
  const mockSiteId = '34567890-1234-4567-8901-234567890123';

  const createMockCompany = () => {
    const companyId = new Uuid(mockTenantId);
    const siteId = new SiteId(mockSiteId);
    const site = Site.create({
      id: siteId,
      name: new SiteName('Landing Site'),
      canonicalDomain: new CanonicalDomain('landing.mytech.com'),
      domainAliases: DomainAliases.fromPrimitives([
        'landing.mytech.com',
        'www.landing.mytech.com',
      ]),
    });

    return Company.create({
      id: companyId,
      companyName: new CompanyName('MyTech Company'),
      sites: CompanySites.fromSiteArray([site]),
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
    });
  };

  beforeEach(async () => {
    mockVisitorRepository = {
      findByFingerprintAndSite: jest.fn(),
      findByFingerprint: jest.fn(),
      findBySessionId: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
      findBySiteId: jest.fn(),
      findByTenantId: jest.fn(),
      update: jest.fn(),
      findWithActiveSessions: jest.fn(),
      findBySiteIdWithDetails: jest.fn(),
      findWithUnassignedChatsBySiteId: jest.fn(),
      findWithQueuedChatsBySiteId: jest.fn(),
      findByTenantIdWithDetails: jest.fn(),
      findWithUnassignedChatsByTenantId: jest.fn(),
      findWithQueuedChatsByTenantId: jest.fn(),
      searchWithFilters: jest.fn(),
      countWithFilters: jest.fn(),
    };

    mockCompanyRepository = {
      findByDomain: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      updateCannedReplies: jest.fn(),
      updateContactFormLegal: jest.fn(),
    };

    mockCommercialRepository = {
      findByFingerprint: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      findAll: jest.fn(),
    } as any;

    mockBffSessionAuthService = {
      validateSession: jest.fn(),
      createSession: jest.fn(),
      invalidateSession: jest.fn(),
    } as any;

    mockValidateDomainApiKey = { validate: jest.fn() } as any;
    mockEventPublisher = { mergeObjectContext: jest.fn() } as any;

    mockConsentRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByVisitorId: jest.fn(),
      findByVisitorIdAndType: jest.fn(),
    } as any;

    mockConnectionService = {
      setConnectionStatus: jest.fn(),
      getConnectionStatus: jest.fn(),
      removeConnection: jest.fn(),
      isVisitorOnline: jest.fn(),
      getChattingVisitors: jest.fn(),
      getOnlineVisitors: jest.fn(),
      setTyping: jest.fn(),
      isTyping: jest.fn(),
      clearTyping: jest.fn(),
      getTypingInChat: jest.fn(),
      updateLastActivity: jest.fn(),
      getLastActivity: jest.fn(),
      isVisitorActive: jest.fn(),
    } as any;

    mockLeadScoringService = {
      calculateScore: jest.fn().mockReturnValue({
        toPrimitives: () => ({
          score: 0,
          tier: 'cold',
          signals: {
            isRecurrentVisitor: false,
            hasHighEngagement: false,
            hasInvestedTime: false,
            needsHelp: false,
          },
        }),
      }),
    } as any;

    mockTrackingRepository = {
      getStatsByVisitor: jest.fn(),
    } as any;

    mockChatRepository = {
      findByVisitorId: jest.fn(),
    } as any;

    mockEventBus = {
      publish: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule],
      controllers: [VisitorV2Controller],
      providers: [
        IdentifyVisitorCommandHandler,
        EndSessionCommandHandler,
        ResolveSiteCommandHandler,
        RecordConsentCommandHandler,
        DenyConsentCommandHandler,
        { provide: VISITOR_V2_REPOSITORY, useValue: mockVisitorRepository },
        { provide: COMPANY_REPOSITORY, useValue: mockCompanyRepository },
        { provide: COMMERCIAL_REPOSITORY, useValue: mockCommercialRepository },
        {
          provide: VALIDATE_DOMAIN_API_KEY,
          useValue: mockValidateDomainApiKey,
        },
        { provide: BffSessionAuthService, useValue: mockBffSessionAuthService },
        { provide: CONSENT_REPOSITORY, useValue: mockConsentRepository },
        {
          provide: VISITOR_CONNECTION_DOMAIN_SERVICE,
          useValue: mockConnectionService,
        },
        { provide: EventPublisher, useValue: mockEventPublisher },
        { provide: LEAD_SCORING_SERVICE, useValue: mockLeadScoringService },
        {
          provide: TRACKING_EVENT_REPOSITORY,
          useValue: mockTrackingRepository,
        },
        { provide: CHAT_V2_REPOSITORY, useValue: mockChatRepository },
        { provide: EventBus, useValue: mockEventBus },
      ],
    })
      .overrideGuard(DualAuthGuard)
      .useClass(MockDualAuthGuard)
      .overrideGuard(RolesGuard)
      .useClass(MockRolesGuard)
      .compile();

    app = module.createNestApplication();
    // Habilitar cookie-parser para que el controller pueda leer la cookie 'sid'
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    mockValidateDomainApiKey.validate.mockResolvedValue(true);
    mockConsentRepository.save.mockResolvedValue(okVoid());
    mockVisitorRepository.save.mockResolvedValue(okVoid());

    const mockCompany = createMockCompany();
    mockCompanyRepository.findByDomain.mockResolvedValue(ok(mockCompany));
  });

  afterEach(async () => {
    await app.close();
  });

  it('debe permitir endSession usando solo cookie sid', async () => {
    // 1. identify crea visitante nuevo
    mockVisitorRepository.findByFingerprintAndSite.mockResolvedValue(
      err(new VisitorV2PersistenceError('Visitante no encontrado')),
    );

    const mockContextIdentify = {
      commit: jest.fn(),
      getId: jest.fn().mockReturnValue(new VisitorId(mockVisitorId)),
      getLifecycle: jest
        .fn()
        .mockReturnValue(new VisitorLifecycleVO(VisitorLifecycle.ANON)),
      getActiveSessions: jest.fn().mockReturnValue([
        {
          getId: jest.fn().mockReturnValue({ value: SessionId.random().value }),
        },
      ]),
    };
    mockEventPublisher.mergeObjectContext.mockReturnValueOnce(
      mockContextIdentify as any,
    );
    mockVisitorRepository.save.mockResolvedValue(okVoid());

    const identifyRes = await request(app.getHttpServer())
      .post('/visitors/identify')
      .send({
        fingerprint: 'fp_cookie_test',
        domain: 'landing.mytech.com',
        apiKey: 'ak_live_1234567890',
        hasAcceptedPrivacyPolicy: true,
      })
      .expect(200);

    // Capturar cookie sid (header puede ser string o string[])
    const setCookieHeader = identifyRes.header['set-cookie'] as
      | string
      | string[]
      | undefined;
    expect(setCookieHeader).toBeDefined();
    const cookiesArray = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const sidCookie = cookiesArray.find((c) => c.startsWith('x-guiders-sid='));
    expect(sidCookie).toBeDefined();

    // Preparar mock findBySessionId para end
    const visitorForEnd = VisitorV2.create({
      id: new VisitorId(identifyRes.body.visitorId),
      tenantId: new TenantId(mockTenantId),
      siteId: new SiteId(mockSiteId),
      fingerprint: new VisitorFingerprint('fp_cookie_test'),
      lifecycle: new VisitorLifecycleVO(VisitorLifecycle.ANON),
    });
    mockVisitorRepository.findBySessionId.mockResolvedValue(ok(visitorForEnd));

    // 2. endSession sin sessionId en body (usa cookie)
    const mockContextEnd = {
      ...visitorForEnd,
      commit: jest.fn(),
      endCurrentSession: jest.fn(),
      getId: jest
        .fn()
        .mockReturnValue(new VisitorId(identifyRes.body.visitorId)),
    };
    mockEventPublisher.mergeObjectContext.mockReturnValueOnce(
      mockContextEnd as any,
    );

    await request(app.getHttpServer())
      .post('/visitors/session/end')
      .set('Cookie', sidCookie as string)
      .send({ visitorId: identifyRes.body.visitorId, reason: 'cookie-flow' })
      .expect(200);

    // Aserciones clave
    expect(mockVisitorRepository.findBySessionId).toHaveBeenCalled();
    // La cookie x-guiders-sid ya no es httpOnly para permitir acceso desde JavaScript
    expect(sidCookie).not.toContain('HttpOnly');
  });
});
