import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import {
  AuthenticatedRequest,
} from 'src/context/shared/infrastructure/guards/auth.guard';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import {
  ApiAuthErrors,
  ApiInternalServerError,
} from 'src/context/shared/infrastructure/swagger';
import { ValidationError } from 'src/context/shared/domain/validation.error';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Optional } from 'src/context/shared/domain/optional';
import { UserAccountPrimitives } from '../../domain/user-account.aggregate';
import { ListPlatformUsersQuery } from '../../application/queries/list-platform-users.query';
import { PlatformUsersListResponseDto } from '../../application/dtos/platform-users-response.dto';
import { CreatePlatformUserRequestDto } from '../../application/dtos/create-platform-user.dto';
import {
  UpdateCompanyUserRequestDto,
  SetCompanyUserActiveRequestDto,
  CompanyUserMutationResponseDto,
} from '../../application/dtos/company-user-crud.dto';
import { CreateCompanyUserCommand } from '../../application/commands/create-company-user.command';
import { UpdateCompanyUserCommand } from '../../application/commands/update-company-user.command';
import { SetCompanyUserActiveCommand } from '../../application/commands/set-company-user-active.command';
import { DeleteCompanyUserCommand } from '../../application/commands/delete-company-user.command';
import { FindOneUserByIdQuery } from '../../application/read/find-one-user-by-id.query';
import {
  CannotModifySelfError,
  CompanyUserEmailExistsError,
  CompanyUserNotFoundError,
  InvalidCompanyUserDataError,
  InvalidCompanyUserPasswordError,
  InvalidCompanyUserRolesError,
} from '../../application/errors/company-user.errors';
import { KeycloakAdminError } from '../services/keycloak-admin.service';

@ApiTags('platform')
@ApiBearerAuth()
@ApiAuthErrors()
@ApiInternalServerError()
@UseGuards(DualAuthGuard, RolesGuard)
@Roles(['superadmin'])
@Controller('platform/users')
export class PlatformUsersController {
  private readonly logger = new Logger(PlatformUsersController.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar usuarios de todas las companies',
    description:
      'Vista global para el equipo Guiders (superadmin): personas, roles y estado.',
  })
  @ApiResponse({ status: 200, type: PlatformUsersListResponseDto })
  async listUsers(): Promise<PlatformUsersListResponseDto> {
    return this.queryBus.execute(new ListPlatformUsersQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear usuario en una company',
    description:
      'Crea el usuario en Keycloak con contraseña temporal (sin email). En el primer login Keycloak exige cambiar la contraseña.',
  })
  @ApiBody({ type: CreatePlatformUserRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado',
    type: CompanyUserMutationResponseDto,
  })
  async createUser(
    @Body() body: CreatePlatformUserRequestDto,
  ): Promise<CompanyUserMutationResponseDto> {
    if (
      !body?.companyId ||
      !body?.firstName?.trim() ||
      !body?.lastName?.trim() ||
      !body?.email?.trim() ||
      !body?.temporaryPassword
    ) {
      throw new HttpException(
        'companyId, firstName, lastName, email y temporaryPassword son obligatorios',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result: Result<{ userId: string }, DomainError> =
      await this.commandBus.execute(
        new CreateCompanyUserCommand(
          body.companyId,
          body.firstName,
          body.lastName,
          body.email,
          body.roles ?? [],
          body.temporaryPassword,
          body.phone,
        ),
      );

    if (result.isErr()) {
      throw this.mapCompanyUserError(result.error);
    }
    return { userId: result.unwrap().userId };
  }

  @Patch(':userId')
  @ApiOperation({
    summary: 'Actualizar usuario de cualquier company',
    description: 'Actualiza nombre y/o roles (BD + Keycloak)',
  })
  @ApiParam({ name: 'userId', description: 'ID del usuario en Guiders' })
  @ApiBody({ type: UpdateCompanyUserRequestDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  async updateUser(
    @Param('userId') userId: string,
    @Body() body: UpdateCompanyUserRequestDto,
  ): Promise<{ ok: true }> {
    const companyId = await this.resolveCompanyId(userId);
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new UpdateCompanyUserCommand(
        companyId,
        userId,
        body?.name,
        body?.roles,
      ),
    );

    if (result.isErr()) {
      throw this.mapCompanyUserError(result.error);
    }
    return { ok: true };
  }

  @Patch(':userId/active')
  @ApiOperation({
    summary: 'Activar o desactivar usuario de cualquier company',
    description: 'Actualiza isActive en BD y enabled en Keycloak',
  })
  @ApiParam({ name: 'userId', description: 'ID del usuario en Guiders' })
  @ApiBody({ type: SetCompanyUserActiveRequestDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  async setUserActive(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: SetCompanyUserActiveRequestDto,
  ): Promise<{ ok: true }> {
    if (typeof body?.isActive !== 'boolean') {
      throw new HttpException(
        'isActive debe ser boolean',
        HttpStatus.BAD_REQUEST,
      );
    }

    const companyId = await this.resolveCompanyId(userId);
    const actorId = req.user?.id ?? '';
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new SetCompanyUserActiveCommand(
        companyId,
        userId,
        actorId,
        actorId,
        body.isActive,
      ),
    );

    if (result.isErr()) {
      throw this.mapCompanyUserError(result.error);
    }
    return { ok: true };
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar usuario de cualquier company',
    description: 'Borrado duro en Keycloak y en BD Guiders',
  })
  @ApiParam({ name: 'userId', description: 'ID del usuario en Guiders' })
  @ApiResponse({ status: 204, description: 'Usuario eliminado' })
  async deleteUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
  ): Promise<void> {
    const companyId = await this.resolveCompanyId(userId);
    const actorId = req.user?.id ?? '';
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new DeleteCompanyUserCommand(companyId, userId, actorId, actorId),
    );

    if (result.isErr()) {
      throw this.mapCompanyUserError(result.error);
    }
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const found: Optional<{ user: UserAccountPrimitives }> =
      await this.queryBus.execute(new FindOneUserByIdQuery(userId));

    if (found.isEmpty()) {
      throw new HttpException(
        `Usuario ${userId} no encontrado`,
        HttpStatus.NOT_FOUND,
      );
    }

    return found.get().user.companyId;
  }

  private mapCompanyUserError(error: DomainError): HttpException {
    if (error instanceof CompanyUserNotFoundError) {
      return new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
    if (
      error instanceof CompanyUserEmailExistsError ||
      error instanceof InvalidCompanyUserRolesError ||
      error instanceof InvalidCompanyUserPasswordError ||
      error instanceof InvalidCompanyUserDataError ||
      error instanceof CannotModifySelfError
    ) {
      return new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    if (error instanceof KeycloakAdminError) {
      return new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
    if (error instanceof ValidationError) {
      return new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    this.logger.error(`Error platform/users: ${error.message}`);
    return new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
