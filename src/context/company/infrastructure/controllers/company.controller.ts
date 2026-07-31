import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CreateCompanyDto } from '../../application/dtos/create-company.dto';
import { CreateCompanyWithAdminCommand } from '../../application/commands/create-company-with-admin.command';
import {
  CreateCompanyWithAdminResult,
} from '../../application/commands/create-company-with-admin-command.handler';
import { FindCompanyByDomainQuery } from '../../application/queries/find-company-by-domain.query';
import { FindCompanyByDomainResponseDto } from '../../application/dtos/find-company-by-domain-response.dto';
import { MyCompanyResponseDto } from '../../application/dtos/my-company-response.dto';
import { GetCompanySitesQuery } from '../../application/queries/get-company-sites.query';
import { GetCompanySitesResponseDto } from '../../application/dtos/get-company-sites-response.dto';
import { DualAuthGuard } from '../../../shared/infrastructure/guards/dual-auth.guard';
import { AuthenticatedRequest } from '../../../shared/infrastructure/guards/auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/guards/role.guard';
import { Roles } from '../../../shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiNotFoundError,
  ApiValidationError,
  PublicEndpoint,
} from '../../../shared/infrastructure/swagger';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

@ApiTags('companies')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller()
export class CompanyController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * @deprecated Preferir POST /api/platform/companies
   * Se mantiene con auth superadmin por compatibilidad.
   */
  @Post('company')
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles(['superadmin'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Deprecated] Crear empresa con administrador',
    description:
      'Usar POST /api/platform/companies. Requiere rol superadmin. Crea company + admin Keycloak.',
  })
  @ApiResponse({
    status: 201,
    description: 'Empresa creada exitosamente',
  })
  @ApiValidationError('Datos inválidos proporcionados')
  async createCompanyWithAdmin(
    @Body() createCompanyDto: CreateCompanyDto,
  ): Promise<{ companyId: string; adminUserId: string }> {
    const result = await this.commandBus.execute<
      CreateCompanyWithAdminCommand,
      Result<CreateCompanyWithAdminResult, DomainError>
    >(
      new CreateCompanyWithAdminCommand({
        companyName: createCompanyDto.companyName,
        sites: createCompanyDto.sites.map((site) => ({
          id: site.id || '',
          name: site.name,
          canonicalDomain: site.canonicalDomain,
          domainAliases: site.domainAliases || [],
        })),
        adminName: createCompanyDto.admin.adminName,
        adminFirstName: createCompanyDto.admin.adminFirstName,
        adminLastName: createCompanyDto.admin.adminLastName,
        adminEmail: createCompanyDto.admin.adminEmail,
        adminTel: createCompanyDto.admin.adminTel,
        adminPassword: createCompanyDto.admin.adminPassword,
      }),
    );

    if (result.isErr()) {
      throw new HttpException(result.error.message, HttpStatus.BAD_REQUEST);
    }
    return result.unwrap();
  }

  @Get('company/by-domain/:domain')
  @PublicEndpoint()
  @ApiOperation({
    summary: 'Buscar empresa por dominio',
    description:
      'Busca una empresa basándose en uno de sus dominios (canónico o alias)',
  })
  @ApiParam({
    name: 'domain',
    description: 'Dominio de la empresa a buscar',
    example: 'ejemplo.com',
  })
  @ApiResponse({
    status: 200,
    description: 'Empresa encontrada',
    type: FindCompanyByDomainResponseDto,
  })
  @ApiNotFoundError('Empresa')
  async findByDomain(
    @Param('domain') domain: string,
  ): Promise<FindCompanyByDomainResponseDto> {
    const query = new FindCompanyByDomainQuery(domain);
    return await this.queryBus.execute<
      FindCompanyByDomainQuery,
      FindCompanyByDomainResponseDto
    >(query);
  }

  @Get('companies/:companyId/sites')
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles(['admin', 'commercial', 'supervisor'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Listar sitios de una empresa',
    description:
      'Devuelve la lista de sites asociados a la empresa indicada por su companyId (UUID).',
  })
  @ApiParam({
    name: 'companyId',
    description: 'UUID de la empresa',
    example: '2f5f2d9a-5f84-4c06-9b68-5a9b8f7a9c1d',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de sites',
    type: GetCompanySitesResponseDto,
  })
  @ApiNotFoundError('Empresa')
  async getCompanySites(
    @Param('companyId') companyId: string,
  ): Promise<GetCompanySitesResponseDto> {
    const result = await this.queryBus.execute<
      GetCompanySitesQuery,
      GetCompanySitesResponseDto | null
    >(new GetCompanySitesQuery(companyId));

    if (!result) {
      throw new NotFoundException('Empresa no encontrada');
    }

    return result;
  }

  @Get('me/company')
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles(['admin', 'commercial', 'supervisor'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Obtener empresa del usuario autenticado',
    description:
      'Devuelve la información completa de la empresa a la que pertenece el usuario autenticado, incluyendo sitios y configuraciones.',
  })
  @ApiResponse({
    status: 200,
    description: 'Información de la empresa del usuario con siteId resuelto',
    type: MyCompanyResponseDto,
  })
  @ApiValidationError('Usuario sin companyId asignado')
  @ApiNotFoundError('Empresa')
  async getMyCompany(
    @Req() req: AuthenticatedRequest,
  ): Promise<MyCompanyResponseDto> {
    // Log temporal para debugging
    console.log(
      '🔍 DEBUG - req.user completo:',
      JSON.stringify(req.user, null, 2),
    );

    // Extraer companyId del usuario autenticado
    const companyId = req.user?.companyId;

    console.log('🔍 DEBUG - companyId extraído:', companyId);

    if (!companyId) {
      throw new NotFoundException(
        'Usuario no tiene empresa asignada. Contacte al administrador.',
      );
    }

    // Extraer el host de la petición para resolver el siteId
    const host = req.get('host') || (req.headers.host as string);
    console.log('🔍 DEBUG - host extraído:', host);

    // Obtener información completa de la empresa con sites
    const companyWithSites = await this.queryBus.execute<
      GetCompanySitesQuery,
      GetCompanySitesResponseDto
    >(new GetCompanySitesQuery(companyId));

    if (!companyWithSites) {
      throw new NotFoundException('Empresa no encontrada');
    }

    console.log(
      '🔍 DEBUG - empresa con sites:',
      JSON.stringify(companyWithSites, null, 2),
    );

    // Crear la respuesta con siteId resuelto basado en el host
    return MyCompanyResponseDto.fromPrimitives(
      {
        id: companyWithSites.companyId,
        companyName: companyWithSites.companyName,
        sites: companyWithSites.sites,
      },
      host,
    );
  }
}
