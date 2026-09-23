import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
  ApiQuery,
  ApiExtraModels,
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
import {
  CreateCrmConfigDto,
  UpdateCrmConfigDto,
  CrmConfigResponseDto,
  TestCrmConnectionDto,
  TestConnectionResponseDto,
  TestConnectionByIdResponseDto,
  SendTestLeadDto,
  SendTestLeadResponseDto,
  CrmSyncRecordResponseDto,
  LeadcarsConcesionarioDto,
  LeadcarsSedeDto,
  LeadcarsCampanaDto,
  LeadcarsTipoLeadDto,
  LeadcarsStateItemDto,
  LeadcarsStateFieldDto,
} from '../../application/dtos/crm-config.dto';
import {
  ICrmCompanyConfigRepository,
  CRM_COMPANY_CONFIG_REPOSITORY,
} from '../../domain/crm-company-config.repository';
import {
  ICrmSyncRecordRepository,
  CRM_SYNC_RECORD_REPOSITORY,
} from '../../domain/crm-sync-record.repository';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from '../../domain/lead-contact-data.repository';
import {
  ICrmSyncServiceFactory,
  CRM_SYNC_SERVICE_FACTORY,
} from '../../domain/services/crm-sync.service';
import { LeadcarsApiService } from '../adapters/leadcars/leadcars-api.service';
import { LeadcarsCreateLeadRequest } from '../adapters/leadcars/leadcars.types';
import { CrmApiError } from '../../domain/errors/leads.error';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    roles: string[];
    companyId: string;
  };
}

@ApiTags('Leads - Administración CRM')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@ApiAuthErrors()
@ApiExtraModels(LeadcarsStateItemDto, LeadcarsStateFieldDto)
@ApiInternalServerError()
@Controller('v1/leads/admin')
@UseGuards(DualAuthGuard, RolesGuard)
export class LeadsAdminController {
  constructor(
    @Inject(CRM_COMPANY_CONFIG_REPOSITORY)
    private readonly configRepository: ICrmCompanyConfigRepository,
    @Inject(CRM_SYNC_RECORD_REPOSITORY)
    private readonly syncRecordRepository: ICrmSyncRecordRepository,
    @Inject(CRM_SYNC_SERVICE_FACTORY)
    private readonly crmSyncServiceFactory: ICrmSyncServiceFactory,
    @Inject(LEAD_CONTACT_DATA_REPOSITORY)
    private readonly contactDataRepository: ILeadContactDataRepository,
    private readonly leadcarsApiService: LeadcarsApiService,
  ) {}

  // ==================== Configuración CRM ====================

