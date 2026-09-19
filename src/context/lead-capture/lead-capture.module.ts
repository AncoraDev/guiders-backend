import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';

import {
  LeadCaptureFlowSchema,
  LeadCaptureFlowSchemaDefinition,
} from './infrastructure/persistence/schemas/lead-capture-flow.schema';
import {
  LeadCaptureSessionSchema,
  LeadCaptureSessionSchemaDefinition,
} from './infrastructure/persistence/schemas/lead-capture-session.schema';
import { MongoLeadCaptureFlowRepositoryProvider } from './infrastructure/persistence/impl/mongo-lead-capture-flow.repository.impl';
import { MongoLeadCaptureSessionRepositoryProvider } from './infrastructure/persistence/impl/mongo-lead-capture-session.repository.impl';
import { LeadCaptureFlowController } from './infrastructure/controllers/lead-capture-flow.controller';
import { LeadCaptureSessionController } from './infrastructure/controllers/lead-capture-session.controller';
import { GetLeadCaptureFlowQueryHandler } from './application/queries/get-lead-capture-flow.query-handler';
import { ResolveLeadCaptureFlowQueryHandler } from './application/queries/resolve-lead-capture-flow.query-handler';
import { GetLeadCaptureSessionQueryHandler } from './application/queries/get-lead-capture-session.query-handler';
import { SaveLeadCaptureFlowCommandHandler } from './application/commands/save-lead-capture-flow.command-handler';
import { SaveLeadCaptureSessionCommandHandler } from './application/commands/save-lead-capture-session.command-handler';
import { CompleteLeadCaptureSessionCommandHandler } from './application/commands/complete-lead-capture-session.command-handler';
import { LEAD_CAPTURE_FLOW_REPOSITORY } from './domain/lead-capture-flow.repository';
import { LEAD_CAPTURE_SESSION_REPOSITORY } from './domain/lead-capture-session.repository';

// Guards y servicios que necesita el controlador
import { DualAuthGuard } from '../shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from '../shared/infrastructure/guards/role.guard';
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../shared/infrastructure/services/bff-session-auth.service';
import { AuthVisitorModule } from '../auth/auth-visitor/infrastructure/auth-visitor.module';
import { CompanyModule } from '../company/company.module';

/**
 * Módulo de captación: guion por pasos que recorre el visitante cuando no hay
 * comerciales conectados.
 */
@Module({
  imports: [
    CqrsModule,
    // TokenVerifyService necesita HTTP, JWT y config para validar el token
    HttpModule,
    JwtModule.register({}),
    ConfigModule,
    MongooseModule.forFeature([
      {
        name: LeadCaptureFlowSchema.name,
        schema: LeadCaptureFlowSchemaDefinition,
      },
      {
        name: LeadCaptureSessionSchema.name,
        schema: LeadCaptureSessionSchemaDefinition,
      },
    ]),
    AuthVisitorModule, // Validación de API Key en el endpoint público
    CompanyModule, // Resolver dominio a empresa y leer los textos legales
  ],
  controllers: [LeadCaptureFlowController, LeadCaptureSessionController],
  providers: [
    MongoLeadCaptureFlowRepositoryProvider,
    MongoLeadCaptureSessionRepositoryProvider,
    GetLeadCaptureFlowQueryHandler,
    ResolveLeadCaptureFlowQueryHandler,
    GetLeadCaptureSessionQueryHandler,
    SaveLeadCaptureFlowCommandHandler,
    SaveLeadCaptureSessionCommandHandler,
    CompleteLeadCaptureSessionCommandHandler,
    DualAuthGuard,
    RolesGuard,
    TokenVerifyService,
    BffSessionAuthService,
  ],
  exports: [LEAD_CAPTURE_FLOW_REPOSITORY, LEAD_CAPTURE_SESSION_REPOSITORY],
})
export class LeadCaptureModule {}
