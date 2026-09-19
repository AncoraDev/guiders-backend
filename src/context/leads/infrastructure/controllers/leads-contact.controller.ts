import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Inject,
  NotFoundException,
  BadRequestException,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CommandBus } from '@nestjs/cqrs';
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
  SaveLeadContactDataDto,
  LeadContactDataResponseDto,
  ListLeadContactDataQueryDto,
  UpdateLeadFollowUpDto,
} from '../../application/dtos/lead-contact-data.dto';
import { SaveLeadContactDataCommand } from '../../application/commands/save-lead-contact-data.command';
import { UpdateLeadFollowUpCommand } from '../../application/commands/update-lead-follow-up.command';
import { LeadContactDataNotFoundError } from '../../domain/errors/leads.error';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from '../../domain/lead-contact-data.repository';

interface AuthenticatedRequest {
  user: {
    companyId: string;
    sub: string;
    role?: string;
  };
}

@ApiTags('Leads - Contact Data')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('leads')
@UseGuards(DualAuthGuard, RolesGuard)
export class LeadsContactController {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(LEAD_CONTACT_DATA_REPOSITORY)
    private readonly contactDataRepository: ILeadContactDataRepository,
  ) {}

  /**
   * Guarda o actualiza datos de contacto para un visitor
   * POST /leads/contact-data/:visitorId
   */
  @Post('contact-data/:visitorId')
  @Roles(['admin', 'commercial'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Guardar datos de contacto del lead',
    description:
      'Crea o actualiza los datos de contacto de un visitor. Si ya existen datos, se hace merge parcial.',
  })
  @ApiParam({
    name: 'visitorId',
    description: 'ID del visitor',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Datos de contacto guardados correctamente',
    type: LeadContactDataResponseDto,
  })
  @ApiValidationError('Error de validacion o al guardar')
  async saveContactData(
    @Param('visitorId') visitorId: string,
    @Body() dto: SaveLeadContactDataDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadContactDataResponseDto> {
    const result = await this.commandBus.execute(
      new SaveLeadContactDataCommand({
        visitorId,
        companyId: req.user.companyId,
        alias: dto.alias,
        nombre: dto.nombre,
        apellidos: dto.apellidos,
        email: dto.email,
        telefono: dto.telefono,
        dni: dto.dni,
        poblacion: dto.poblacion,
        acceptedPrivacyPolicy: dto.acceptedPrivacyPolicy,
        acceptedMarketing: dto.acceptedMarketing,
        additionalData: dto.additionalData,
        extractedFromChatId: dto.extractedFromChatId,
      }),
    );

    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    const savedId = result.unwrap();

    // Obtener los datos guardados para retornarlos
    const savedResult = await this.contactDataRepository.findById(savedId);
    if (savedResult.isErr() || !savedResult.unwrap()) {
      throw new BadRequestException('Error obteniendo datos guardados');
    }

    return LeadContactDataResponseDto.fromPrimitives(savedResult.unwrap()!);
  }

  /**
   * Lista todos los datos de contacto de la empresa
   * GET /leads/contact-data
   * IMPORTANTE: declarar ANTES de contact-data/:visitorId para que Nest no capture la ruta estática.
   */
  @Get('contact-data')
  @Roles(['admin', 'commercial'])
  @ApiOperation({
    summary: 'Listar datos de contacto',
    description:
      'Retorna los contactos de la empresa. source=assistant y status filtran la cola de leads automáticos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de datos de contacto',
    type: [LeadContactDataResponseDto],
  })
  async listContactData(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListLeadContactDataQueryDto,
  ): Promise<LeadContactDataResponseDto[]> {
    const result = await this.contactDataRepository.findByCompanyId(
      req.user.companyId,
      { source: query.source, status: query.status },
    );

    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    return result
      .unwrap()
      .map((cd) => LeadContactDataResponseDto.fromPrimitives(cd));
  }

  /**
   * Obtiene datos de contacto por visitorId
   * GET /leads/contact-data/:visitorId
   */
  @Get('contact-data/:visitorId')
  @Roles(['admin', 'commercial'])
  @ApiOperation({
    summary: 'Obtener datos de contacto de un visitor',
    description: 'Retorna los datos de contacto asociados a un visitor',
  })
  @ApiParam({
    name: 'visitorId',
    description: 'ID del visitor',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Datos de contacto encontrados',
    type: LeadContactDataResponseDto,
  })
  @ApiNotFoundError('Recurso', 'No se encontraron datos de contacto')
  async getContactData(
    @Param('visitorId') visitorId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadContactDataResponseDto> {
    const result = await this.contactDataRepository.findByVisitorId(
      visitorId,
      req.user.companyId,
    );

    if (result.isErr()) {
      throw new BadRequestException(result.error.message);
    }

    const contactData = result.unwrap();
    if (!contactData) {
      throw new NotFoundException(
        `No se encontraron datos de contacto para el visitor ${visitorId}`,
      );
    }

    return LeadContactDataResponseDto.fromPrimitives(contactData);
  }

  /**
   * Marca el seguimiento de un lead automático.
   * PATCH /leads/contact-data/:visitorId/follow-up
   */
  @Patch('contact-data/:visitorId/follow-up')
  @Roles(['admin', 'commercial'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Actualizar el seguimiento del lead',
    description:
      'Pasa un lead automático a contactado o descartado para sacarlo de la cola.',
  })
  @ApiParam({
    name: 'visitorId',
    description: 'ID del visitor',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'Seguimiento actualizado',
    type: LeadContactDataResponseDto,
  })
  @ApiNotFoundError('Recurso', 'No se encontraron datos de contacto')
  async updateFollowUp(
    @Param('visitorId') visitorId: string,
    @Body() dto: UpdateLeadFollowUpDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadContactDataResponseDto> {
    const result = await this.commandBus.execute(
      new UpdateLeadFollowUpCommand({
        visitorId,
        companyId: req.user.companyId,
        commercialId: req.user.sub,
        status: dto.status,
      }),
    );

    if (result.isErr()) {
      if (result.error instanceof LeadContactDataNotFoundError) {
        throw new NotFoundException(result.error.message);
      }
      throw new BadRequestException(result.error.message);
    }

    return LeadContactDataResponseDto.fromPrimitives(result.unwrap());
  }
}
