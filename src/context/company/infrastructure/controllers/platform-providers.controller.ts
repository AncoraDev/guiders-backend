import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiValidationError,
} from 'src/context/shared/infrastructure/swagger';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import {
  CompanyDomainTakenError,
  InvalidCompanyDataError,
} from '../../application/errors/company-platform.errors';
import {
  ProviderDemoAdminEmailTakenError,
  ProviderHasClientsError,
  ProviderNotFoundError,
} from '../../application/errors/provider.errors';
import {
  CreateProviderCommand,
  CreateProviderResult,
} from '../../application/commands/create-provider.command-handler';
import {
  RenameProviderCommand,
  RenameProviderResult,
} from '../../application/commands/rename-provider.command-handler';
import {
  RegenerateProviderTokenCommand,
  RegenerateProviderTokenResult,
} from '../../application/commands/regenerate-provider-token.command-handler';
import { DeleteProviderCommand } from '../../application/commands/delete-provider.command-handler';
import {
  ListProvidersQuery,
  ProviderListItem,
} from '../../application/queries/list-providers.query-handler';

export class CreateProviderDto {
  @ApiProperty({ description: 'Nombre del proveedor', example: 'LeadCars' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    description: 'Email para entrar en la demo de LeadCars',
    example: 'admin@proveedor.com',
  })
  @IsString()
  @MaxLength(255)
  demoAdminEmail!: string;

  @ApiProperty({ description: 'Contraseña para entrar en la demo de LeadCars' })
  @IsString()
  @MaxLength(200)
  demoAdminPassword!: string;
}

export class UpdateProviderDto {
  @ApiProperty({ description: 'Nombre del proveedor', example: 'LeadCars' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Email para entrar en la demo de LeadCars' })
  @IsString()
  @MaxLength(255)
  demoAdminEmail!: string;

  @ApiProperty({
    description:
      'Contraseña de la demo. Vacía conserva la que ya está guardada.',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  demoAdminPassword?: string;
}

@ApiTags('platform')
@ApiBearerAuth()
@ApiAuthErrors()
@ApiInternalServerError()
@UseGuards(DualAuthGuard, RolesGuard)
@Roles(['superadmin'])
@Controller('platform/providers')
export class PlatformProvidersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar proveedores',
    description:
      'Incluye el token de integración y el usuario de la demo. Solo superadmin.',
  })
  async list(): Promise<ProviderListItem[]> {
    return this.queryBus.execute(new ListProvidersQuery());
  }

  @Post()
  @ApiOperation({
    summary: 'Crear un proveedor',
    description:
      'Crea la empresa interna, una clave live y el acceso a la demo.',
  })
  @ApiValidationError()
  async create(@Body() body: CreateProviderDto): Promise<CreateProviderResult> {
    const result = await this.commandBus.execute<
      CreateProviderCommand,
      Result<CreateProviderResult, DomainError>
    >(
      new CreateProviderCommand(
        body.name,
        body.demoAdminEmail,
        body.demoAdminPassword,
      ),
    );
    if (result.isErr()) throw this.mapError(result.error);
    return result.unwrap();
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar nombre y acceso a la demo de un proveedor',
  })
  @ApiValidationError()
  async rename(
    @Param('id') id: string,
    @Body() body: UpdateProviderDto,
  ): Promise<RenameProviderResult> {
    const result = await this.commandBus.execute<
      RenameProviderCommand,
      Result<RenameProviderResult, DomainError>
    >(
      new RenameProviderCommand(
        id,
        body.name,
        body.demoAdminEmail,
        body.demoAdminPassword ?? '',
      ),
    );
    if (result.isErr()) throw this.mapError(result.error);
    return result.unwrap();
  }

  @Post(':id/token')
  @ApiOperation({
    summary: 'Regenerar el token del proveedor',
    description:
      'Revoca la clave activa y guarda la nueva. El listado sigue mostrándola.',
  })
  async regenerate(
    @Param('id') id: string,
  ): Promise<RegenerateProviderTokenResult> {
    const result = await this.commandBus.execute<
      RegenerateProviderTokenCommand,
      Result<RegenerateProviderTokenResult, DomainError>
    >(new RegenerateProviderTokenCommand(id));
    if (result.isErr()) throw this.mapError(result.error);
    return result.unwrap();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar un proveedor',
    description:
      'Solo si no tiene clientes. No borra chats, mensajes ni leads.',
  })
  async remove(@Param('id') id: string): Promise<{ ok: true }> {
    const result = await this.commandBus.execute<
      DeleteProviderCommand,
      Result<void, DomainError>
    >(new DeleteProviderCommand(id));
    if (result.isErr()) throw this.mapError(result.error);
    return { ok: true };
  }

  private mapError(error: DomainError): HttpException {
    if (
      error instanceof ProviderNotFoundError ||
      error instanceof CompanyNotFoundError
    ) {
      return new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
    if (
      error instanceof ProviderHasClientsError ||
      error instanceof ProviderDemoAdminEmailTakenError ||
      error instanceof CompanyDomainTakenError
    ) {
      return new HttpException(error.message, HttpStatus.CONFLICT);
    }
    if (error instanceof InvalidCompanyDataError) {
      return new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    return new HttpException(
      error.message || 'No se pudo completar la operación',
      HttpStatus.BAD_REQUEST,
    );
  }
}
