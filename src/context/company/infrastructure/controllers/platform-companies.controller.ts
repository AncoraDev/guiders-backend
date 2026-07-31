import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiNotFoundError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';
import { CreateCompanyDto } from '../../application/dtos/create-company.dto';
import { CreateCompanyWithAdminCommand } from '../../application/commands/create-company-with-admin.command';
import {
  CreateCompanyWithAdminResult,
} from '../../application/commands/create-company-with-admin-command.handler';
import { ListCompaniesQuery } from '../../application/queries/list-companies.query';
import { GetPlatformCompanyDetailQuery } from '../../application/queries/get-platform-company-detail.query';
import {
  PlatformCompanyDetailDto,
  PlatformCompanySummaryDto,
  PlatformCreateApiKeyDto,
  PlatformCreateCompanyResponseDto,
} from '../../application/dtos/platform-company.dto';
import { ApiKeyService } from 'src/context/auth/api-key/infrastructure/api-key.service';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CompanyUserEmailExistsError,
  InvalidCompanyUserRolesError,
} from 'src/context/auth/auth-user/application/errors/company-user.errors';
import { AdminEmailRequiredError } from '../../application/errors/company-platform.errors';

/**
 * API platform para el equipo Guiders (superadmin).
 * Opera sobre cualquier company; no usa companyId del JWT del staff.
 */
@ApiTags('platform')
@ApiBearerAuth()
@ApiAuthErrors()
@ApiInternalServerError()
@UseGuards(DualAuthGuard, RolesGuard)
@Roles(['superadmin'])
@Controller('platform/companies')
export class PlatformCompaniesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar todas las companies',
    description: 'Listado de clientes Guiders (solo superadmin).',
  })
  @ApiResponse({ status: 200, type: [PlatformCompanySummaryDto] })
  async listCompanies(): Promise<PlatformCompanySummaryDto[]> {
    return this.queryBus.execute(new ListCompaniesQuery());
  }

  @Get(':companyId')
  @ApiOperation({ summary: 'Detalle de una company' })
  @ApiParam({ name: 'companyId', description: 'UUID de la empresa' })
  @ApiResponse({ status: 200, type: PlatformCompanyDetailDto })
  @ApiNotFoundError('Empresa')
  async getCompany(
    @Param('companyId') companyId: string,
  ): Promise<PlatformCompanyDetailDto> {
    const detail = await this.queryBus.execute<
      GetPlatformCompanyDetailQuery,
      PlatformCompanyDetailDto | null
    >(new GetPlatformCompanyDetailQuery(companyId));

    if (!detail) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return detail;
  }

  @Post()
  @ApiOperation({
    summary: 'Alta de cliente (company + admin Keycloak)',
    description:
      'Crea la empresa, genera API keys de widget por dominio y da de alta el admin en Keycloak con contraseña temporal (sin email).',
  })
  @ApiResponse({ status: 201, type: PlatformCreateCompanyResponseDto })
  @ApiValidationError()
  async createCompany(
    @Body() dto: CreateCompanyDto,
  ): Promise<PlatformCreateCompanyResponseDto> {
    if (!dto.admin?.adminEmail?.trim()) {
      throw new HttpException(
        'El email del administrador es obligatorio',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!dto.admin?.adminPassword?.trim()) {
      throw new HttpException(
        'La contraseña temporal del administrador es obligatoria',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.commandBus.execute<
      CreateCompanyWithAdminCommand,
      Result<CreateCompanyWithAdminResult, DomainError>
    >(
      new CreateCompanyWithAdminCommand({
        companyName: dto.companyName,
        sites: dto.sites.map((site) => ({
          id: site.id || '',
          name: site.name,
          canonicalDomain: site.canonicalDomain,
          domainAliases: site.domainAliases || [],
        })),
        adminName: dto.admin.adminName,
        adminFirstName: dto.admin.adminFirstName,
        adminLastName: dto.admin.adminLastName,
        adminEmail: dto.admin.adminEmail.trim(),
        adminTel: dto.admin.adminTel,
        adminPassword: dto.admin.adminPassword,
      }),
    );

    if (result.isErr()) {
      throw this.mapCreateError(result.error);
    }

    const value = result.unwrap();
    return { companyId: value.companyId, adminUserId: value.adminUserId };
  }

  @Get(':companyId/api-keys')
  @ApiOperation({ summary: 'Listar API keys widget de una company' })
  @ApiParam({ name: 'companyId' })
  async listApiKeys(@Param('companyId') companyId: string) {
    await this.ensureCompanyExists(companyId);
    return this.apiKeyService.listCompanyApiKeys(companyId);
  }

  @Post(':companyId/api-keys')
  @ApiOperation({
    summary: 'Crear o reutilizar API key widget para un dominio',
  })
  @ApiParam({ name: 'companyId' })
  @ApiValidationError()
  async createApiKey(
    @Param('companyId') companyId: string,
    @Body() body: PlatformCreateApiKeyDto,
  ): Promise<{ apiKey: string }> {
    await this.ensureCompanyExists(companyId);
    return this.apiKeyService.createApiKeyForDomain(body.domain, companyId);
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const detail = await this.queryBus.execute<
      GetPlatformCompanyDetailQuery,
      PlatformCompanyDetailDto | null
    >(new GetPlatformCompanyDetailQuery(companyId));
    if (!detail) {
      throw new NotFoundException('Empresa no encontrada');
    }
  }

  private mapCreateError(error: DomainError): HttpException {
    if (
      error instanceof AdminEmailRequiredError ||
      error instanceof InvalidCompanyUserRolesError
    ) {
      return new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    if (error instanceof CompanyUserEmailExistsError) {
      return new HttpException(error.message, HttpStatus.CONFLICT);
    }
    return new HttpException(
      error.message || 'Error al crear la empresa',
      HttpStatus.BAD_REQUEST,
    );
  }
}
