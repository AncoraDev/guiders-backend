import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import {
  IntegrationApiKeyGuard,
  IntegrationApiKeyRequest,
} from '../integration-api-key.guard';
import { SyncCommercialFromExternalCommandHandler } from '../../application/commands/sync-commercial-from-external.command-handler';
import { SyncCommercialFromExternalCommand } from '../../application/commands/sync-commercial-from-external.command';
import {
  SyncCommercialFromExternalDto,
  SyncCommercialFromExternalResponseDto,
} from '../../application/dtos/sync-commercial-from-external.dto';
import { ExternalCommercialSyncError } from '../../domain/errors/external-commercial-sync.errors';
import { InvalidCompanyUserRolesError } from 'src/context/auth/auth-user/application/errors/company-user.errors';

@ApiTags('LeadCars')
@ApiSecurity('api-key')
@Controller('v2/integration/commercials')
@UseGuards(IntegrationApiKeyGuard)
export class ExternalCommercialSyncController {
  constructor(
    private readonly syncHandler: SyncCommercialFromExternalCommandHandler,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Alta, cambio o baja de un comercial de LeadCars',
    description:
      'Crea o actualiza el usuario de Guiders a partir del id externo de LeadCars. ' +
      'No abre cuenta en Keycloak: el comercial entra por el iframe. ' +
      'La respuesta incluye el userId de Guiders para POST /v2/integration/embed/start. ' +
      'active=false deja la cuenta inactiva.',
  })
  @ApiResponse({ status: 200, type: SyncCommercialFromExternalResponseDto })
  async sync(
    @Body() dto: SyncCommercialFromExternalDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<SyncCommercialFromExternalResponseDto> {
    if (req.integrationApiKey.companyId !== dto.companyId) {
      throw new ForbiddenException({
        code: 'EMBED_TENANT_MISMATCH',
        message: 'El companyId del body no coincide con el de la API Key',
        statusCode: 403,
      });
    }

    const result = await this.syncHandler.execute(
      new SyncCommercialFromExternalCommand(
        dto.companyId,
        dto.externalUserId,
        dto.email,
        dto.firstName,
        dto.lastName ?? '',
        dto.roles ?? ['commercial'],
        dto.active ?? true,
      ),
    );

    if (result.isErr()) {
      const error = result.error;
      if (
        error instanceof ExternalCommercialSyncError ||
        error instanceof InvalidCompanyUserRolesError
      ) {
        const code =
          error instanceof ExternalCommercialSyncError
            ? error.code
            : 'EXTERNAL_USER_INVALID';
        const body = {
          code,
          message: error.message,
          statusCode:
            code === 'EXTERNAL_USER_EMAIL_TAKEN' ||
            code === 'EXTERNAL_USER_OTHER_COMPANY'
              ? HttpStatus.CONFLICT
              : HttpStatus.BAD_REQUEST,
        };
        const exception: HttpException =
          body.statusCode === HttpStatus.CONFLICT
            ? new ConflictException(body)
            : new BadRequestException(body);
        throw exception;
      }
      throw new BadRequestException({
        code: 'EXTERNAL_USER_INVALID',
        message: error.message,
        statusCode: 400,
      });
    }

    return result.unwrap();
  }
}
