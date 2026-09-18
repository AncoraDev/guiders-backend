import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Put,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import { Public } from 'src/context/shared/infrastructure/decorators/public.decorator';
import { AuthenticatedRequest } from 'src/context/shared/infrastructure/guards/auth.guard';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';
import { Result } from 'src/context/shared/domain/result';
import {
  ValidateDomainApiKey,
  VALIDATE_DOMAIN_API_KEY,
} from 'src/context/auth/auth-visitor/application/services/validate-domain-api-key';
import { VisitorAccountApiKey } from 'src/context/auth/auth-visitor/domain/models/visitor-account-api-key';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from 'src/context/company/domain/company.repository';
import { CompanyContactFormLegal } from 'src/context/company/domain/value-objects/company-contact-form-legal';
import {
  LeadCaptureFlowEnvelopeDto,
  LeadCaptureFlowResponseDto,
  ResolveLeadCaptureFlowDto,
  ResolvedLeadCaptureFlowDto,
  SaveLeadCaptureFlowDto,
} from '../../application/dtos/lead-capture-flow.dto';
import { GetLeadCaptureFlowQuery } from '../../application/queries/get-lead-capture-flow.query';
import { ResolveLeadCaptureFlowQuery } from '../../application/queries/resolve-lead-capture-flow.query';
import { SaveLeadCaptureFlowCommand } from '../../application/commands/save-lead-capture-flow.command';
import { LeadCaptureFlowPrimitives } from '../../domain/entities/lead-capture-flow';
import {
  InvalidLeadCaptureFlowError,
  LeadCaptureError,
} from '../../domain/errors/lead-capture.error';

@ApiTags('Lead Capture')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('v2/lead-capture')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
// Los guards van por método: DualAuthGuard no entiende @Public(), así que a
// nivel de clase dejaría el endpoint del SDK devolviendo 401.
export class LeadCaptureFlowController {
  private readonly logger = new Logger(LeadCaptureFlowController.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(VALIDATE_DOMAIN_API_KEY)
    private readonly apiKeyValidator: ValidateDomainApiKey,
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
  ) {}

  @Get('flow')
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Obtener el guion de captación de la empresa',
    description:
      'Devuelve el guion configurado, activo o no. `flow` es null cuando la empresa todavía no ha configurado nada.',
  })
  @ApiResponse({ status: 200, type: LeadCaptureFlowEnvelopeDto })
  async getFlow(
    @Req() req: AuthenticatedRequest,
  ): Promise<LeadCaptureFlowEnvelopeDto> {
    const companyId = this.requireCompanyId(req);

    const result = await this.queryBus.execute<
      GetLeadCaptureFlowQuery,
      Result<LeadCaptureFlowPrimitives | null, LeadCaptureError>
    >(new GetLeadCaptureFlowQuery(companyId));

    if (result.isErr()) {
      this.logger.error(
        `No se pudo leer el guion de ${companyId}: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo leer el guion de captación',
      );
    }

    const flow = result.unwrap();
    return {
      flow: flow ? LeadCaptureFlowResponseDto.fromPrimitives(flow) : null,
    };
  }

  @Put('flow')
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles(['admin'])
  @ApiOperation({
    summary: 'Guardar el guion de captación de la empresa',
    description:
      'Sustituye el guion de la empresa. Se rechaza si el árbol no es recorrible: paso inicial inexistente, referencias colgando o bucles.',
  })
  @ApiBody({ type: SaveLeadCaptureFlowDto })
  @ApiResponse({ status: 200, type: LeadCaptureFlowEnvelopeDto })
  @ApiValidationError('El guion no es válido')
  async saveFlow(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveLeadCaptureFlowDto,
  ): Promise<LeadCaptureFlowEnvelopeDto> {
    const companyId = this.requireCompanyId(req);

    const result = await this.commandBus.execute<
      SaveLeadCaptureFlowCommand,
      Result<void, LeadCaptureError>
    >(
      new SaveLeadCaptureFlowCommand({
        companyId,
        updatedBy: req.user?.id ?? 'unknown',
        name: dto.name,
        enabled: dto.enabled,
        intro: dto.intro,
        startStepId: dto.startStepId,
        steps: dto.steps,
      }),
    );

    if (result.isErr()) {
      if (result.error instanceof InvalidLeadCaptureFlowError) {
        throw new BadRequestException(result.error.message);
      }
      this.logger.error(
        `No se pudo guardar el guion de ${companyId}: ${result.error.message}`,
      );
      throw new InternalServerErrorException(
        'No se pudo guardar el guion de captación',
      );
    }

    return this.getFlow(req);
  }

  @Post('flow/resolve')
  @Public()
  @ApiOperation({
    summary: 'Resolver el guion de captación para un sitio',
    description:
      'Endpoint público para el SDK. Devuelve el guion solo si está activo, junto con los textos legales de la empresa para el paso final de datos. `flow` es null cuando no hay guion que mostrar.',
  })
  @ApiBody({ type: ResolveLeadCaptureFlowDto })
  @ApiResponse({ status: 200, type: ResolvedLeadCaptureFlowDto })
  @ApiValidationError('Datos inválidos (domain o apiKey faltantes)')
  async resolveFlow(
    @Body() dto: ResolveLeadCaptureFlowDto,
  ): Promise<ResolvedLeadCaptureFlowDto> {
    const domain = dto.domain.replace(/^www\./i, '');

    const validApiKey = await this.apiKeyValidator.validate({
      apiKey: new VisitorAccountApiKey(dto.apiKey),
      domain,
    });
    if (!validApiKey) {
      throw new UnauthorizedException(
        'API Key inválida para el dominio proporcionado',
      );
    }

    const companyResult = await this.companyRepository.findByDomain(domain);
    if (companyResult.isErr()) {
      throw new NotFoundException(
        `No se encontró una empresa para el dominio: ${domain}`,
      );
    }
    const company = companyResult.unwrap();

    const flow = await this.queryBus.execute<
      ResolveLeadCaptureFlowQuery,
      LeadCaptureFlowPrimitives | null
    >(new ResolveLeadCaptureFlowQuery(company.getId().value));

    return {
      flow: flow ? LeadCaptureFlowResponseDto.fromPrimitives(flow) : null,
      legal:
        company.getContactFormLegal() ??
        CompanyContactFormLegal.empty().getValue(),
    };
  }

  /** El guion es por empresa, así que sin companyId no hay nada que hacer. */
  private requireCompanyId(req: AuthenticatedRequest): string {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new BadRequestException('El usuario no tiene una empresa asociada');
    }
    return companyId;
  }
}