  @Post('config')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Crear configuración de CRM para la empresa' })
  @ApiResponse({
    status: 201,
    description: 'Configuración creada',
    type: CrmConfigResponseDto,
  })
  @ApiValidationError('Datos inválidos o CRM ya configurado')
  async createConfig(
    @Body() dto: CreateCrmConfigDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmConfigResponseDto> {
    const companyId = request.user.companyId;

    // Verificar que el companyId del DTO coincida (o usar el del token)
    if (dto.companyId !== companyId) {
      throw new BadRequestException(
        'El companyId no coincide con el de la sesión',
      );
    }

    // Verificar si ya existe configuración para este CRM
    const existingResult = await this.configRepository.findByCompanyAndType(
      companyId,
      dto.crmType,
    );

    if (existingResult.isOk() && existingResult.unwrap()) {
      throw new BadRequestException(
        `Ya existe una configuración de ${dto.crmType} para esta empresa`,
      );
    }

    // Validar configuración con el adapter
    const adapter = this.crmSyncServiceFactory.getAdapter(dto.crmType);
    if (!adapter) {
      throw new BadRequestException(`Tipo de CRM no soportado: ${dto.crmType}`);
    }

    const now = new Date();
    const configPrimitives = {
      id: Uuid.random().value,
      companyId,
      crmType: dto.crmType,
      enabled: dto.enabled ?? true,
      syncChatConversations: dto.syncChatConversations ?? false,
      triggerEvents: dto.triggerEvents ?? ['lifecycle_to_lead'],
      config: dto.config as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };

    const validationErrors = adapter.validateConfig(configPrimitives);

    if (validationErrors.length > 0) {
      throw new BadRequestException(
        `Configuración inválida: ${validationErrors.join(', ')}`,
      );
    }

    const saveResult = await this.configRepository.save(configPrimitives);
    if (saveResult.isErr()) {
      throw new BadRequestException(saveResult.error.message);
    }

    return CrmConfigResponseDto.fromPrimitives(configPrimitives);
  }

  @Get('config')
  @Roles(['admin'])
  @ApiOperation({
    summary:
      'Obtener la configuración CRM de la empresa (primera activa) o 404 si no existe',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuración encontrada',
    type: CrmConfigResponseDto,
  })
  @ApiNotFoundError('Configuración', 'No hay configuración CRM creada')
  async getConfig(
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmConfigResponseDto> {
    const companyId = request.user.companyId;

    const result = await this.configRepository.findByCompanyId(companyId);
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    const configs = result.unwrap();
    if (!configs.length) {
      throw new NotFoundException(
        'No existe configuración CRM para esta empresa',
      );
    }

    // Devuelve la primera (en la práctica solo hay una por empresa+crmType)
    return CrmConfigResponseDto.fromPrimitives(configs[0]);
  }

  @Get('config/:id')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Obtener configuración CRM por ID' })
  @ApiParam({ name: 'id', description: 'ID de la configuración' })
  @ApiResponse({
    status: 200,
    description: 'Configuración encontrada',
    type: CrmConfigResponseDto,
  })
  @ApiNotFoundError('Configuración', 'Configuración no encontrada')
  async getConfigById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmConfigResponseDto> {
    const companyId = request.user.companyId;

    const result = await this.configRepository.findById(id);
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    const config = result.unwrap();
    if (!config) {
      throw new NotFoundException(`Configuración con id ${id} no encontrada`);
    }

    // Verificar pertenencia a la empresa
    if (config.companyId !== companyId) {
      throw new NotFoundException(`Configuración con id ${id} no encontrada`);
    }

    return CrmConfigResponseDto.fromPrimitives(config);
  }

  @Put('config/:id')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Actualizar configuración CRM' })
  @ApiParam({ name: 'id', description: 'ID de la configuración' })
  @ApiResponse({
    status: 200,
    description: 'Configuración actualizada',
    type: CrmConfigResponseDto,
  })
  @ApiNotFoundError('Configuración', 'Configuración no encontrada')
  async updateConfig(
    @Param('id') id: string,
    @Body() dto: UpdateCrmConfigDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmConfigResponseDto> {
    const companyId = request.user.companyId;

    const findResult = await this.configRepository.findById(id);
    if (findResult.isErr()) {
      throw new BadRequestException(findResult.error.message);
    }

    const existingConfig = findResult.unwrap();
    if (!existingConfig) {
      throw new NotFoundException(`Configuración con id ${id} no encontrada`);
    }

    if (existingConfig.companyId !== companyId) {
      throw new NotFoundException(`Configuración con id ${id} no encontrada`);
    }

    // Crear configuración actualizada
    const updatedPrimitives = {
      ...existingConfig,
      enabled: dto.enabled ?? existingConfig.enabled,
      syncChatConversations:
        dto.syncChatConversations ?? existingConfig.syncChatConversations,
      triggerEvents: dto.triggerEvents ?? existingConfig.triggerEvents,
      config:
        (dto.config as unknown as Record<string, unknown>) ??
        existingConfig.config,
      updatedAt: new Date(),
    };

    // Validar si hay nueva config
    if (dto.config) {
      const adapter = this.crmSyncServiceFactory.getAdapter(
        existingConfig.crmType,
      );
      if (adapter) {
        const validationErrors = adapter.validateConfig(updatedPrimitives);
        if (validationErrors.length > 0) {
          throw new BadRequestException(
            `Configuración inválida: ${validationErrors.join(', ')}`,
          );
        }
      }
    }

    const updateResult = await this.configRepository.update(updatedPrimitives);

    if (updateResult.isErr()) {
      throw new BadRequestException(updateResult.error.message);
    }

    return CrmConfigResponseDto.fromPrimitives(updatedPrimitives);
  }

  @Delete('config/:id')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Eliminar configuración CRM' })
  @ApiParam({ name: 'id', description: 'ID de la configuración' })
  @ApiResponse({ status: 200, description: 'Configuración eliminada' })
  @ApiNotFoundError('Configuración', 'Configuración no encontrada')
  async deleteConfig(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const companyId = request.user.companyId;

    const findResult = await this.configRepository.findById(id);
    if (findResult.isErr()) {
      throw new BadRequestException(findResult.error.message);
    }

    const config = findResult.unwrap();
    if (!config) {
      throw new NotFoundException(`Configuración con id ${id} no encontrada`);
    }

    if (config.companyId !== companyId) {
      throw new NotFoundException(`Configuración con id ${id} no encontrada`);
    }

    const deleteResult = await this.configRepository.delete(id);
    if (deleteResult.isErr()) {
      throw new BadRequestException(deleteResult.error.message);
    }

    return { message: 'Configuración eliminada correctamente' };
  }

  // ==================== Test de Conexión ====================

  @Post('config/:configId/test')
  @Roles(['admin'])
  @ApiOperation({
    summary:
      'Probar conexión con LeadCars usando la configuración guardada por ID',
  })
  @ApiParam({ name: 'configId', description: 'ID de la configuración' })
  @ApiResponse({
    status: 200,
    description: 'Resultado del test de conexión',
    type: TestConnectionByIdResponseDto,
  })
  @ApiNotFoundError('Configuración', 'Configuración no encontrada')
  async testConnectionById(
    @Param('configId') configId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<TestConnectionByIdResponseDto> {
    const companyId = request.user.companyId;

    const findResult = await this.configRepository.findById(configId);
    if (findResult.isErr()) {
      throw new BadRequestException(findResult.error.message);
    }

    const config = findResult.unwrap();
    if (!config) {
      throw new NotFoundException(
        `Configuración con id ${configId} no encontrada`,
      );
    }

    if (config.companyId !== companyId) {
      throw new NotFoundException(
        `Configuración con id ${configId} no encontrada`,
      );
    }

    const adapter = this.crmSyncServiceFactory.getAdapter(config.crmType);
    if (!adapter) {
      return {
        success: false,
        message: `Tipo de CRM no soportado: ${config.crmType}`,
      };
    }

    const result = await adapter.testConnection(config);
    const environment = config.config.useSandbox ? 'sandbox' : 'production';

    if (result.isErr()) {
      return this.toTestConnectionFailure(result.error, environment);
    }

    return {
      success: result.unwrap(),
      message: result.unwrap()
        ? 'Conexión con LeadCars establecida correctamente'
        : 'No se pudo establecer conexión con LeadCars',
      details: { environment },
    };
  }

  @Post('test-connection')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Probar conexión con CRM con credenciales manuales',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado del test de conexión',
    type: TestConnectionResponseDto,
  })
  async testConnection(
    @Body() dto: TestCrmConnectionDto,
  ): Promise<TestConnectionResponseDto> {
    const adapter = this.crmSyncServiceFactory.getAdapter(dto.crmType);

    if (!adapter) {
      return {
        success: false,
        error: `Tipo de CRM no soportado: ${dto.crmType}`,
      };
    }

    const now = new Date();

    // Validar configuración primero
    const validationErrors = adapter.validateConfig({
      id: '',
      companyId: '',
      crmType: dto.crmType,
      enabled: true,
      syncChatConversations: false,
      triggerEvents: [],
      config: dto.config as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    });

    if (validationErrors.length > 0) {
      return {
        success: false,
        validationErrors,
      };
    }

    // Probar conexión
    const result = await adapter.testConnection({
      id: '',
      companyId: '',
      crmType: dto.crmType,
      enabled: true,
      syncChatConversations: false,
      triggerEvents: [],
      config: dto.config as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    });

    if (result.isErr()) {
      const failure = this.toTestConnectionFailure(
        result.error,
        dto.config.useSandbox ? 'sandbox' : 'production',
      );
      return {
        success: false,
        error: failure.message,
      };
    }

    return {
      success: result.unwrap(),
    };
  }

  @Post('leadcars/test-lead')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Enviar un lead de prueba a LeadCars',
    description:
      'Crea un lead real en LeadCars (sandbox o producción según useSandbox) para que el concesionario pueda comprobar si llega. No guarda el lead en Guiders.',
  })
  @ApiResponse({
    status: 200,
    description: 'LeadCars aceptó o rechazó el lead de prueba',
    type: SendTestLeadResponseDto,
  })
  async sendTestLead(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendTestLeadDto,
  ): Promise<SendTestLeadResponseDto> {
    const companyId = request.user.companyId;
    const hasEmail = !!dto.email?.trim();
    const hasPhone = !!dto.telefono?.trim();
    if (!hasEmail && !hasPhone) {
      throw new BadRequestException(
        'Indica al menos un email o un teléfono para que el concesionario pueda identificar el lead.',
      );
    }

    let leadcarsConfig: {
      clienteToken: string;
      useSandbox: boolean;
      concesionarioId: number;
      sedeId?: number;
      campanaCode?: string;
      tipoLeadDefault: number;
    };

    if (this.isValidClienteTokenInput(dto.clienteToken)) {
      leadcarsConfig = {
        clienteToken: dto.clienteToken,
        useSandbox: dto.useSandbox ?? false,
        concesionarioId: dto.concesionarioId ?? 0,
        sedeId: dto.sedeId,
        campanaCode: dto.campanaCode,
        tipoLeadDefault: dto.tipoLeadDefault ?? 0,
      };
    } else {
      leadcarsConfig = await this.getLeadcarsConfigForCompany(companyId);
      if (dto.useSandbox !== undefined) {
        leadcarsConfig.useSandbox = dto.useSandbox;
      }
      if (dto.concesionarioId) {
        leadcarsConfig.concesionarioId = dto.concesionarioId;
      }
      if (dto.sedeId) {
        leadcarsConfig.sedeId = dto.sedeId;
      }
      if (dto.campanaCode) {
        leadcarsConfig.campanaCode = dto.campanaCode;
      }
      if (dto.tipoLeadDefault) {
        leadcarsConfig.tipoLeadDefault = dto.tipoLeadDefault;
      }
    }

    if (
      !Number.isInteger(leadcarsConfig.concesionarioId) ||
      leadcarsConfig.concesionarioId <= 0 ||
      !Number.isInteger(leadcarsConfig.tipoLeadDefault) ||
      leadcarsConfig.tipoLeadDefault <= 0
    ) {
      throw new BadRequestException(
        'Faltan concesionario y tipo de lead. Guárdalos en la configuración o selecciónalos antes de enviar.',
      );
    }

    const comentario =
      dto.comentario?.trim() ||
      `Lead de prueba Guiders (${new Date().toISOString()})`;

    const payload: LeadcarsCreateLeadRequest = {
      nombre: dto.nombre.trim(),
      concesionario: leadcarsConfig.concesionarioId,
      tipo_lead: leadcarsConfig.tipoLeadDefault,
      comentario,
      custom: {
        guiders_test: true,
        guiders_company_id: companyId,
      },
    };
    if (dto.apellidos?.trim()) {
      payload.apellidos = dto.apellidos.trim();
    }
    if (hasEmail && dto.email) {
      payload.email = dto.email.trim();
    }
    if (hasPhone && dto.telefono) {
      payload.telefono = dto.telefono.trim();
    }
    if (dto.provincia?.trim()) {
      payload.provincia = dto.provincia.trim();
    }
    if (leadcarsConfig.sedeId) {
      payload.sede = leadcarsConfig.sedeId;
    }
    if (leadcarsConfig.campanaCode) {
      payload.campana = leadcarsConfig.campanaCode;
    }

    const environment = leadcarsConfig.useSandbox ? 'sandbox' : 'production';
    const result = await this.leadcarsApiService.createLead(
      payload,
      leadcarsConfig,
    );
    if (result.isErr()) {
      this.throwLeadcarsError(result.error, 'test-lead');
    }

    const providerResponse = result.unwrap() as unknown;
    if (
      providerResponse &&
      typeof providerResponse === 'object' &&
      (providerResponse as { success?: unknown }).success === false
    ) {
      const rejected = providerResponse as {
        error?: { message?: string };
        message?: string;
      };
      throw new HttpException(
        {
          message:
            rejected.error?.message ||
            rejected.message ||
            'LeadCars rechazó el lead de prueba',
          providerBody: this.stringifyProviderBody(providerResponse),
          httpStatus: 422,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const extracted = this.extractCreatedLead(providerResponse);
    const lines = [
      extracted.leadId || extracted.referencia
        ? 'LeadCars aceptó el lead de prueba.'
        : 'LeadCars respondió al envío de prueba.',
      `Entorno: ${environment}`,
    ];
    if (extracted.leadId) {
      lines.push(`ID LeadCars: ${extracted.leadId}`);
    }
    if (extracted.referencia) {
      lines.push(`Referencia: ${extracted.referencia}`);
    }
    lines.push(`Nombre: ${payload.nombre}`);
    if (payload.email) {
      lines.push(`Email: ${payload.email}`);
    }
    if (payload.telefono) {
      lines.push(`Teléfono: ${payload.telefono}`);
    }
    lines.push(
      `Concesionario: ${payload.concesionario}`,
      `Tipo de lead: ${payload.tipo_lead}`,
    );

    return {
      success: true,
      message: lines.join('\n'),
      environment,
      leadId: extracted.leadId,
      referencia: extracted.referencia,
    };
  }

  // ==================== Registros de Sincronización ====================

  @Get('sync-records/failed')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Obtener sincronizaciones fallidas' })
  @ApiResponse({
    status: 200,
    description: 'Lista de sincronizaciones fallidas',
    type: [CrmSyncRecordResponseDto],
  })
  async getFailedSyncRecords(
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmSyncRecordResponseDto[]> {
    const companyId = request.user.companyId;

    const result =
      await this.syncRecordRepository.findFailedByCompanyId(companyId);
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    return Promise.all(
      result.unwrap().map(async (record) => {
        const contactResult = await this.contactDataRepository.findByVisitorId(
          record.visitorId,
          companyId,
        );
        const contactData = contactResult.isOk()
          ? contactResult.unwrap()
          : null;
        return CrmSyncRecordResponseDto.fromPrimitives(record, contactData);
      }),
    );
  }

  @Get('sync-records/visitor/:visitorId')
  @Roles(['admin', 'commercial'])
  @ApiOperation({ summary: 'Obtener registros de sincronización por visitor' })
  @ApiParam({ name: 'visitorId', description: 'ID del visitante' })
  @ApiResponse({
    status: 200,
    description: 'Lista de registros de sincronización',
    type: [CrmSyncRecordResponseDto],
  })
  async getSyncRecordsByVisitor(
    @Param('visitorId') visitorId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmSyncRecordResponseDto[]> {
    const companyId = request.user.companyId;

    const result = await this.syncRecordRepository.findByVisitorId(
      visitorId,
      companyId,
    );
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    const record = result.unwrap();
    if (!record) {
      return [];
    }

    return [CrmSyncRecordResponseDto.fromPrimitives(record)];
  }

  @Get('sync-records')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Obtener registros de sincronización de la empresa',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de registros de sincronización',
    type: [CrmSyncRecordResponseDto],
  })
  async getSyncRecords(
    @Req() request: AuthenticatedRequest,
  ): Promise<CrmSyncRecordResponseDto[]> {
    const companyId = request.user.companyId;

    const result = await this.syncRecordRepository.findByCompanyId(companyId);
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    return Promise.all(
      result.unwrap().map(async (record) => {
        const contactResult = await this.contactDataRepository.findByVisitorId(
          record.visitorId,
          companyId,
        );
        const contactData = contactResult.isOk()
          ? contactResult.unwrap()
          : null;
        return CrmSyncRecordResponseDto.fromPrimitives(record, contactData);
      }),
    );
  }

  // ==================== Proxy LeadCars ====================

  // ==================== Helpers privados LeadCars ====================

  /**
   * Convierte un DomainError de LeadCars en HttpException con el código HTTP correcto.
   * Si LeadCars respondió con un 4xx, se propaga ese código para que el frontend
   * pueda distinguir token inválido (401/403) de recurso no encontrado (404).
   * Si no hay código (error de red/desconocido) se devuelve 502 Bad Gateway.
   */
  private throwLeadcarsError(error: DomainError, context: string): never {
    if (error instanceof CrmApiError && error.statusCode) {
      const providerStatus = error.statusCode;
      if (providerStatus >= 400 && providerStatus < 600) {
        // 401/403 de LeadCars NO se reenvían como 401/403 de Guiders:
        // el interceptor de sesión del frontend interpretaría eso como
        // "sesión caducada" y echaría al usuario al login.
        const status =
          providerStatus === 401 || providerStatus === 403
            ? HttpStatus.UNPROCESSABLE_ENTITY
            : providerStatus;
        throw new HttpException(
          {
            message: `LeadCars error [${context}]: ${error.message}`,
            httpStatus: providerStatus,
            endpoint: error.endpoint,
            providerMessage: error.message,
            providerBody: this.stringifyProviderBody(error.apiResponse),
          },
          status,
        );
      }
    }
    throw new HttpException(
      {
        message: `LeadCars no disponible [${context}]: ${error.message}`,
        providerMessage: error.message,
      },
      HttpStatus.BAD_GATEWAY,
    );
  }

  private toTestConnectionFailure(
    error: DomainError,
    environment: 'sandbox' | 'production',
  ): TestConnectionByIdResponseDto {
    const apiError = error instanceof CrmApiError ? error : undefined;
    const details = {
      environment,
      httpStatus: apiError?.statusCode,
      endpoint: apiError?.endpoint,
      providerMessage: error.message,
      providerBody: this.stringifyProviderBody(apiError?.apiResponse),
    };

    const lines = [
      'LeadCars rechazó la conexión.',
      `Entorno: ${environment}`,
    ];
    // Detalle listo para reenviar a soporte@leadcars.es
    if (details.endpoint) {
      lines.push(`Endpoint: ${details.endpoint}`);
    }
    if (details.httpStatus) {
      lines.push(`HTTP: ${details.httpStatus}`);
    }
    lines.push(`Mensaje: ${error.message}`);
    if (details.providerBody) {
      lines.push(`Respuesta: ${details.providerBody}`);
    }

    return {
      success: false,
      message: lines.join('\n'),
      details,
    };
  }

  private extractCreatedLead(response: unknown): {
    leadId?: number;
    referencia?: string;
  } {
    if (!response || typeof response !== 'object') {
      return {};
    }
    const root = response as Record<string, unknown>;
    const nested =
      root.data && typeof root.data === 'object'
        ? (root.data as Record<string, unknown>)
        : root;
    const rawId = nested.id ?? nested.lead_id ?? root.id ?? root.lead_id;
    const leadId =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string' && Number.isFinite(Number(rawId))
          ? Number(rawId)
          : undefined;
    const rawRef = nested.referencia ?? root.referencia;
    return {
      leadId,
      referencia: typeof rawRef === 'string' ? rawRef : undefined,
    };
  }

  private stringifyProviderBody(body: unknown): string | undefined {
    if (body == null) {
      return undefined;
    }
    if (typeof body === 'string') {
      return body.slice(0, 2000);
    }
    try {
      return JSON.stringify(body).slice(0, 2000);
    } catch {
      return undefined;
    }
  }

  /**
   * Sentinel que el backend devuelve en lugar del token real para no exponer
   * credenciales sensibles en las respuestas GET/POST/PUT de config CRM
   * (ver CrmConfigResponseDto.fromPrimitives). Si el frontend reenvía este
   * valor en las llamadas de validación, debemos ignorarlo y usar el token
   * desencriptado de la configuración guardada en BD.
   */
  private static readonly MASKED_TOKEN_SENTINEL = '***OCULTO***';

  private isValidClienteTokenInput(token?: string): token is string {
    return !!token && token !== LeadsAdminController.MASKED_TOKEN_SENTINEL;
  }

  private async getLeadcarsConfigForCompany(companyId: string) {
    const result = await this.configRepository.findByCompanyAndType(
      companyId,
      'leadcars',
    );
    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }
    const config = result.unwrap();
    if (!config) {
      throw new NotFoundException(
        'No existe configuración de LeadCars para esta empresa',
      );
    }
    return {
      clienteToken: config.config.clienteToken as string,
      useSandbox: (config.config.useSandbox as boolean) ?? false,
      concesionarioId: config.config.concesionarioId as number,
      sedeId: config.config.sedeId as number | undefined,
      campanaCode: (config.config.campanaCode || config.config.campana) as
        | string
        | undefined,
      tipoLeadDefault: config.config.tipoLeadDefault as number,
    };
  }

  @Get('leadcars/concesionarios')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Listar concesionarios disponibles en LeadCars',
    description:
      'Proxy al endpoint GET /concesionarios de LeadCars. Usa el token guardado en config o el token pasado como query param (para setup inicial sin config guardada)',
  })
  @ApiQuery({
    name: 'clienteToken',
    required: false,
    type: String,
    description:
      'Token de cliente LeadCars de 20 caracteres (alternativa a config guardada, útil durante el setup inicial)',
  })
  @ApiQuery({
    name: 'useSandbox',
    required: false,
    type: String,
    enum: ['true', 'false'],
    description:
      "Usar entorno sandbox de LeadCars. Pasar la cadena 'true' para activarlo (default: 'false')",
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de concesionarios',
    type: [LeadcarsConcesionarioDto],
  })
  @ApiValidationError(
    'La configuración de LeadCars está deshabilitada para esta empresa',
  )
  @ApiNotFoundError(
    'Lead',
    'Solo aplica cuando no se proporciona clienteToken: no existe configuración de LeadCars guardada para esta empresa',
  )
  async getLeadcarsConcesionarios(
    @Req() request: AuthenticatedRequest,
    @Query('clienteToken') clienteToken?: string,
    @Query('useSandbox') useSandbox?: string,
  ): Promise<LeadcarsConcesionarioDto[]> {
    const companyId = request.user.companyId;

    let leadcarsConfig: {
      clienteToken: string;
      useSandbox: boolean;
      concesionarioId: number;
      sedeId?: number;
      campanaCode?: string;
      tipoLeadDefault: number;
    };

    if (this.isValidClienteTokenInput(clienteToken)) {
      leadcarsConfig = {
        clienteToken,
        useSandbox: useSandbox === 'true',
        concesionarioId: 0,
        tipoLeadDefault: 0,
      };
    } else {
      leadcarsConfig = await this.getLeadcarsConfigForCompany(companyId);
    }

    const result =
      await this.leadcarsApiService.listConcesionarios(leadcarsConfig);
    if (result.isErr()) {
      this.throwLeadcarsError(result.error, 'concesionarios');
    }

    return result.unwrap().map((c) => ({ id: c.id, nombre: c.nombre }));
  }

