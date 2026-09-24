import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { SEARCH_PROVIDER } from 'src/context/shared/domain/search';
import { CompanySearchProvider } from './infrastructure/search/company-search.provider';
import { CompanyTypeOrmEntity } from './infrastructure/persistence/entity/company-typeorm.entity';
import { CompanySiteTypeOrmEntity } from './infrastructure/persistence/typeorm/company-site.entity';
import { companyRepositoryProvider } from './infrastructure/persistence/impl/company.repository.impl';
import { CreateCompanyCommandHandler } from './application/commands/create-company-command.handler';
import { CreateCompanyWithAdminCommandHandler } from './application/commands/create-company-with-admin-command.handler';
import { UpdateCompanyCommandHandler } from './application/commands/update-company-command.handler';
import { DeleteCompanyRecordCommandHandler } from './application/commands/delete-company-record.command-handler';
import { DeletePlatformCompanyCommandHandler } from './application/commands/delete-platform-company.command-handler';
import { FindCompanyByDomainQueryHandler } from './application/queries/find-company-by-domain.query-handler';
import { ResolveSiteByHostQueryHandler } from './application/queries/resolve-site-by-host.query-handler';
import { GetCompanySitesQueryHandler } from './application/queries/get-company-sites.query-handler';
import { GetCompanyByIdQueryHandler } from './application/queries/get-company-by-id.query-handler';
import { ListCompaniesQueryHandler } from './application/queries/list-companies.query-handler';
import { GetPlatformCompanyDetailQueryHandler } from './application/queries/get-platform-company-detail.query-handler';
import { GetCompanyCannedRepliesQueryHandler } from './application/queries/get-company-canned-replies.query-handler';
import { UpdateCompanyCannedRepliesCommandHandler } from './application/commands/update-company-canned-replies.command-handler';
import { GetCompanyContactFormLegalQueryHandler } from './application/queries/get-company-contact-form-legal.query-handler';
import { UpdateCompanyContactFormLegalCommandHandler } from './application/commands/update-company-contact-form-legal.command-handler';
import { GetCompanyWidgetConfigQueryHandler } from './application/queries/get-company-widget-config.query-handler';
import { GetCompanyWidgetConfigByDomainQueryHandler } from './application/queries/get-company-widget-config-by-domain.query-handler';
import { UpdateCompanyWidgetConfigCommandHandler } from './application/commands/update-company-widget-config.command-handler';
import { GetCompanyLeadCaptureNotifyQueryHandler } from './application/queries/get-company-lead-capture-notify.query-handler';
import { UpdateCompanyLeadCaptureNotifyCommandHandler } from './application/commands/update-company-lead-capture-notify.command-handler';
import { TestCompanyLeadCaptureNotifyCommandHandler } from './application/commands/test-company-lead-capture-notify.command-handler';
import { EMAIL_SENDER_SERVICE } from 'src/context/shared/domain/email/email-sender.service';
import { ResendEmailSenderService } from 'src/context/shared/infrastructure/email/resend-email-sender.service';
import { CompanyController } from './infrastructure/controllers/company.controller';
import { PlatformCompaniesController } from './infrastructure/controllers/platform-companies.controller';
import { PlatformSdkReleasesController } from './infrastructure/controllers/platform-sdk-releases.controller';
import { GithubSdkReleasesService } from './infrastructure/services/github-sdk-releases.service';
import { CqrsModule } from '@nestjs/cqrs';
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../shared/infrastructure/services/bff-session-auth.service';
import { DualAuthGuard } from '../shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from '../shared/infrastructure/guards/role.guard';
import { ApiKeyModule } from '../auth/api-key/infrastructure/api-key.module';
import { IntegrationApiKeyModule } from '../auth/integration-api-key/infrastructure/integration-api-key.module';
import { CorsSiteOriginService } from './infrastructure/services/cors-site-origin.service';
import { COMPANY_SECRET_CIPHER } from './domain/company-secret-cipher';
import { CompanySecretCipherImpl } from './infrastructure/services/company-secret-cipher.impl';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyTypeOrmEntity, CompanySiteTypeOrmEntity]),
    CqrsModule,
    HttpModule,
    JwtModule.register({}),
    ConfigModule,
    ApiKeyModule,
    IntegrationApiKeyModule,
  ],
  controllers: [
    CompanyController,
    PlatformCompaniesController,
    PlatformSdkReleasesController,
  ],
  providers: [
    companyRepositoryProvider,
    CreateCompanyCommandHandler,
    CreateCompanyWithAdminCommandHandler,
    UpdateCompanyCommandHandler,
    DeleteCompanyRecordCommandHandler,
    DeletePlatformCompanyCommandHandler,
    FindCompanyByDomainQueryHandler,
    ResolveSiteByHostQueryHandler,
    GetCompanySitesQueryHandler,
    GetCompanyByIdQueryHandler,
    ListCompaniesQueryHandler,
    GetPlatformCompanyDetailQueryHandler,
    GetCompanyCannedRepliesQueryHandler,
    UpdateCompanyCannedRepliesCommandHandler,
    GetCompanyContactFormLegalQueryHandler,
    UpdateCompanyContactFormLegalCommandHandler,
    GetCompanyWidgetConfigQueryHandler,
    GetCompanyWidgetConfigByDomainQueryHandler,
    UpdateCompanyWidgetConfigCommandHandler,
    GetCompanyLeadCaptureNotifyQueryHandler,
    UpdateCompanyLeadCaptureNotifyCommandHandler,
    TestCompanyLeadCaptureNotifyCommandHandler,
    {
      provide: EMAIL_SENDER_SERVICE,
      useClass: ResendEmailSenderService,
    },
    CompanySecretCipherImpl,
    {
      provide: COMPANY_SECRET_CIPHER,
      useExisting: CompanySecretCipherImpl,
    },
    CorsSiteOriginService,
    GithubSdkReleasesService,
    // Servicios necesarios para DualAuthGuard (sin VisitorSessionAuthService para evitar dependencias complejas)
    TokenVerifyService,
    BffSessionAuthService,
    DualAuthGuard,
    RolesGuard,

    // Search Provider — registrado como multi-provider para GlobalSearchQueryHandler
    CompanySearchProvider,
    {
      provide: SEARCH_PROVIDER,
      useExisting: CompanySearchProvider,
    },
  ],
  exports: [
    companyRepositoryProvider,
    CompanySearchProvider,
    SEARCH_PROVIDER,
    CorsSiteOriginService,
  ],
})
export class CompanyModule {}
