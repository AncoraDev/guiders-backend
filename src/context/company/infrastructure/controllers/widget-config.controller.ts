import {
  Controller,
  Get,
  Query,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Public } from '../../../shared/infrastructure/decorators/public.decorator';
import { PublicEndpoint } from '../../../shared/infrastructure/swagger';
import { PublicWidgetConfigQueryDto } from '../../application/dtos/public-widget-config.dto';
import { GetCompanyWidgetConfigByDomainQuery } from '../../application/queries/get-company-widget-config-by-domain.query';
import { WidgetConfigPrimitives } from '../../domain/value-objects/company-widget-config';
import {
  VALIDATE_DOMAIN_API_KEY,
  ValidateDomainApiKey,
} from '../../../auth/auth-visitor/application/services/validate-domain-api-key';
import { VisitorAccountApiKey } from '../../../auth/auth-visitor/domain/models/visitor-account-api-key';

@ApiTags('widget')
@Controller('v2/widget')
export class WidgetConfigController {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(VALIDATE_DOMAIN_API_KEY)
    private readonly apiKeyValidator: ValidateDomainApiKey,
  ) {}

  @Get('config')
  @Public()
  @PublicEndpoint()
  @ApiOperation({
    summary: 'Configuración pública del widget',
    description:
      'El pixel lee chat on/off, tema y posición. Valida dominio + API key.',
  })
  @ApiResponse({ status: 200, description: 'Configuración del widget' })
  async getPublicConfig(
    @Query() query: PublicWidgetConfigQueryDto,
  ): Promise<WidgetConfigPrimitives> {
    const normalizedDomain = query.domain.replace(/^www\./i, '');
    const apiKeyValid = await this.apiKeyValidator.validate({
      apiKey: new VisitorAccountApiKey(query.apiKey),
      domain: normalizedDomain,
    });
    if (!apiKeyValid) {
      throw new UnauthorizedException(
        'API Key inválida para el dominio proporcionado',
      );
    }

    const config = await this.queryBus.execute<
      GetCompanyWidgetConfigByDomainQuery,
      WidgetConfigPrimitives | null
    >(new GetCompanyWidgetConfigByDomainQuery(normalizedDomain));

    if (config === null) {
      throw new NotFoundException(
        `No se encontró una empresa para el dominio: ${normalizedDomain}`,
      );
    }

    return config;
  }
}
