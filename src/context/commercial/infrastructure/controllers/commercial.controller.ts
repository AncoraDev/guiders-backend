import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Inject,
  Req,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../shared/infrastructure/guards/auth.guard';
import { RolesGuard } from '../../../shared/infrastructure/guards/role.guard';
import { Roles } from '../../../shared/infrastructure/roles.decorator';
import { Public } from '../../../shared/infrastructure/decorators/public.decorator';
import { AuthenticatedRequest } from '../../../shared/infrastructure/guards/auth.guard';
import {
  COMMERCIAL_CONNECTION_SESSION_REPOSITORY,
  CommercialConnectionSessionRepository,
} from '../../domain/commercial-connection-session.repository';

// DTOs
import {
  ConnectCommercialDto,
  DisconnectCommercialDto,
  CheckCommercialAvailabilityDto,
  ChangeCommercialStatusDto,
  CommercialStatusEnum,
  RegisterFingerprintDto,
} from '../../application/dtos/commercial-request.dto';
import {
  CommercialConnectionStatusResponseDto,
  OnlineCommercialsResponseDto,
  CommercialOperationResponseDto,
  CommercialAvailabilityResponseDto,
} from '../../application/dtos/commercial-response.dto';

// Queries
import { GetCommercialConnectionStatusQuery } from '../../application/queries/get-commercial-connection-status.query';
import { GetAvailableCommercialsQuery } from '../../application/queries/get-available-commercials.query';
import { GetOnlineCommercialsQuery } from '../../application/queries/get-online-commercials.query';
import { GetCommercialAvailabilityBySiteQuery } from '../../application/queries/get-commercial-availability-by-site.query';

// Commands
import { ConnectCommercialCommand } from '../../application/commands/connect-commercial.command';
import { DisconnectCommercialCommand } from '../../application/commands/disconnect-commercial.command';
import { ChangeCommercialConnectionStatusCommand } from '../../application/commands/change-commercial-connection-status.command';
import { RegisterCommercialFingerprintCommand } from '../../application/commands/register-commercial-fingerprint.command';

// Services
import {
  ValidateDomainApiKey,
  VALIDATE_DOMAIN_API_KEY,
} from '../../../auth/auth-visitor/application/services/validate-domain-api-key';
import {
  CompanyRepository,
  COMPANY_REPOSITORY,
} from '../../../company/domain/company.repository';
import { VisitorAccountApiKey } from '../../../auth/auth-visitor/domain/models/visitor-account-api-key';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiNotFoundError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';

/**
 * Controlador REST para el contexto Commercial
 * Gestiona endpoints para heartbeat y estado de comerciales
 */
@ApiTags('Commercials')
@ApiBearerAuth()
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('v2/commercials')
@UseGuards(AuthGuard, RolesGuard)
export class CommercialController {
  private readonly logger = new Logger(CommercialController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(VALIDATE_DOMAIN_API_KEY)
    private readonly apiKeyValidator: ValidateDomainApiKey,
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    @Inject(COMMERCIAL_CONNECTION_SESSION_REPOSITORY)
    private readonly sessionRepository: CommercialConnectionSessionRepository,
  ) {}

