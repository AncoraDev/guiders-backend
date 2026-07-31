import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyEntity } from './api-key.entity';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyService } from './api-key.service';
import { CreateApiKeyForDomainUseCase } from '../application/usecase/create-api-key-for-domain.usecase';
import { API_KEY_REPOSITORY } from '../domain/repository/api-key.repository';
import { ApiKeyOrmAdapter } from './api-key-orm-adapter';
import { AsymmetricKeyGeneratorService } from './asymmetric-key-generator.service';
import { EncryptAdapter } from './encrypt-adapter';
import { ApiKeyMapper } from './api-key.mapper';
import { JwksController } from './jwks.controller';
import { JwksService } from './jwks.service';
import { GetAllApiKeysUseCase } from '../application/usecase/get-all-api-keys.usecase';
import { GetApiKeysByCompanyIdUseCase } from '../application/usecase/get-api-keys-by-company-id.usecase';
import { Sha256HashStrategy } from '../../../shared/infrastructure/sha-256-hash-strategy';
import { TokenVerifyService } from '../../../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../../../shared/infrastructure/services/bff-session-auth.service';
import { AuthGuard } from '../../../shared/infrastructure/guards/auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/guards/role.guard';
import { DualAuthGuard } from '../../../shared/infrastructure/guards/dual-auth.guard';
import { API_KEY_ENCRYPT_PRIVATE_KEY } from '../application/services/api-key-encrypt-private-key';
import { API_KEY_HASHER } from '../application/services/api-key-hasher';
import { API_KEY_GENERATE_KEYS } from '../application/services/api-key-generate-keys';
import { CreateApiKeyOnCompanyCreatedEventHandler } from '../application/events/create-api-key-on-company-created-event.handler';

@Module({
  // Importamos módulos necesarios para TokenVerifyService (JWT, HTTP y Config)
  imports: [
    TypeOrmModule.forFeature([ApiKeyEntity]),
    JwtModule.register({}),
    HttpModule,
    ConfigModule,
  ],
  providers: [
    { provide: API_KEY_REPOSITORY, useClass: ApiKeyOrmAdapter },
    {
      provide: API_KEY_GENERATE_KEYS,
      useClass: AsymmetricKeyGeneratorService,
    },
    { provide: API_KEY_ENCRYPT_PRIVATE_KEY, useClass: EncryptAdapter },
    { provide: API_KEY_HASHER, useClass: Sha256HashStrategy },
    ApiKeyService,
    ApiKeyMapper,
    CreateApiKeyForDomainUseCase,
    GetAllApiKeysUseCase,
    GetApiKeysByCompanyIdUseCase,
    JwksService,
    // Auth / security
    TokenVerifyService,
    BffSessionAuthService,
    DualAuthGuard,
    AuthGuard,
    RolesGuard,

    // handlers
    CreateApiKeyOnCompanyCreatedEventHandler,
  ],
  controllers: [ApiKeyController, JwksController],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
