import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
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
import { RemoveCommercialFromExternalCommandHandler } from '../../application/commands/remove-commercial-from-external.command-handler';
import { RemoveCommercialFromExternalCommand } from '../../application/commands/remove-commercial-from-external.command';
import { RemoveCommercialFromExternalDto } from '../../application/dtos/remove-commercial-from-external.dto';
import { ManagedCompanyAccess } from '../../application/services/managed-company-access';

@ApiTags('LeadCars')
@ApiSecurity('api-key')
@Controller('v2/integration/commercials')
@UseGuards(IntegrationApiKeyGuard)
export class ExternalCommercialSyncController {
  constructor(
    private readonly syncHandler: SyncCommercialFromExternalCommandHandler,
    private readonly removeHandler: RemoveCommercialFromExternalCommandHandler,
    private readonly companies: ManagedCompanyAccess,
  ) {}

  private async assertCompany(
    providerCompanyId: string,
    targetCompanyId: string,
  ): Promise<void> {
    const allowed = await this.companies.allows(
      providerCompanyId,
      targetCompanyId,
    );
    if (!allowed) {
      throw new ForbiddenException({
        code: 'EMBED_TENANT_MISMATCH',
        message: 'El companyId del body no coincide con el de la API Key',
        statusCode: 403,
      });
    }
  }

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
    await this.assertCompany(req.integrationApiKey.companyId, dto.companyId);

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

  @Post('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un comercial vinculado',
    description:
      'Borra el vínculo y la cuenta de Guiders de ese id externo. ' +
      'No borra chats, mensajes ni leads. Si no hay vínculo, responde 404.',
  })
  @ApiResponse({ status: 200, description: 'Cuenta eliminada' })
  async remove(
    @Body() dto: RemoveCommercialFromExternalDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<{ ok: true }> {
    await this.assertCompany(req.integrationApiKey.companyId, dto.companyId);

    const result = await this.removeHandler.execute(
      new RemoveCommercialFromExternalCommand(
        dto.companyId,
        dto.externalUserId,
      ),
    );
    if (result.isErr()) {
      const error = result.error;
      if (
        error instanceof ExternalCommercialSyncError &&
        error.code === 'EXTERNAL_USER_NOT_FOUND'
      ) {
        throw new NotFoundException({
          code: error.code,
          message: error.message,
          statusCode: 404,
        });
      }
      if (
        error instanceof ExternalCommercialSyncError &&
        error.code === 'EXTERNAL_USER_OTHER_COMPANY'
      ) {
        throw new ConflictException({
          code: error.code,
          message: error.message,
          statusCode: 409,
        });
      }
      throw new BadRequestException({
        code:
          error instanceof ExternalCommercialSyncError
            ? error.code
            : 'EXTERNAL_USER_INVALID',
        message: error.message,
        statusCode: 400,
      });
    }
    return { ok: true };
  }
}