  /**
   * Lista sesiones de conexión con filtros y paginación.
   * Comercial: solo las suyas. Admin/supervisor: todas las de su compañía.
   */
  @Get('connection-sessions')
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Listar sesiones de conexión',
    description:
      'Historial paginado de conexiones/desconexiones. El comercial solo ve las suyas; admin/supervisor ven la compañía.',
  })
  @ApiQuery({
    name: 'commercialId',
    required: false,
    description: 'Solo admin/supervisor: filtrar por comercial',
  })
  @ApiQuery({ name: 'page', required: false, description: 'Página (default 1)' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Tamaño de página (default 20, máx 100)',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Inicio del rango sobre startedAt (ISO)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fin del rango sobre startedAt (ISO)',
  })
  @ApiQuery({
    name: 'endReason',
    required: false,
    description: 'manual | logout | browser_close | unknown',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'open | closed',
  })
  @ApiResponse({ status: 200, description: 'Lista paginada de sesiones' })
  async listConnectionSessions(
    @Req() req: AuthenticatedRequest,
    @Query('commercialId') commercialId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('endReason') endReason?: string,
    @Query('status') status?: string,
  ) {
    const companyId = req.user.companyId;
    if (!companyId) {
      throw new BadRequestException('El usuario no tiene companyId asociado');
    }

    const roles = req.user.roles || [];
    const isAdmin = roles.some((r) => ['admin', 'supervisor'].includes(r));

    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedLimit = Math.min(Math.max(1, Number(limit) || 20), 100);

    const allowedReasons = ['manual', 'logout', 'browser_close', 'unknown'] as const;
    const parsedReason =
      endReason &&
      (allowedReasons as readonly string[]).includes(endReason)
        ? (endReason as (typeof allowedReasons)[number])
        : undefined;

    const parsedStatus =
      status === 'open' || status === 'closed' ? status : undefined;

    let parsedFrom: Date | undefined;
    let parsedTo: Date | undefined;
    if (from) {
      parsedFrom = new Date(from);
      if (Number.isNaN(parsedFrom.getTime())) {
        throw new BadRequestException('Parámetro from inválido');
      }
    }
    if (to) {
      parsedTo = new Date(to);
      if (Number.isNaN(parsedTo.getTime())) {
        throw new BadRequestException('Parámetro to inválido');
      }
    }

    // Comercial: siempre propio. Admin: compañía completa o filtro por agente.
    const scopedCommercialId = isAdmin
      ? commercialId || undefined
      : req.user.id;

    const result = await this.sessionRepository.search({
      companyId,
      commercialId: scopedCommercialId,
      from: parsedFrom,
      to: parsedTo,
      endReason: parsedReason,
      status: parsedStatus,
      page: parsedPage,
      limit: parsedLimit,
    });

    if (result.isErr()) {
      throw new InternalServerErrorException(result.error.message);
    }

    const data = result.unwrap();
    return {
      sessions: data.sessions,
      pagination: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages: data.totalPages,
      },
    };
  }

  /**
   * Conecta un comercial al sistema
   */
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Conectar comercial',
    description: 'Registra un comercial como conectado en el sistema',
  })
  @ApiBody({ type: ConnectCommercialDto })
  @ApiResponse({
    status: 200,
    description: 'Comercial conectado exitosamente',
    type: CommercialOperationResponseDto,
  })
  @ApiValidationError()
  async connectCommercial(
    @Body() connectDto: ConnectCommercialDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommercialOperationResponseDto> {
    try {
      this.logger.log(
        `Conectando comercial: ${connectDto.id} companyId=${req.user.companyId ?? 'n/a'}`,
      );

      // Ejecutar comando para conectar comercial
      const command = new ConnectCommercialCommand(
        connectDto.id,
        connectDto.name,
        connectDto.metadata,
        req.user.companyId,
      );
      await this.commandBus.execute(command);

      return {
        success: true,
        message: 'Comercial conectado exitosamente',
        commercial: {
          id: connectDto.id,
          name: connectDto.name,
          connectionStatus: 'CONNECTED',
          lastActivity: new Date(),
          isActive: true,
        },
      };
    } catch (error: unknown) {
      this.logger.error(`Error al conectar comercial ${connectDto.id}:`, error);
      throw new InternalServerErrorException('Error al conectar comercial');
    }
  }

  /**
   * Desconecta un comercial del sistema
   */
  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Desconectar comercial',
    description: 'Registra un comercial como desconectado del sistema',
  })
  @ApiBody({ type: DisconnectCommercialDto })
  @ApiResponse({
    status: 200,
    description: 'Comercial desconectado exitosamente',
    type: CommercialOperationResponseDto,
  })
  @ApiValidationError()
  async disconnectCommercial(
    @Body() disconnectDto: DisconnectCommercialDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<CommercialOperationResponseDto> {
    try {
      this.logger.log(
        `Desconectando comercial: ${disconnectDto.id} companyId=${req.user.companyId ?? 'n/a'}`,
      );

      // Ejecutar comando para desconectar comercial
      const command = new DisconnectCommercialCommand(
        disconnectDto.id,
        disconnectDto.reason ?? 'unknown',
        req.user.companyId,
      );
      await this.commandBus.execute(command);

      return {
        success: true,
        message: 'Comercial desconectado exitosamente',
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error al desconectar comercial ${disconnectDto.id}:`,
        error,
      );
      throw new InternalServerErrorException('Error al desconectar comercial');
    }
  }

  /**
   * Cambia el estado de conexión de un comercial manualmente
   */
  @Put('status')
  @HttpCode(HttpStatus.OK)
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Cambiar estado de conexión del comercial',
    description:
      'Permite a un comercial cambiar manualmente su estado de conexión (online, busy, away, offline)',
  })
  @ApiBody({ type: ChangeCommercialStatusDto })
  @ApiResponse({
    status: 200,
    description: 'Estado cambiado exitosamente',
    type: CommercialOperationResponseDto,
  })
  @ApiValidationError()
  @ApiNotFoundError('Comercial', 'Comercial no encontrado')
  async changeCommercialStatus(
    @Body() changeStatusDto: ChangeCommercialStatusDto,
  ): Promise<CommercialOperationResponseDto> {
    try {
      this.logger.log(
        `Cambiando estado de comercial ${changeStatusDto.id} a ${changeStatusDto.status}`,
      );

      // Ejecutar comando para cambiar estado
      const command = new ChangeCommercialConnectionStatusCommand(
        changeStatusDto.id,
        changeStatusDto.status,
      );
      await this.commandBus.execute(command);

      return {
        success: true,
        message: `Estado cambiado a ${changeStatusDto.status} exitosamente`,
        commercial: {
          id: changeStatusDto.id,
          name: 'Commercial',
          connectionStatus: changeStatusDto.status.toUpperCase(),
          lastActivity: new Date(),
          isActive: changeStatusDto.status === CommercialStatusEnum.ONLINE,
        },
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error al cambiar estado del comercial ${changeStatusDto.id}:`,
        error,
      );

      if (error instanceof Error && error.message?.includes('no encontrado')) {
        throw new NotFoundException('Comercial no encontrado');
      }

      if (error instanceof Error && error.message?.includes('estado')) {
        throw new BadRequestException(error.message);
      }

      throw new InternalServerErrorException(
        'Error al cambiar estado del comercial',
      );
    }
  }

  /**
   * Obtiene el estado de conexión de un comercial
   */
  @Get(':id/status')
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Obtener estado de comercial',
    description:
      'Obtiene el estado de conexión actual de un comercial específico',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado del comercial obtenido exitosamente',
    type: CommercialConnectionStatusResponseDto,
  })
  @ApiNotFoundError('Comercial', 'Comercial no encontrado')
  async getCommercialStatus(
    @Param('id') commercialId: string,
  ): Promise<CommercialConnectionStatusResponseDto> {
    try {
      this.logger.log(`Obteniendo estado comercial: ${commercialId}`);

      const query = new GetCommercialConnectionStatusQuery(commercialId);
      const status = await this.queryBus.execute<
        GetCommercialConnectionStatusQuery,
        CommercialConnectionStatusResponseDto
      >(query);

      return status;
    } catch (error: unknown) {
      this.logger.error(
        `Error al obtener estado comercial ${commercialId}:`,
        error,
      );

      if (error instanceof Error && error.message?.includes('no encontrado')) {
        throw new NotFoundException('Comercial no encontrado');
      }

      throw new InternalServerErrorException(
        'Error al obtener estado comercial',
      );
    }
  }

  /**
   * Obtiene la lista de comerciales activos/online
   */
  @Get('active')
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Obtener comerciales activos',
    description:
      'Obtiene la lista de todos los comerciales que están actualmente online',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de comerciales activos obtenida exitosamente',
    type: OnlineCommercialsResponseDto,
  })
  async getActiveCommercials(): Promise<OnlineCommercialsResponseDto> {
    try {
      this.logger.log('Obteniendo comerciales activos');

      const query = new GetOnlineCommercialsQuery();
      const result = await this.queryBus.execute<
        GetOnlineCommercialsQuery,
        OnlineCommercialsResponseDto
      >(query);

      return result;
    } catch (error: unknown) {
      this.logger.error('Error al obtener comerciales activos:', error);
      throw new InternalServerErrorException(
        'Error al obtener comerciales activos',
      );
    }
  }

  /**
   * Obtiene la lista de comerciales disponibles para asignación
   */
  @Get('available')
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Obtener comerciales disponibles',
    description:
      'Obtiene la lista de comerciales que están online y disponibles para atender chats',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de comerciales disponibles obtenida exitosamente',
    type: OnlineCommercialsResponseDto,
  })
  async getAvailableCommercials(): Promise<OnlineCommercialsResponseDto> {
    try {
      this.logger.log('Obteniendo comerciales disponibles');

      const query = new GetAvailableCommercialsQuery();
      const result = await this.queryBus.execute<
        GetAvailableCommercialsQuery,
        OnlineCommercialsResponseDto
      >(query);

      return result;
    } catch (error: unknown) {
      this.logger.error('Error al obtener comerciales disponibles:', error);
      throw new InternalServerErrorException(
        'Error al obtener comerciales disponibles',
      );
    }
  }

  /**
   * Consulta disponibilidad de comerciales para un sitio (endpoint público)
   * Usa validación domain + apiKey, sin requerir autenticación previa
   */
  @Post('availability')
  @HttpCode(HttpStatus.OK)
  @Public()
  @ApiOperation({
    summary: 'Consultar disponibilidad de comerciales',
    description:
      'Endpoint público que permite a visitantes consultar si hay comerciales disponibles ' +
      'para atender antes de iniciar sesión. Valida el dominio y API Key del sitio.\n\n' +
      '**Aislamiento por tenant**: el resultado (`available` y `onlineCount`) refleja únicamente ' +
      'los comerciales online pertenecientes a la empresa propietaria del dominio proporcionado. ' +
      'Los comerciales de otras empresas no se incluyen en el conteo.',
  })
  @ApiBody({ type: CheckCommercialAvailabilityDto })
  @ApiResponse({
    status: 200,
    description:
      'Disponibilidad consultada exitosamente. ' +
      'La respuesta siempre se retorna (incluso si no hay comerciales disponibles). ' +
      'El campo `onlineCount` y `available` están acotados al tenant del dominio consultado.',
    type: CommercialAvailabilityResponseDto,
  })
  @ApiValidationError(
    'Datos inválidos (domain o apiKey faltantes o con formato incorrecto)',
  )
  async checkCommercialAvailability(
    @Body() dto: CheckCommercialAvailabilityDto,
  ): Promise<CommercialAvailabilityResponseDto> {
    try {
      this.logger.log(`Consultando disponibilidad para domain: ${dto.domain}`);

      // Normalizar dominio: eliminar prefijo 'www.' si existe
      const normalizedDomain = dto.domain.replace(/^www\./i, '');

      // 1. Validar API Key con dominio normalizado
      const apiKeyValid = await this.apiKeyValidator.validate({
        apiKey: new VisitorAccountApiKey(dto.apiKey),
        domain: normalizedDomain,
      });

      if (!apiKeyValid) {
        throw new UnauthorizedException(
          'API Key inválida para el dominio proporcionado',
        );
      }

      // 2. Resolver dominio a tenantId y siteId
      const companyResult =
        await this.companyRepository.findByDomain(normalizedDomain);

      if (companyResult.isErr()) {
        throw new NotFoundException(
          `No se encontró una empresa para el dominio: ${normalizedDomain}`,
        );
      }

      const company = companyResult.value;
      const sites = company.getSites();
      const sitePrimitives = sites.toPrimitives();

      const targetSite = sitePrimitives.find(
        (site) =>
          site.canonicalDomain === normalizedDomain ||
          site.domainAliases.includes(normalizedDomain),
      );

      if (!targetSite) {
        throw new NotFoundException(
          `No se encontró un sitio específico para el dominio: ${normalizedDomain}`,
        );
      }

      this.logger.log(
        `Sitio resuelto: ${targetSite.id} (domain: ${normalizedDomain})`,
      );

      // 3. Consultar disponibilidad de comerciales para el sitio (filtrada por tenant)
      const query = new GetCommercialAvailabilityBySiteQuery(
        targetSite.id,
        company.getId().value,
      );
      const result = await this.queryBus.execute<
        GetCommercialAvailabilityBySiteQuery,
        CommercialAvailabilityResponseDto
      >(query);

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `Error al consultar disponibilidad para domain ${dto.domain}:`,
        error,
      );

      // Re-lanzar errores específicos de negocio
      if (
        error instanceof BadRequestException ||
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      // Error genérico del servidor
      throw new InternalServerErrorException(
        'Error al consultar disponibilidad de comerciales',
      );
    }
  }

  /**
   * Elimina un comercial del sistema (admin only)
   */
  @Delete(':id')
  @Roles(['admin', 'supervisor'])
  @ApiOperation({
    summary: 'Eliminar comercial',
    description:
      'Elimina un comercial del sistema completamente (solo administradores)',
  })
  @ApiParam({
    name: 'id',
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @ApiResponse({
    status: 200,
    description: 'Comercial eliminado exitosamente',
    type: CommercialOperationResponseDto,
  })
  @ApiNotFoundError('Comercial', 'Comercial no encontrado')
  async removeCommercial(
    @Param('id') commercialId: string,
  ): Promise<CommercialOperationResponseDto> {
    try {
      this.logger.log(`Eliminando comercial: ${commercialId}`);

      // Por ahora, mock de la respuesta hasta implementar commands
      // TODO: Implementar RemoveCommercialCommand
      await Promise.resolve(); // Simular operación async

      return {
        success: true,
        message: 'Comercial eliminado exitosamente',
      };
    } catch (error: unknown) {
      this.logger.error(`Error al eliminar comercial ${commercialId}:`, error);

      if (error instanceof Error && error.message?.includes('no encontrado')) {
        throw new NotFoundException('Comercial no encontrado');
      }

      throw new InternalServerErrorException('Error al eliminar comercial');
    }
  }

  /**
   * Registra un fingerprint de navegador para un comercial
   * Permite que el sistema identifique automáticamente al comercial cuando visite sitios con SDK
   */
  @Post('register-fingerprint')
  @HttpCode(HttpStatus.OK)
  @Roles(['admin', 'supervisor', 'commercial'])
  @ApiOperation({
    summary: 'Registrar fingerprint de comercial',
    description:
      'Registra un fingerprint de navegador para que el comercial sea identificado automáticamente al visitar sitios con el SDK instalado',
  })
  @ApiBody({ type: RegisterFingerprintDto })
  @ApiResponse({
    status: 200,
    description: 'Fingerprint registrado exitosamente',
    type: CommercialOperationResponseDto,
  })
  @ApiNotFoundError('Comercial', 'Comercial no encontrado')
  async registerFingerprint(
    @Body() dto: RegisterFingerprintDto,
  ): Promise<CommercialOperationResponseDto> {
    try {
      this.logger.log(
        `Registrando fingerprint ${dto.fingerprint} para comercial ${dto.commercialId}`,
      );

      const command = new RegisterCommercialFingerprintCommand(
        dto.commercialId,
        dto.fingerprint,
      );

      const result = await this.commandBus.execute(command);

      if (result.isErr()) {
        const error = result.error;
        if (error.message.includes('no encontrado')) {
          throw new NotFoundException('Comercial no encontrado');
        }
        throw new InternalServerErrorException(error.message);
      }

      return {
        success: true,
        message: 'Fingerprint registrado exitosamente',
      };
    } catch (error: unknown) {
      this.logger.error(
        `Error al registrar fingerprint para comercial ${dto.commercialId}:`,
        error,
      );

      if (error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException('Error al registrar fingerprint');
    }
  }
}
