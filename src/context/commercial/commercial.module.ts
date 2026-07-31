import { Module, forwardRef } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';

// Domain
import { COMMERCIAL_CONNECTION_DOMAIN_SERVICE } from './domain/commercial-connection.domain-service';
import { COMMERCIAL_REPOSITORY } from './domain/commercial.repository';

// Application - Queries
import { GetAvailableCommercialsQueryHandler } from './application/queries/get-available-commercials.query-handler';
import { GetOnlineCommercialsQueryHandler } from './application/queries/get-online-commercials.query-handler';
import { GetCommercialConnectionStatusQueryHandler } from './application/queries/get-commercial-connection-status.query-handler';
import { GetCommercialByIdQueryHandler } from './application/queries/get-commercial-by-id.query-handler';
import { GetCommercialAvailabilityBySiteQueryHandler } from './application/queries/get-commercial-availability-by-site.query-handler';

// Application - Commands
import { ConnectCommercialCommandHandler } from './application/commands/connect-commercial.command-handler';
import { DisconnectCommercialCommandHandler } from './application/commands/disconnect-commercial.command-handler';
import { UpdateCommercialActivityCommandHandler } from './application/commands/update-commercial-activity.command-handler';
import { ChangeCommercialConnectionStatusCommandHandler } from './application/commands/change-commercial-connection-status.command-handler';
import { RegisterCommercialFingerprintCommandHandler } from './application/commands/register-commercial-fingerprint.command-handler';

// Application - Events
import { CreateApiKeyOnCommercialConnectedEventHandler } from './application/events/create-api-key-on-commercial-connected.event-handler';
import { LogActivityOnCommercialHeartbeatReceivedEventHandler } from './application/events/log-activity-on-commercial-heartbeat-received.event-handler';
import { UpdateMetricsOnCommercialDisconnectedEventHandler } from './application/events/update-metrics-on-commercial-disconnected.event-handler';
import { EmitPresenceChangedOnCommercialConnectionStatusChangedEventHandler } from './application/events/emit-presence-changed-on-commercial-connection-status-changed.event-handler';

// Infrastructure - Events
import { NotifyTenantOnCommercialPresenceChangedEventHandler } from './infrastructure/events/notify-tenant-on-commercial-presence-changed.event-handler';

// Infrastructure
import { MongoCommercialRepositoryImpl } from './infrastructure/persistence/impl/mongo-commercial.repository.impl';
import { CommercialController } from './infrastructure/controllers/commercial.controller';
import { RedisCommercialConnectionDomainService } from './infrastructure/connection/redis-commercial-connection.domain-service';

// Schema imports
import { CommercialSchemaDefinition } from './infrastructure/persistence/schemas/commercial.schema';
import { CommercialConnectionSessionSchemaDefinition } from './infrastructure/persistence/schemas/commercial-connection-session.schema';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
} from './domain/commercial-connection-session.repository';
import { MongoCommercialConnectionSessionRepositoryImpl } from './infrastructure/persistence/impl/mongo-commercial-connection-session.repository.impl';

// External dependencies needed by controller
import { AuthVisitorModule } from '../auth/auth-visitor/infrastructure/auth-visitor.module';
import { AuthUserModule } from '../auth/auth-user/infrastructure/auth-user.module';
import { CompanyModule } from '../company/company.module';
import { WebSocketModule } from 'src/websocket/websocket.module';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';

/**
 * Módulo del contexto Commercial
 * Gestiona la funcionalidad de comerciales y su heartbeat
 */
@Module({
  imports: [
    CqrsModule,
    HttpModule,
    JwtModule.register({}),
    ConfigModule,
    MongooseModule.forFeature([
      { name: 'Commercial', schema: CommercialSchemaDefinition },
      {
        name: 'CommercialConnectionSession',
        schema: CommercialConnectionSessionSchemaDefinition,
      },
    ]),
    // Módulos externos necesarios para el controller
    AuthVisitorModule, // Para validación de API Key
    forwardRef(() => AuthUserModule), // Para obtener datos de UserAccount (nombre, avatar) - forwardRef para evitar dependencia circular
    CompanyModule, // Para resolver dominio a tenantId/siteId
    forwardRef(() => WebSocketModule), // Para emitir eventos WS al tenant — forwardRef por posible ciclo
  ],
  controllers: [CommercialController],
  providers: [
    // Repositories
    {
      provide: COMMERCIAL_REPOSITORY,
      useClass: MongoCommercialRepositoryImpl,
    },
    {
      provide: COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
      useClass: MongoCommercialConnectionSessionRepositoryImpl,
    },

    // Domain Services - Redis implementation para funcionalidad real-time
    {
      provide: COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
      useClass: RedisCommercialConnectionDomainService,
    },

    // Query Handlers
    GetAvailableCommercialsQueryHandler,
    GetOnlineCommercialsQueryHandler,
    GetCommercialConnectionStatusQueryHandler,
    GetCommercialByIdQueryHandler,
    GetCommercialAvailabilityBySiteQueryHandler,

    // Command Handlers
    ConnectCommercialCommandHandler,
    DisconnectCommercialCommandHandler,
    UpdateCommercialActivityCommandHandler,
    ChangeCommercialConnectionStatusCommandHandler,
    RegisterCommercialFingerprintCommandHandler,

    // Event Handlers
    CreateApiKeyOnCommercialConnectedEventHandler,
    LogActivityOnCommercialHeartbeatReceivedEventHandler,
    UpdateMetricsOnCommercialDisconnectedEventHandler,
    EmitPresenceChangedOnCommercialConnectionStatusChangedEventHandler,
    NotifyTenantOnCommercialPresenceChangedEventHandler,

    // Schedulers — CommercialInactivityScheduler desactivado:
    // presencia es manual (toggle Console); no away/offline por inactividad.

    // Servicios compartidos necesarios para AuthGuard
    TokenVerifyService,

    // Alias local para inyectar el gateway en command handlers de presencia
    {
      provide: 'WEBSOCKET_GATEWAY',
      useExisting: WebSocketGatewayBasic,
    },
  ],
  exports: [COMMERCIAL_REPOSITORY, COMMERCIAL_CONNECTION_DOMAIN_SERVICE],
})
export class CommercialModule {}
