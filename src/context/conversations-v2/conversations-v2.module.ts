import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { SEARCH_PROVIDER } from 'src/context/shared/domain/search';
import { ChatSearchProvider } from './infrastructure/search/chat-search.provider';

// Import dependencies from other modules
import { VisitorsV2Module } from '../visitors-v2/visitors-v2.module';
import { CommercialModule } from '../commercial/commercial.module';
import { WebSocketModule } from 'src/websocket/websocket.module';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import { AuthUserModule } from '../auth/auth-user/infrastructure/auth-user.module';

// Controllers
import { ChatV2Controller } from './infrastructure/controllers/chat-v2.controller';
import { CommercialChatsV2Controller } from './infrastructure/controllers/commercial-chats-v2.controller';
import { VisitorChatsV2Controller } from './infrastructure/controllers/visitor-chats-v2.controller';
import { MessageV2Controller } from './infrastructure/controllers/message-v2.controller';
import { AssignmentRulesController } from './infrastructure/controllers/assignment-rules.controller';
import { PresenceController } from './infrastructure/controllers/presence.controller';

// Infrastructure
import {
  ChatSchema,
  ChatSchemaDefinition,
} from './infrastructure/schemas/chat.schema';
import {
  MessageSchema,
  MessageSchemaDefinition,
} from './infrastructure/schemas/message.schema';
import { ChatMapper } from './infrastructure/mappers/chat.mapper';
import { MessageMapper } from './infrastructure/mappers/message.mapper';
import { MongoChatRepositoryImpl } from './infrastructure/persistence/impl/mongo-chat.repository.impl';
import { MongoMessageRepositoryImpl } from './infrastructure/persistence/impl/mongo-message.repository.impl';
import { InMemoryAssignmentRulesRepository } from './infrastructure/persistence/impl/in-memory-assignment-rules.repository.impl';

// Domain
import { CHAT_V2_REPOSITORY } from './domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from './domain/message.repository';
import { ASSIGNMENT_RULES_REPOSITORY } from './domain/assignment-rules.repository';

// Guards
import { AuthGuard } from 'src/context/shared/infrastructure/guards/auth.guard';
import { OptionalAuthGuard } from 'src/context/shared/infrastructure/guards/optional-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { TokenVerifyService } from 'src/context/shared/infrastructure/token-verify.service';
import { VisitorSessionAuthService } from 'src/context/shared/infrastructure/services/visitor-session-auth.service';
import { BffSessionAuthService } from 'src/context/shared/infrastructure/services/bff-session-auth.service';

// Command Handlers
import { JoinWaitingRoomCommandHandler } from './application/commands/join-waiting-room.command-handler';
import { ClearVisitorChatsCommandHandler } from './application/commands/clear-visitor-chats.command-handler';
import { CreateChatWithMessageCommandHandler } from './application/commands/create-chat-with-message.command-handler';
import { SendMessageCommandHandler } from './application/commands/send-message.command-handler';
import { AutoAssignChatCommandHandler } from './application/commands/auto-assign-chat.command-handler';
import { CreateAssignmentRulesCommandHandler } from './application/commands/create-assignment-rules.command-handler';
import { AssignChatToCommercialCommandHandler } from './application/commands/assign-chat-to-commercial.command-handler';
import { TransferChatToCommercialCommandHandler } from './application/commands/transfer-chat-to-commercial.command-handler';
import { MarkMessagesAsReadCommandHandler } from './application/commands/mark-messages-as-read.command-handler';
import { ResetChatUnreadCountCommandHandler } from './application/commands/reset-chat-unread-count.command-handler';
import { StartTypingCommandHandler } from './application/commands/start-typing.command-handler';
import { StopTypingCommandHandler } from './application/commands/stop-typing.command-handler';
import { RequestAgentCommandHandler } from './application/commands/request-agent.command-handler';
import { OpenChatViewCommandHandler } from './application/commands/open-chat-view.command-handler';
import { CloseChatViewCommandHandler } from './application/commands/close-chat-view.command-handler';

