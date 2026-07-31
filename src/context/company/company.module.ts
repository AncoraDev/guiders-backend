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
import { FindCompanyByDomainQueryHandler } from './application/queries/find-company-by-domain.query-handler';
import { ResolveSiteByHostQueryHandler } from './application/queries/resolve-site-by-host.query-handler';
import { GetCompanySitesQueryHandler } from './application/queries/get-company-sites.query-handler';
import { GetCompanyByIdQueryHandler } from './application/queries/get-company-by-id.query-handler';
import { ListCompaniesQueryHandler } from './application/queries/list-companies.query-handler';
import { GetPlatformCompanyDetailQueryHandler } from './application/queries/get-platform-company-detail.query-handler';
import { CompanyController } from './infrastructure/controllers/company.controller';
import { PlatformCompaniesController } from './infrastructure/controllers/platform-companies.controller';
import { CqrsModule } from '@nestjs/cqrs';
import { TokenVerifyService } from '../shared/infrastructure/token-verify.service';
import { BffSessionAuthService } from '../shared/infrastructure/services/bff-session-auth.service';
import { DualAuthGuard } from '../shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from '../shared/infrastructure/guards/role.guard';
import { ApiKeyModule } from '../auth/api-key/infrastructure/api-key.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompanyTypeOrmEntity, CompanySiteTypeOrmEntity]),
    CqrsModule,
    HttpModule,
    JwtModule.register({}),
    ConfigModule,
    ApiKeyModule,
  ],
  controllers: [CompanyController, PlatformCompaniesController],
  providers: [
    companyRepositoryProvider,
    CreateCompanyCommandHandler,
    CreateCompanyWithAdminCommandHandler,
    FindCompanyByDomainQueryHandler,
    ResolveSiteByHostQueryHandler,
    GetCompanySitesQueryHandler,
    GetCompanyByIdQueryHandler,
    ListCompaniesQueryHandler,
    GetPlatformCompanyDetailQueryHandler,
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
  exports: [companyRepositoryProvider, CompanySearchProvider, SEARCH_PROVIDER],
})
export class CompanyModule {}
