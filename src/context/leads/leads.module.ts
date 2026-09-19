import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SEARCH_PROVIDER } from 'src/context/shared/domain/search';
import { LeadSearchProvider } from './infrastructure/search/lead-search.provider';

// Schemas
import {
  CrmCompanyConfigSchema,
  CrmCompanyConfigSchemaDefinition,
} from './infrastructure/persistence/schemas/crm-company-config.schema';
import {
  CrmSyncRecordSchema,
  CrmSyncRecordSchemaDefinition,
} from './infrastructure/persistence/schemas/crm-sync-record.schema';
import {
  LeadContactDataSchema,
  LeadContactDataSchemaDefinition,
} from './infrastructure/persistence/schemas/lead-contact-data.schema';

// Controllers
import { LeadsContactController } from './infrastructure/controllers/leads-contact.controller';
import { LeadsAdminController } from './infrastructure/controllers/leads-admin.controller';

// Repository Symbols
import { LEAD_CONTACT_DATA_REPOSITORY } from './domain/lead-contact-data.repository';
import { CRM_COMPANY_CONFIG_REPOSITORY } from './domain/crm-company-config.repository';
import { CRM_SYNC_RECORD_REPOSITORY } from './domain/crm-sync-record.repository';
import { CRM_SYNC_SERVICE_FACTORY } from './domain/services/crm-sync.service';

// Repository Implementations
import { MongoLeadContactDataRepositoryImpl } from './infrastructure/persistence/impl/mongo-lead-contact-data.repository.impl';
import { MongoCrmCompanyConfigRepositoryImpl } from './infrastructure/persistence/impl/mongo-crm-company-config.repository.impl';
import { MongoCrmSyncRecordRepositoryImpl } from './infrastructure/persistence/impl/mongo-crm-sync-record.repository.impl';

// Command Handlers
import { SaveLeadContactDataCommandHandler } from './application/commands/save-lead-contact-data-command.handler';
import { UpdateLeadFollowUpCommandHandler } from './application/commands/update-lead-follow-up.command-handler';
import { SyncLeadToCrmCommandHandler } from './application/commands/sync-lead-to-crm-command.handler';
import { SyncChatToCrmCommandHandler } from './application/commands/sync-chat-to-crm-command.handler';

// Event Handlers
import { SyncLeadOnLifecycleChangedEventHandler } from './application/events/sync-lead-on-lifecycle-changed.event-handler';
import { SyncChatOnChatClosedEventHandler } from './application/events/sync-chat-on-chat-closed.event-handler';

// Adapters & Services
import {
  LeadcarsApiService,
  LeadcarsCrmSyncAdapter,
} from './infrastructure/adapters/leadcars';
import { CrmSyncServiceFactory } from './infrastructure/services/crm-sync-service.factory';
import { CrmEncryptionService } from './infrastructure/services/crm-encryption.service';

// Shared Services
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../shared/infrastructure/services/bff-session-auth.service';
import { VisitorSessionAuthService } from '../shared/infrastructure/services/visitor-session-auth.service';

// External Modules
import { ConversationsV2Module } from '../conversations-v2/conversations-v2.module';
import { VisitorsV2Module } from '../visitors-v2/visitors-v2.module';

const CommandHandlers = [
  SaveLeadContactDataCommandHandler,
  UpdateLeadFollowUpCommandHandler,
  SyncLeadToCrmCommandHandler,
  SyncChatToCrmCommandHandler,
];

const EventHandlers = [
  SyncLeadOnLifecycleChangedEventHandler,
  SyncChatOnChatClosedEventHandler,
];

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CrmCompanyConfigSchema.name,
        schema: CrmCompanyConfigSchemaDefinition,
      },
      { name: CrmSyncRecordSchema.name, schema: CrmSyncRecordSchemaDefinition },
      {
        name: LeadContactDataSchema.name,
        schema: LeadContactDataSchemaDefinition,
      },
    ]),
    CqrsModule,
    HttpModule,
    JwtModule.register({}),
    ConfigModule,
    forwardRef(() => ConversationsV2Module),
    forwardRef(() => VisitorsV2Module),
  ],
  controllers: [LeadsContactController, LeadsAdminController],
  providers: [
    // Repositories
    {
      provide: LEAD_CONTACT_DATA_REPOSITORY,
      useClass: MongoLeadContactDataRepositoryImpl,
    },
    {
      provide: CRM_COMPANY_CONFIG_REPOSITORY,
      useClass: MongoCrmCompanyConfigRepositoryImpl,
    },
    {
      provide: CRM_SYNC_RECORD_REPOSITORY,
      useClass: MongoCrmSyncRecordRepositoryImpl,
    },
    // CRM Adapters
    LeadcarsApiService,
    LeadcarsCrmSyncAdapter,
    // Factory
    {
      provide: CRM_SYNC_SERVICE_FACTORY,
      useClass: CrmSyncServiceFactory,
    },
    // Encryption
    CrmEncryptionService,
    // Command Handlers
    ...CommandHandlers,
    // Event Handlers
    ...EventHandlers,
    // Shared Services for Auth Guards
    TokenVerifyService,
    BffSessionAuthService,
    VisitorSessionAuthService,

    // Search Provider — registrado como multi-provider para GlobalSearchQueryHandler
    LeadSearchProvider,
    {
      provide: SEARCH_PROVIDER,
      useExisting: LeadSearchProvider,
    },
  ],
  exports: [
    LEAD_CONTACT_DATA_REPOSITORY,
    CRM_COMPANY_CONFIG_REPOSITORY,
    CRM_SYNC_RECORD_REPOSITORY,
    CRM_SYNC_SERVICE_FACTORY,
    LeadSearchProvider,
    SEARCH_PROVIDER,
  ],
})
export class LeadsModule {}
