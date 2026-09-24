import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CreateCompanyDto } from 'src/context/company/application/dtos/create-company.dto';
import { UpdateCompanyDto } from 'src/context/company/application/dtos/platform-company.dto';
import {
  AdminCredentialsRequiredError,
  AdminEmailRequiredError,
  CompanyDomainTakenError,
  InvalidCompanyDataError,
} from 'src/context/company/application/errors/company-platform.errors';
import { CompanyNotFoundError } from 'src/context/company/domain/errors/company.error';
import {
  IntegrationApiKeyGuard,
  IntegrationApiKeyRequest,
} from '../integration-api-key.guard';
import { CreateManagedCompanyCommandHandler } from '../../application/commands/create-managed-company.command-handler';
import { CreateManagedCompanyCommand } from '../../application/commands/create-managed-company.command';
import { UpdateManagedCompanyCommandHandler } from '../../application/commands/update-managed-company.command-handler';
import { UpdateManagedCompanyCommand } from '../../application/commands/update-managed-company.command';
import { RemoveManagedCompanyCommandHandler } from '../../application/commands/remove-managed-company.command-handler';
import { RemoveManagedCompanyCommand } from '../../application/commands/remove-managed-company.command';
import { RemoveManagedCompanyDto } from '../../application/dtos/remove-managed-company.dto';
import { ManagedCompanyError } from '../../domain/errors/managed-company.errors';

@ApiTags('Integración')
@ApiSecurity('api-key')
@Controller('v2/integration/companies')
@UseGuards(IntegrationApiKeyGuard)
export class ExternalCompanyController {
  constructor(
    private readonly createHandler: CreateManagedCompanyCommandHandler,
    private readonly updateHandler: UpdateManagedCompanyCommandHandler,
    private readonly removeHandler: RemoveManagedCompanyCommandHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear un cliente',
    description:
      'Crea la empresa, el sitio y el admin de Keycloak, y la vincula a la clave.',
  })
  async create(
    @Body() dto: CreateCompanyDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<{ companyId: string; adminUserId: string }> {
    const result = await this.createHandler.execute(
      new CreateManagedCompanyCommand(req.integrationApiKey.companyId, {
        companyName: dto.companyName,
        sites: dto.sites.map((site) => ({
          id: site.id || '',
          name: site.name,
          canonicalDomain: site.canonicalDomain,
          domainAliases: site.domainAliases || [],
        })),
        adminFirstName: dto.admin.adminFirstName,
        adminLastName: dto.admin.adminLastName,
        adminEmail: dto.admin.adminEmail.trim(),
        adminTel: dto.admin.adminTel,
        adminPassword: dto.admin.adminPassword,
      }),
    );
    if (result.isErr()) throw this.mapError(result.error);
    return result.unwrap();
  }

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un cliente',
    description:
      'Borra la empresa vinculada y sus cuentas. No borra chats, mensajes ni leads.',
  })
  async remove(
    @Body() dto: RemoveManagedCompanyDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<{ ok: true }> {
    const result = await this.removeHandler.execute(
      new RemoveManagedCompanyCommand(
        req.integrationApiKey.companyId,
        dto.companyId,
      ),
    );
    if (result.isErr()) throw this.mapError(result.error);
    return { ok: true };
  }

  @Patch(':companyId')
  @ApiOperation({
    summary: 'Actualizar un cliente',
    description:
      'Cambia el nombre y los sitios. No cambia el admin de Keycloak.',
  })
  @ApiResponse({ status: 404, description: 'La clave no creó ese cliente' })
  async update(
    @Param('companyId') companyId: string,
    @Body() dto: UpdateCompanyDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<{ companyId: string }> {
    const result = await this.updateHandler.execute(
      new UpdateManagedCompanyCommand(
        req.integrationApiKey.companyId,
        companyId,
        dto.companyName,
        (dto.sites ?? []).map((site) => ({
          id: site.id,
          name: site.name,
          canonicalDomain: site.canonicalDomain,
          domainAliases: site.domainAliases || [],
        })),
      ),
    );
    if (result.isErr()) throw this.mapError(result.error);
    return { companyId };
  }

  private mapError(error: DomainError): HttpException {
    if (
      error instanceof ManagedCompanyError ||
      error instanceof CompanyNotFoundError
    ) {
      return new NotFoundException({
        code: 'MANAGED_COMPANY_NOT_FOUND',
        message: error.message,
        statusCode: 404,
      });
    }
    if (error instanceof CompanyDomainTakenError) {
      return new ConflictException({
        code: 'COMPANY_DOMAIN_TAKEN',
        message: error.message,
        statusCode: 409,
      });
    }
    if (
      error instanceof AdminEmailRequiredError ||
      error instanceof AdminCredentialsRequiredError ||
      error instanceof InvalidCompanyDataError
    ) {
      return new BadRequestException({
        code: 'COMPANY_INVALID',
        message: error.message,
        statusCode: 400,
      });
    }
    return new BadRequestException({
      code: 'COMPANY_INVALID',
      message: error.message,
      statusCode: 400,
    });
  }
}
