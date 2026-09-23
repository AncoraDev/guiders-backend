/**
 * Módulo White Label - Configuración de marca blanca por empresa
 *
 * Proporciona:
 * - Configuración de colores, branding y tipografía
 * - Upload de logos, favicons y fuentes personalizadas
 * - Almacenamiento en S3
 */

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

// Infrastructure - Persistence
import {
  WhiteLabelConfigSchema,
  WhiteLabelConfigSchemaDefinition,
} from './infrastructure/schemas/white-label-config.schema';
import { MongoWhiteLabelConfigRepositoryProvider } from './infrastructure/persistence/mongo-white-label-config.repository.impl';

// Infrastructure - Services
import { WhiteLabelFileUploadService } from './infrastructure/services/white-label-file-upload.service';

// Infrastructure - Controllers
import { WhiteLabelConfigController } from './infrastructure/controllers/white-label-config.controller';
import { EmbedStartController } from './infrastructure/controllers/embed-start.controller';

// Infrastructure - Cache (Story 4.1 + 4.3)
import { InMemoryTtlCache } from '../shared/infrastructure/cache/in-memory-ttl-cache';
import type { WhiteLabelConfig } from './domain/entities/white-label-config';

// Guards y Auth (importados de shared)
import { DualAuthGuard } from '../shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from '../shared/infrastructure/guards/role.guard';
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../shared/infrastructure/services/bff-session-auth.service';

// Domain exports
import { WHITE_LABEL_CONFIG_REPOSITORY } from './domain/white-label-config.repository';

@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      {
        name: WhiteLabelConfigSchema.name,
        schema: WhiteLabelConfigSchemaDefinition,
      },
    ]),
  ],
  controllers: [WhiteLabelConfigController, EmbedStartController],
  providers: [
    // Guards y Auth
    DualAuthGuard,
    RolesGuard,
    TokenVerifyService,
    BffSessionAuthService,

    // File Upload Service
    WhiteLabelFileUploadService,

    // Config Repository
    MongoWhiteLabelConfigRepositoryProvider,

    // Story 4.1: In-memory cache for white_label_configs (60s TTL)
    // Type-erased factory because InMemoryTtlCache<K,V> is generic
    {
      provide: InMemoryTtlCache,
      useFactory: () =>
        new InMemoryTtlCache<string, WhiteLabelConfig>({ ttlMs: 60_000 }),
    },
  ],
  exports: [
    WHITE_LABEL_CONFIG_REPOSITORY,
    WhiteLabelFileUploadService,
    InMemoryTtlCache,
  ],
})
export class WhiteLabelModule {}
