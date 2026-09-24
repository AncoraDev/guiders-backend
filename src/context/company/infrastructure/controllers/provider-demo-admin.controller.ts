import {
  Body,
  Controller,
  HttpCode,
  Inject,
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
import {
  PROVIDER_REPOSITORY,
  ProviderRepository,
} from '../../domain/provider.repository';
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