// Query Handlers
import { GetChatsWithFiltersQueryHandler } from './application/queries/get-chats-with-filters.query-handler';
import { GetChatByIdQueryHandler } from './application/queries/get-chat-by-id.query-handler';
import { GetChatMessagesQueryHandler } from './application/queries/get-chat-messages.query-handler';
import { GetApplicableAssignmentRulesQueryHandler } from './application/queries/get-applicable-assignment-rules.query-handler';
import { GetPendingQueueQueryHandler } from './application/queries/get-pending-queue.query-handler';
import { GetVisitorPendingChatsQueryHandler } from './application/queries/get-visitor-pending-chats.query-handler';
import { GetUnreadMessagesQueryHandler } from './application/queries/get-unread-messages.query-handler';
import { GetChatPresenceQueryHandler } from './application/queries/get-chat-presence.query-handler';

// Event Handlers
import { ProcessAutoAssignmentOnChatAutoAssignmentRequestedEventHandler } from './application/events/process-auto-assignment-on-chat-auto-assignment-requested.event-handler';
import { NotifyMessageSentOnMessageSentEventHandler } from './application/events/notify-message-sent-on-message-sent.event-handler';
import { UpdateChatOnMessageSentEventHandler } from './application/events/update-chat-on-message-sent.event-handler';
import { NotifyChatCreatedOnChatCreatedEventHandler } from './application/events/notify-chat-created-on-chat-created.event-handler';
import { NotifyTypingStartedOnTypingStartedEventHandler } from './application/events/notify-typing-started-on-typing-started.event-handler';
import { NotifyTypingStoppedOnTypingStoppedEventHandler } from './application/events/notify-typing-stopped-on-typing-stopped.event-handler';
import { NotifyAgentRequestedOnAgentRequestedEventHandler } from './application/events/notify-agent-requested-on-agent-requested.event-handler';
import { NotifyViewOpenedOnChatViewOpenedEventHandler } from './application/events/notify-view-opened-on-chat-view-opened.event-handler';
import { NotifyViewClosedOnChatViewClosedEventHandler } from './application/events/notify-view-closed-on-chat-view-closed.event-handler';
import { NotifyCommercialAssignedOnCommercialAssignedEventHandler } from './application/events/notify-commercial-assigned-on-commercial-assigned.event-handler';
import { NotifyUnreadCountUpdatedOnUnreadCountUpdatedEventHandler } from './application/events/notify-unread-count-updated-on-unread-count-updated.event-handler';

// Domain Services
import { CHAT_AUTO_ASSIGNMENT_DOMAIN_SERVICE } from './domain/services/chat-auto-assignment.domain-service';
import { ChatAutoAssignmentDomainServiceImpl } from './infrastructure/services/chat-auto-assignment.domain-service.impl';
import { CHAT_QUEUE_CONFIG_SERVICE } from './domain/services/chat-queue-config.service';
import { ChatQueueConfigServiceImpl } from './infrastructure/services/chat-queue-config.service.impl';

/**
 * Módulo principal para el contexto Conversations V2
 * Contiene toda la configuración necesaria para la gestión optimizada de chats
 */
