import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import {
  AuthGuard,
  AuthenticatedRequest,
} from 'src/context/shared/infrastructure/guards/auth.guard';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import {
  RolesGuard,
  RequiredRoles,
} from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';
import { ApiKeyService } from './api-key.service';
import {
  CreateApiKeyRequestDto,
  CreateApiKeyResponseDto,
} from './dtos/create-api-key.dto';

@ApiTags('API Keys')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * @deprecated Preferir POST /api/platform/companies/:companyId/api-keys
   */
  @Post('create')
  @UseGuards(DualAuthGuard, RolesGuard)
  @Roles(['superadmin'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Deprecated] Crear (o reutilizar) API Key para un dominio',
    description:
      'Usar POST /api/platform/companies/:companyId/api-keys. Requiere rol superadmin.',
  })
  @ApiBody({ type: CreateApiKeyRequestDto })
  @ApiResponse({
    status: 201,
    description: 'API Key creada o reutilizada',
    type: CreateApiKeyResponseDto,
  })
  @ApiValidationError()
  async createApiKey(
    @Body() body: CreateApiKeyRequestDto,
  ): Promise<CreateApiKeyResponseDto> {
    return await this.apiKeyService.createApiKeyForDomain(
      body.domain,
      body.companyId,
    );
  }

  @Get('company')
  @UseGuards(AuthGuard, RolesGuard)
  @RequiredRoles('admin')
  @ApiBearerAuth()
  @ApiAuthErrors()
  @ApiOperation({
    summary: 'Listar API Keys de la compañía',
    description:
      'Devuelve las API Keys asociadas a la compañía incluida en el token JWT (requiere rol admin).',
  })
  @ApiResponse({ status: 200, description: 'Listado obtenido correctamente' })
  async listCompanyApiKeys(@Req() req: AuthenticatedRequest) {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Token sin companyId asociado');
    }
    return await this.apiKeyService.listCompanyApiKeys(companyId);
  }
}
