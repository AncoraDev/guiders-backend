import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { CqrsModule } from '@nestjs/cqrs';
import { IntegrationApiKeyEntity } from './integration-api-key.entity';
import { IntegrationApiKeyController } from './integration-api-key.controller';
import { IntegrationApiKeyOrmAdapter } from './integration-api-key-orm-adapter';
import { IntegrationApiKeyMapper } from './integration-api-key.mapper';
import { IntegrationApiKeyGeneratorService } from './integration-api-key-generator.service';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { INTEGRATION_API_KEY_REPOSITORY } from '../domain/repository/integration-api-key.repository';
import { INTEGRATION_API_KEY_GENERATOR } from '../application/services/integration-api-key-generator';
import { CreateIntegrationApiKeyCommandHandler } from '../application/commands/create-integration-api-key.command-handler';
import { RevokeIntegrationApiKeyCommandHandler } from '../application/commands/revoke-integration-api-key.command-handler';
import { ListIntegrationApiKeysQueryHandler } from '../application/queries/list-integration-api-keys.query-handler';
import { TokenVerifyService } from '../../../shared/infrastructure/token-verify.service';
import { AuthGuard } from '../../../shared/infrastructure/guards/auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/guards/role.guard';
import { EMBED_TOKEN_SERVICE } from '../domain/services/embed-token.service';
import { RedisEmbedTokenService } from './services/redis-embed-token.service';
import { CreateEmbedTokenCommandHandler } from '../application/commands/create-embed-token.command-handler';
import { RefreshEmbedTokenCommandHandler } from '../application/commands/refresh-embed-token.command-handler';
import { EmbedController } from './controllers/embed.controller';
import { EmbedTokenGuard } from './guards/embed-token.guard';
import { WHITE_LABEL_CONFIG_REPOSITORY } from '../../../white-label/domain/white-label-config.repository';
import { WhiteLabelModule } from '../../../white-label/white-label.module';
import { USER_ACCOUNT_REPOSITORY } from '../../../auth/auth-user/domain/user-account.repository';
import { UserAccountService } from '../../../auth/auth-user/infrastructure/services/user-account.service';
import { UserAccountMapper } from '../../../auth/auth-user/infrastructure/user-account-mapper';
// Story 2.2: audit log
import {
  EmbedTokenAuditLogSchema,
  EmbedTokenAuditLogSchemaDefinition,
} from './schemas/embed-token-audit-log.schema';
import { EMBED_TOKEN_AUDIT_LOG_REPOSITORY } from '../domain/repositories/embed-token-audit-log.repository';
import { MongoEmbedTokenAuditLogRepositoryImpl } from './persistence/mongo-embed-token-audit-log.repository.impl';
import { PersistEmbedTokenAuthenticatedEventHandler } from '../application/events/persist-embed-token-authenticated.event-handler';
import { PersistEmbedTokenAuthenticationFailedEventHandler } from '../application/events/persist-embed-token-authentication-failed.event-handler';
import { FindEmbedTokenAuditLogQueryHandler } from '../application/queries/find-embed-token-audit-log.query-handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([IntegrationApiKeyEntity]),
    JwtModule.register({}),
    HttpModule,
    ConfigModule,
    // TD-5: Import WhiteLabelModule instead of duplicating the WHITE_LABEL_CONFIG_REPOSITORY
    // provider. WhiteLabelModule already registers the Mongoose schema (WhiteLabelConfigSchema)
    // and exports the repository symbol. Previously the repository was registered here WITHOUT
    // its Mongoose schema, causing UnknownDependenciesException at server startup.
    WhiteLabelModule,
    // Story 2.2: Mongoose schema for embed_token_audit_log
    MongooseModule.forFeature([
      {
        name: EmbedTokenAuditLogSchema.name,
        schema: EmbedTokenAuditLogSchemaDefinition,
      },
    ]),
    // Story 2.2: CqrsModule for event publishing
    CqrsModule,
  ],
  providers: [
    {
      provide: INTEGRATION_API_KEY_REPOSITORY,
      useClass: IntegrationApiKeyOrmAdapter,
    },
    {
      provide: INTEGRATION_API_KEY_GENERATOR,
      useClass: IntegrationApiKeyGeneratorService,
    },
    {
      provide: EMBED_TOKEN_SERVICE,
      useClass: RedisEmbedTokenService,
    },
    // TD-5: Removed local WHITE_LABEL_CONFIG_REPOSITORY provider — now provided by WhiteLabelModule
    {
      provide: USER_ACCOUNT_REPOSITORY,
      useClass: UserAccountService,
    },
    // TD-5: UserAccountService constructor requires UserAccountMapper.
    // We add it here as a local provider because IntegrationApiKeyModule
    // does not import AuthUserModule (which provides the mapper).
    UserAccountMapper,
    {
      provide: EMBED_TOKEN_AUDIT_LOG_REPOSITORY,
      useClass: MongoEmbedTokenAuditLogRepositoryImpl,
    },
    IntegrationApiKeyMapper,
    CreateIntegrationApiKeyCommandHandler,
    RevokeIntegrationApiKeyCommandHandler,
    ListIntegrationApiKeysQueryHandler,
    CreateEmbedTokenCommandHandler,
    RefreshEmbedTokenCommandHandler,
    // Story 2.2: audit log handlers
    PersistEmbedTokenAuthenticatedEventHandler,
    PersistEmbedTokenAuthenticationFailedEventHandler,
    FindEmbedTokenAuditLogQueryHandler,
    EmbedTokenGuard,
    IntegrationApiKeyGuard,
    TokenVerifyService,
    AuthGuard,
    RolesGuard,
  ],
  controllers: [IntegrationApiKeyController, EmbedController],
  exports: [
    IntegrationApiKeyGuard,
    INTEGRATION_API_KEY_REPOSITORY,
    EMBED_TOKEN_SERVICE,
    EmbedTokenGuard,
    EMBED_TOKEN_AUDIT_LOG_REPOSITORY,
  ],
})
export class IntegrationApiKeyModule {}
