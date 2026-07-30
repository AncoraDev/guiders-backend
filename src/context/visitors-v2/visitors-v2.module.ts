import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SEARCH_PROVIDER } from 'src/context/shared/domain/search';
import { VisitorSearchProvider } from './infrastructure/search/visitor-search.provider';
import {
  VisitorV2MongoEntity,
  VisitorV2MongoEntitySchema,
} from './infrastructure/persistence/entity/visitor-v2-mongo.entity';
import {
  SavedFilterMongoEntity,
  SavedFilterMongoEntitySchema,
} from './infrastructure/persistence/entity/saved-filter-mongo.entity';
import { VisitorV2Controller } from './infrastructure/controllers/visitor-v2.controller';
import { SitesController } from './infrastructure/controllers/sites.controller';
import { SiteVisitorsController } from './infrastructure/controllers/site-visitors.controller';
import { TenantVisitorsController } from './infrastructure/controllers/tenant-visitors.controller';
import { IdentifyVisitorCommandHandler } from './application/commands/identify-visitor.command-handler';
import { EndSessionCommandHandler } from './application/commands/end-session.command-handler';
import { ResolveSiteCommandHandler } from './application/commands/resolve-site.command-handler';
import { CleanExpiredSessionsCommandHandler } from './application/commands/clean-expired-sessions.command-handler';
import { VisitorV2MongoRepositoryImpl } from './infrastructure/persistence/impl/visitor-v2-mongo.repository.impl';
import { VISITOR_V2_REPOSITORY } from './domain/visitor-v2.repository';
import { CompanyModule } from '../company/company.module';
import { CommercialModule } from '../commercial/commercial.module';
import { AuthVisitorModule } from '../auth/auth-visitor/infrastructure/auth-visitor.module';
import { ConversationsV2Module } from '../conversations-v2/conversations-v2.module';
import { GoOnlineVisitorCommandHandler } from './application/commands/go-online-visitor.command-handler';
import { StartChattingVisitorCommandHandler } from './application/commands/start-chatting-visitor.command-handler';
import { GoOfflineVisitorCommandHandler } from './application/commands/go-offline-visitor.command-handler';
import { ChangeVisitorConnectionStatusCommandHandler } from './application/commands/change-visitor-connection-status.command-handler';
import { UpdateVisitorSessionActivityCommandHandler } from './application/commands/update-visitor-session-activity.command-handler';
import { GetOnlineVisitorsQueryHandler } from './application/queries/get-online-visitors.query-handler';
import { GetChattingVisitorsQueryHandler } from './application/queries/get-chatting-visitors.query-handler';
import { GetVisitorConnectionStatusQueryHandler } from './application/queries/get-visitor-connection-status.query-handler';
import { GetVisitorsBySiteQueryHandler } from './application/queries/get-visitors-by-site.query-handler';
import { GetVisitorsWithUnassignedChatsBySiteQueryHandler } from './application/queries/get-visitors-with-unassigned-chats-by-site.query-handler';
import { GetVisitorsWithQueuedChatsBySiteQueryHandler } from './application/queries/get-visitors-with-queued-chats-by-site.query-handler';
import { GetVisitorsByTenantQueryHandler } from './application/queries/get-visitors-by-tenant.query-handler';
import { GetVisitorsWithUnassignedChatsByTenantQueryHandler } from './application/queries/get-visitors-with-unassigned-chats-by-tenant.query-handler';
import { GetVisitorsWithQueuedChatsByTenantQueryHandler } from './application/queries/get-visitors-with-queued-chats-by-tenant.query-handler';
import { GetVisitorCurrentPageQueryHandler } from './application/queries/get-visitor-current-page.query-handler';
import { GetVisitorActivityQueryHandler } from './application/queries/get-visitor-activity.query-handler';
import { GetVisitorPageHistoryQueryHandler } from './application/queries/get-visitor-page-history.query-handler';
import { GetVisitorSiteQueryHandler } from './application/queries/get-visitor-site.query-handler';
import { SearchVisitorsQueryHandler } from './application/queries/search-visitors.query-handler';
import { GetQuickFiltersConfigQueryHandler } from './application/queries/get-quick-filters-config.query-handler';
import { GetSavedFiltersQueryHandler } from './application/queries/get-saved-filters.query-handler';
import { GetVisitorStatsQueryHandler } from './application/queries/get-visitor-stats.query-handler';
import { SaveFilterCommandHandler } from './application/commands/save-filter.command-handler';
import { DeleteSavedFilterCommandHandler } from './application/commands/delete-saved-filter.command-handler';
import { SavedFilterMongoRepositoryImpl } from './infrastructure/persistence/impl/saved-filter-mongo.repository.impl';
import { SAVED_FILTER_REPOSITORY } from './domain/saved-filter.repository';
import { SyncConnectionOnVisitorConnectionChangedEventHandler } from './application/events/visitor-connection-changed.event-handler';
import { EmitPresenceChangedOnVisitorConnectionChangedEventHandler } from './application/events/emit-presence-changed-on-visitor-connection-changed.event-handler';
import { ChangeVisitorToOfflineOnSessionEndedEventHandler } from './application/events/change-visitor-to-offline-on-session-ended.event-handler';
import { NotifyPageChangedOnVisitorCurrentPageChangedEventHandler } from './application/events/notify-page-changed-on-visitor-current-page-changed.event-handler';
import { NotifyHighIntentOnVisitorBecameHighIntentEventHandler } from './application/events/notify-high-intent-on-visitor-became-high-intent.event-handler';
import { MarkVisitorAsInternalOnCommercialFingerprintRegisteredEventHandler } from './application/events/mark-visitor-as-internal-on-fingerprint-registered.handler';
import { VISITOR_CONNECTION_DOMAIN_SERVICE } from './domain/visitor-connection.domain-service';
import { VISITOR_CONNECTION_SERVICE_PROVIDER } from './infrastructure/connection/redis-visitor-connection.domain-service';
import { SessionCleanupScheduler } from './application/services/session-cleanup.scheduler';
import { SESSION_MANAGEMENT_SERVICE_PROVIDER } from './infrastructure/providers/session-management.provider';
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../shared/infrastructure/services/bff-session-auth.service';
import { VisitorSessionAuthService } from '../shared/infrastructure/services/visitor-session-auth.service';
import { ConsentModule } from '../consent/consent.module';
import { WebSocketModule } from '../../websocket/websocket.module';
import { WebSocketGatewayBasic } from '../../websocket/websocket.gateway';
import { TrackingV2Module } from '../tracking-v2/tracking-v2.module';
import { LeadScoringModule } from '../lead-scoring/lead-scoring.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VisitorV2MongoEntity.name, schema: VisitorV2MongoEntitySchema },
      {
        name: SavedFilterMongoEntity.name,
        schema: SavedFilterMongoEntitySchema,
      },
    ]),
    CqrsModule,
    HttpModule, // Para TokenVerifyService
    JwtModule.register({}), // Para TokenVerifyService
    ConfigModule, // Para TokenVerifyService
    CompanyModule,
    CommercialModule, // ← Importar para acceder a CommercialRepository
    AuthVisitorModule,
    ConsentModule, // ← Importar para que RecordConsentCommand esté disponible
    forwardRef(() => ConversationsV2Module),
    TrackingV2Module,
    WebSocketModule,
    LeadScoringModule,
  ],
  controllers: [
    VisitorV2Controller,
    SitesController,
    SiteVisitorsController,
    TenantVisitorsController,
  ],
  providers: [
    {
      provide: VISITOR_V2_REPOSITORY,
      useClass: VisitorV2MongoRepositoryImpl,
    },
    {
      provide: SAVED_FILTER_REPOSITORY,
      useClass: SavedFilterMongoRepositoryImpl,
    },
    IdentifyVisitorCommandHandler,
    EndSessionCommandHandler,
    ResolveSiteCommandHandler,
    CleanExpiredSessionsCommandHandler,
    GoOnlineVisitorCommandHandler,
    StartChattingVisitorCommandHandler,
    GoOfflineVisitorCommandHandler,
    ChangeVisitorConnectionStatusCommandHandler,
    UpdateVisitorSessionActivityCommandHandler,
    GetOnlineVisitorsQueryHandler,
    GetChattingVisitorsQueryHandler,
    GetVisitorConnectionStatusQueryHandler,
    GetVisitorsBySiteQueryHandler,
    GetVisitorsWithUnassignedChatsBySiteQueryHandler,
    GetVisitorsWithQueuedChatsBySiteQueryHandler,
    GetVisitorsByTenantQueryHandler,
    GetVisitorsWithUnassignedChatsByTenantQueryHandler,
    GetVisitorsWithQueuedChatsByTenantQueryHandler,
    GetVisitorCurrentPageQueryHandler,
    GetVisitorActivityQueryHandler,
    GetVisitorPageHistoryQueryHandler,
    GetVisitorSiteQueryHandler,
    SearchVisitorsQueryHandler,
    GetQuickFiltersConfigQueryHandler,
    GetSavedFiltersQueryHandler,
    GetVisitorStatsQueryHandler,
    SaveFilterCommandHandler,
    DeleteSavedFilterCommandHandler,
    SyncConnectionOnVisitorConnectionChangedEventHandler,
    EmitPresenceChangedOnVisitorConnectionChangedEventHandler,
    ChangeVisitorToOfflineOnSessionEndedEventHandler,
    NotifyPageChangedOnVisitorCurrentPageChangedEventHandler,
    NotifyHighIntentOnVisitorBecameHighIntentEventHandler,
    MarkVisitorAsInternalOnCommercialFingerprintRegisteredEventHandler,
    VISITOR_CONNECTION_SERVICE_PROVIDER,
    SESSION_MANAGEMENT_SERVICE_PROVIDER,
    SessionCleanupScheduler,
    TokenVerifyService,
    BffSessionAuthService,
    VisitorSessionAuthService,
    {
      provide: 'WEBSOCKET_GATEWAY',
      useExisting: WebSocketGatewayBasic,
    },

    // Search Provider — registrado como multi-provider para GlobalSearchQueryHandler
    VisitorSearchProvider,
    {
      provide: SEARCH_PROVIDER,
      useExisting: VisitorSearchProvider,
    },
  ],
  exports: [
    VISITOR_V2_REPOSITORY,
    VISITOR_CONNECTION_DOMAIN_SERVICE,
    VisitorSearchProvider,
    SEARCH_PROVIDER,
  ],
})
export class VisitorsV2Module {}