  @Get('leadcars/sedes/:concesionarioId')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Listar sedes de un concesionario en LeadCars',
    description:
      'Proxy al endpoint GET /sedes/:id de LeadCars. Usa el token guardado en config o el token pasado como query param (para setup inicial sin config guardada)',
  })
  @ApiParam({
    name: 'concesionarioId',
    type: Number,
    example: 400,
    description:
      'ID numérico del concesionario en LeadCars (obtenido de GET /leadcars/concesionarios)',
  })
  @ApiQuery({
    name: 'clienteToken',
    required: false,
    type: String,
    description:
      'Token de cliente LeadCars de 20 caracteres (alternativa a config guardada, útil durante el setup inicial)',
  })
  @ApiQuery({
    name: 'useSandbox',
    required: false,
    type: String,
    enum: ['true', 'false'],
    description:
      "Usar entorno sandbox de LeadCars. Pasar la cadena 'true' para activarlo (default: 'false')",
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de sedes del concesionario',
    type: [LeadcarsSedeDto],
  })
  @ApiValidationError(
    'concesionarioId no es un número entero positivo válido, o la configuración de LeadCars está deshabilitada',
  )
  @ApiNotFoundError(
    'Lead',
    'Solo aplica cuando no se proporciona clienteToken: no existe configuración de LeadCars guardada para esta empresa',
  )
  async getLeadcarsSedes(
    @Param('concesionarioId') concesionarioId: string,
    @Req() request: AuthenticatedRequest,
    @Query('clienteToken') clienteToken?: string,
    @Query('useSandbox') useSandbox?: string,
  ): Promise<LeadcarsSedeDto[]> {
    const companyId = request.user.companyId;
    const concesionarioIdNum = parseInt(concesionarioId, 10);

    if (
      isNaN(concesionarioIdNum) ||
      !Number.isInteger(concesionarioIdNum) ||
      concesionarioIdNum <= 0
    ) {
      throw new BadRequestException(
        'concesionarioId debe ser un número entero positivo',
      );
    }

    let leadcarsConfig: {
      clienteToken: string;
      useSandbox: boolean;
      concesionarioId: number;
      sedeId?: number;
      campanaCode?: string;
      tipoLeadDefault: number;
    };

    if (this.isValidClienteTokenInput(clienteToken)) {
      leadcarsConfig = {
        clienteToken,
        useSandbox: useSandbox === 'true',
        concesionarioId: concesionarioIdNum,
        tipoLeadDefault: 0,
      };
    } else {
      leadcarsConfig = await this.getLeadcarsConfigForCompany(companyId);
    }

    const result = await this.leadcarsApiService.listSedes(
      concesionarioIdNum,
      leadcarsConfig,
    );
    if (result.isErr()) {
      this.throwLeadcarsError(result.error, 'sedes');
    }

    return result.unwrap().map((s) => ({
      id: s.id,
      nombre: s.nombre ?? undefined,
      concesionarioId: s.concesionario_id ?? concesionarioIdNum,
    }));
  }

  @Get('leadcars/campanas/:concesionarioId')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Listar campañas de un concesionario en LeadCars',
    description:
      'Proxy al endpoint GET /campanas/:id de LeadCars. Usa el token guardado en config o el token pasado como query param (para setup inicial sin config guardada). El concesionarioId del path siempre prevalece sobre el de la config guardada.',
  })
  @ApiParam({
    name: 'concesionarioId',
    type: Number,
    example: 400,
    description:
      'ID numérico del concesionario en LeadCars (obtenido de GET /leadcars/concesionarios)',
  })
  @ApiQuery({
    name: 'clienteToken',
    required: false,
    type: String,
    description:
      'Token de cliente LeadCars de 20 caracteres (alternativa a config guardada, útil durante el setup inicial)',
  })
  @ApiQuery({
    name: 'useSandbox',
    required: false,
    type: String,
    enum: ['true', 'false'],
    description:
      "Usar entorno sandbox de LeadCars. Pasar la cadena 'true' para activarlo (default: 'false')",
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de campañas del concesionario',
    type: [LeadcarsCampanaDto],
  })
  @ApiValidationError(
    'concesionarioId no es un número entero positivo válido, o la configuración de LeadCars está deshabilitada',
  )
  @ApiNotFoundError(
    'Lead',
    'Solo aplica cuando no se proporciona clienteToken: no existe configuración de LeadCars guardada para esta empresa',
  )
  async getLeadcarsCampanas(
    @Param('concesionarioId') concesionarioId: string,
    @Req() request: AuthenticatedRequest,
    @Query('clienteToken') clienteToken?: string,
    @Query('useSandbox') useSandbox?: string,
  ): Promise<LeadcarsCampanaDto[]> {
    const companyId = request.user.companyId;
    const concesionarioIdNum = parseInt(concesionarioId, 10);

    if (
      isNaN(concesionarioIdNum) ||
      !Number.isInteger(concesionarioIdNum) ||
      concesionarioIdNum <= 0
    ) {
      throw new BadRequestException(
        'concesionarioId debe ser un número entero positivo',
      );
    }

    let baseConfig: {
      clienteToken: string;
      useSandbox: boolean;
      concesionarioId: number;
      sedeId?: number;
      campanaCode?: string;
      tipoLeadDefault: number;
    };

    if (this.isValidClienteTokenInput(clienteToken)) {
      baseConfig = {
        clienteToken,
        useSandbox: useSandbox === 'true',
        concesionarioId: concesionarioIdNum,
        tipoLeadDefault: 0,
      };
    } else {
      baseConfig = await this.getLeadcarsConfigForCompany(companyId);
    }

    // Usar el concesionarioId del parámetro (no el de la config)
    const configForRequest = {
      ...baseConfig,
      concesionarioId: concesionarioIdNum,
    };

    const result = await this.leadcarsApiService.listCampanas(
      concesionarioIdNum,
      configForRequest,
    );
    if (result.isErr()) {
      this.throwLeadcarsError(result.error, 'campanas');
    }

    return result.unwrap().map((c) => ({
      id: c.id,
      nombre: c.nombre,
      codigo: c.codigo,
      concesionarioId: concesionarioIdNum,
    }));
  }

  @Get('leadcars/tipos')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Listar tipos de lead disponibles en LeadCars',
    description:
      'Proxy al endpoint GET /tipos de LeadCars. Usa el token guardado en config o el token pasado como query param (para setup inicial sin config guardada)',
  })
  @ApiQuery({
    name: 'clienteToken',
    required: false,
    type: String,
    description:
      'Token de cliente LeadCars de 20 caracteres (alternativa a config guardada, útil durante el setup inicial)',
  })
  @ApiQuery({
    name: 'useSandbox',
    required: false,
    type: String,
    enum: ['true', 'false'],
    description:
      "Usar entorno sandbox de LeadCars. Pasar la cadena 'true' para activarlo (default: 'false')",
  })
  @ApiResponse({
    status: 200,
    description:
      'Lista de tipos de lead. Nota: la API de LeadCars puede devolver solo el campo id sin nombre.',
    type: [LeadcarsTipoLeadDto],
  })
  @ApiValidationError(
    'La configuración de LeadCars está deshabilitada para esta empresa',
  )
  @ApiNotFoundError(
    'Lead',
    'Solo aplica cuando no se proporciona clienteToken: no existe configuración de LeadCars guardada para esta empresa',
  )
  async getLeadcarsTipos(
    @Req() request: AuthenticatedRequest,
    @Query('clienteToken') clienteToken?: string,
    @Query('useSandbox') useSandbox?: string,
  ): Promise<LeadcarsTipoLeadDto[]> {
    const companyId = request.user.companyId;

    let leadcarsConfig: {
      clienteToken: string;
      useSandbox: boolean;
      concesionarioId: number;
      sedeId?: number;
      campanaCode?: string;
      tipoLeadDefault: number;
    };

    if (this.isValidClienteTokenInput(clienteToken)) {
      leadcarsConfig = {
        clienteToken,
        useSandbox: useSandbox === 'true',
        concesionarioId: 0,
        tipoLeadDefault: 0,
      };
    } else {
      leadcarsConfig = await this.getLeadcarsConfigForCompany(companyId);
    }

    const result = await this.leadcarsApiService.listTipos(leadcarsConfig);
    if (result.isErr()) {
      this.throwLeadcarsError(result.error, 'tipos');
    }

    return result.unwrap().map((t) => ({ id: t.id, nombre: t.NOMBRE }));
  }

  @Get('leadcars/states')
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Listar estados disponibles en LeadCars',
    description:
      'Proxy al endpoint GET /listStates de LeadCars (API v2.5). Devuelve un mapa de nombre de estado → detalle del estado con sus campos dinámicos. Usa el token guardado en config o el token pasado como query param.',
  })
  @ApiQuery({
    name: 'clienteToken',
    required: false,
    type: String,
    description:
      'Token de cliente LeadCars de 20 caracteres (alternativa a config guardada, útil durante el setup inicial)',
  })
  @ApiQuery({
    name: 'useSandbox',
    required: false,
    type: String,
    enum: ['true', 'false'],
    description:
      "Usar entorno sandbox de LeadCars. Pasar la cadena 'true' para activarlo (default: 'false')",
  })
  @ApiResponse({
    status: 200,
    description:
      'Mapa de estados disponibles. Clave = nombre del estado (string), valor = objeto con id, group y fields (campos dinámicos del estado).',
    schema: {
      type: 'object',
      additionalProperties: {
        $ref: '#/components/schemas/LeadcarsStateItemDto',
      },
      example: {
        Pendiente: {
          id: 1,
          group: 'Abierto',
          fields: [
            {
              name: 'comentario',
              type: 'text',
              title: 'Comentario',
              required: false,
            },
          ],
        },
        Vendido: {
          id: 5,
          group: 'Cerrado',
          fields: [
            {
              name: 'motivo',
              type: 'textarea',
              title: 'Motivo de venta',
              required: true,
            },
          ],
        },
      },
    },
  })
  @ApiValidationError(
    'La configuración de LeadCars está deshabilitada para esta empresa',
  )
  @ApiNotFoundError(
    'Lead',
    'Solo aplica cuando no se proporciona clienteToken: no existe configuración de LeadCars guardada para esta empresa',
  )
  async getLeadcarsStates(
    @Req() request: AuthenticatedRequest,
    @Query('clienteToken') clienteToken?: string,
    @Query('useSandbox') useSandbox?: string,
  ): Promise<Record<string, LeadcarsStateItemDto>> {
    const companyId = request.user.companyId;

    let leadcarsConfig: {
      clienteToken: string;
      useSandbox: boolean;
      concesionarioId: number;
      sedeId?: number;
      campanaCode?: string;
      tipoLeadDefault: number;
    };

    if (this.isValidClienteTokenInput(clienteToken)) {
      leadcarsConfig = {
        clienteToken,
        useSandbox: useSandbox === 'true',
        concesionarioId: 0,
        tipoLeadDefault: 0,
      };
    } else {
      leadcarsConfig = await this.getLeadcarsConfigForCompany(companyId);
    }

    const result = await this.leadcarsApiService.listStates(leadcarsConfig);
    if (result.isErr()) {
      this.throwLeadcarsError(result.error, 'states');
    }

    return result.unwrap() as Record<string, LeadcarsStateItemDto>;
  }

  // ==================== Información del Sistema ====================

  @Get('supported-crms')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Obtener lista de CRMs soportados' })
  @ApiResponse({
    status: 200,
    description: 'Lista de tipos de CRM soportados',
    type: [String],
  })
  getSupportedCrms(): string[] {
    return this.crmSyncServiceFactory.getSupportedCrmTypes();
  }
}