@Module({
  imports: [
    CqrsModule, // Para Command/Query handlers
    HttpModule, // Para TokenVerifyService
    WebSocketModule, // Para notificaciones en tiempo real
    forwardRef(() => VisitorsV2Module), // Para acceso al VisitorV2Repository
    CommercialModule, // Para acceso al Commercial heartbeat service
    AuthUserModule, // Para acceso a UserAccount queries
    MongooseModule.forFeature([
      { name: ChatSchema.name, schema: ChatSchemaDefinition },
      { name: MessageSchema.name, schema: MessageSchemaDefinition },
    ]),
  ],
  controllers: [
    ChatV2Controller,
    CommercialChatsV2Controller,
    VisitorChatsV2Controller,
    MessageV2Controller,
    AssignmentRulesController,
    PresenceController,
  ],
  providers: [
    // Guards
    AuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    TokenVerifyService,

    // Services
    VisitorSessionAuthService,
    BffSessionAuthService,

    // WebSocket Gateway Provider
    {
      provide: 'WEBSOCKET_GATEWAY',
      useExisting: WebSocketGatewayBasic,
    },

    // Mappers
    ChatMapper,
    MessageMapper,

    // Repository Implementation
    {
      provide: CHAT_V2_REPOSITORY,
      useClass: MongoChatRepositoryImpl,
    },
    {
      provide: MESSAGE_V2_REPOSITORY,
      useClass: MongoMessageRepositoryImpl,
    },
    {
      provide: ASSIGNMENT_RULES_REPOSITORY,
      useClass: InMemoryAssignmentRulesRepository,
    },

    // Domain Services
    {
      provide: CHAT_AUTO_ASSIGNMENT_DOMAIN_SERVICE,
      useClass: ChatAutoAssignmentDomainServiceImpl,
    },
    {
      provide: CHAT_QUEUE_CONFIG_SERVICE,
      useClass: ChatQueueConfigServiceImpl,
    },

    // Command Handlers
    JoinWaitingRoomCommandHandler,
    ClearVisitorChatsCommandHandler,
    CreateChatWithMessageCommandHandler,
    SendMessageCommandHandler,
    AutoAssignChatCommandHandler,
    CreateAssignmentRulesCommandHandler,
    AssignChatToCommercialCommandHandler,
    TransferChatToCommercialCommandHandler,
    MarkMessagesAsReadCommandHandler,
    ResetChatUnreadCountCommandHandler,
    StartTypingCommandHandler,
    StopTypingCommandHandler,
    RequestAgentCommandHandler,
    OpenChatViewCommandHandler,
    CloseChatViewCommandHandler,
    // CloseChatCommandHandler,
    // CreateChatCommandHandler,

    // Query Handlers
    GetChatsWithFiltersQueryHandler,
    GetChatByIdQueryHandler,
    GetChatMessagesQueryHandler,
    GetApplicableAssignmentRulesQueryHandler,
    GetPendingQueueQueryHandler,
    GetVisitorPendingChatsQueryHandler,
    GetUnreadMessagesQueryHandler,
    GetChatPresenceQueryHandler,

    // Event Handlers
    ProcessAutoAssignmentOnChatAutoAssignmentRequestedEventHandler,
    NotifyMessageSentOnMessageSentEventHandler,
    UpdateChatOnMessageSentEventHandler,
    NotifyChatCreatedOnChatCreatedEventHandler,
    NotifyTypingStartedOnTypingStartedEventHandler,
    NotifyTypingStoppedOnTypingStoppedEventHandler,
    NotifyAgentRequestedOnAgentRequestedEventHandler,
    NotifyViewOpenedOnChatViewOpenedEventHandler,
    NotifyViewClosedOnChatViewClosedEventHandler,
    NotifyCommercialAssignedOnCommercialAssignedEventHandler,
    NotifyUnreadCountUpdatedOnUnreadCountUpdatedEventHandler,
    // GetChatByIdQueryHandler,
    // GetCommercialChatsQueryHandler,
    // GetVisitorChatsQueryHandler,
    // GetCommercialMetricsQueryHandler,
    // GetResponseTimeStatsQueryHandler,

    // Services
    // ChatV2Service,
    // MetricsService,

    // Search Provider — registrado como multi-provider para GlobalSearchQueryHandler
    ChatSearchProvider,
    {
      provide: SEARCH_PROVIDER,
      useExisting: ChatSearchProvider,
    },
  ],
  exports: [
    CHAT_V2_REPOSITORY,
    ChatSearchProvider,
    SEARCH_PROVIDER,
    MESSAGE_V2_REPOSITORY,
    // TODO: Exportar cuando se implementen
    // ChatV2Service,
  ],
})
export class ConversationsV2Module {}
