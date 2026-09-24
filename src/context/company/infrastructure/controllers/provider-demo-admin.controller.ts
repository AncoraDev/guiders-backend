import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IntegrationApiKeyGuard,
  IntegrationApiKeyRequest,
} from 'src/context/auth/integration-api-key/infrastructure/integration-api-key.guard';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import { providerDemoAdminMatches } from '../../application/providers/provider-demo-admin';

class VerifyDemoAdminDto {
  @ApiProperty({ description: 'Email del admin de la demo' })
  @IsString()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: 'Contraseña del admin de la demo' })
  @IsString()
  @MaxLength(200)
  password!: string;
}

@ApiTags('integration')
@Controller('v2/integration/demo-admin')
@UseGuards(IntegrationApiKeyGuard)
export class ProviderDemoAdminController {
  constructor(
    @Inject(PROVIDER_REPOSITORY)
    private readonly providers: ProviderRepository,
  ) {}

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Comprobar el acceso de admin de la demo LeadCars',
    description:
      'La clave de integración identifica al proveedor. No crea sesión.',
  })
  async verify(
    @Req() req: IntegrationApiKeyRequest,
    @Body() body: VerifyDemoAdminDto,
  ): Promise<{ ok: true }> {
    const provider = await this.providers.findByCompanyId(
      req.integrationApiKey.companyId,
    );
    const matches = provider
      ? providerDemoAdminMatches(
          provider.demoAdminEmail,
          provider.demoAdminPassword,
          body.email ?? '',
          body.password ?? '',
        )
      : false;
    if (!matches) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }
    return { ok: true };
  }
}

@ApiTags('integration')
@Controller('v2/integration/provider')
@UseGuards(IntegrationApiKeyGuard)
export class IntegrationProviderController {
  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companies: CompanyRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Nombre del proveedor de esta clave',
  })
  async show(
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<{ name: string }> {
    const found = await this.companies.findById(
      new Uuid(req.integrationApiKey.companyId),
    );
    if (found.isErr()) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    return { name: found.unwrap().getCompanyName().getValue() };
  }
}
