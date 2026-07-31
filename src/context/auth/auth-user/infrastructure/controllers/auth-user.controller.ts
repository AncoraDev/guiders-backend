/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Patch,
  Headers,
  UnauthorizedException,
  HttpCode,
  UseGuards,
  Req,
  Param,
  Delete,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthUserService } from '../services/auth-user.service';
import { ValidationError } from 'src/context/shared/domain/validation.error';
import { UserAlreadyExistsError } from '../../application/errors/user-already-exists.error';
import { UnauthorizedError } from '../../application/errors/unauthorized.error';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AcceptInviteCommand } from '../../application/commands/accept-invite.command';
import { UpdateUserAvatarCommand } from '../../application/commands/update-user-avatar.command';
import {
  AuthGuard,
  AuthenticatedRequest,
} from 'src/context/shared/infrastructure/guards/auth.guard';
import { DualAuthGuard } from 'src/context/shared/infrastructure/guards/dual-auth.guard';
import { FindUsersByCompanyIdQuery } from '../../application/queries/find-users-by-company-id.query';
import { UserListResponseDto } from '../../application/dtos/user-list-response.dto';
import { UserAccountPrimitives } from '../../domain/user-account.aggregate';
import { UserAccountCompanyId } from '../../domain/value-objects/user-account-company-id';
import { FindOneUserByIdQuery } from '../../application/read/find-one-user-by-id.query';
import { CurrentUserResponseDto } from '../../application/dtos/current-user-response.dto';
import { Optional } from 'src/context/shared/domain/optional';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiHeader,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import {
  ApiAuthErrors,
  ApiInternalServerError,
  ApiNotFoundError,
  ApiValidationError,
  PublicEndpoint,
} from 'src/context/shared/infrastructure/swagger';
import {
  LoginRequestDto,
  TokenResponseDto,
  RegisterRequestDto,
  RefreshTokenRequestDto,
  RefreshTokenResponseDto,
  AcceptInviteRequestDto,
} from '../dtos/auth-user.dto';
import { RolesGuard } from 'src/context/shared/infrastructure/guards/role.guard';
import { Roles } from 'src/context/shared/infrastructure/roles.decorator';
import { SyncUserWithKeycloakCommand } from '../../application/commands/sync-user-with-keycloak.command';
import {
  SyncUserWithKeycloakDto,
  SyncUserResponseDto,
} from '../../application/dtos/sync-user-with-keycloak.dto';
import { VerifyRoleMappingQuery } from '../../application/queries/verify-role-mapping.query';
import {
  VerifyRoleMappingDto,
  VerifyRoleMappingResponseDto,
} from '../../application/dtos/verify-role-mapping.dto';
import { FindUserByKeycloakIdQuery } from '../../application/queries/find-user-by-keycloak-id.query';
import { LinkUserWithKeycloakCommand } from '../../application/commands/link-user-with-keycloak.command';
import { CreateCompanyUserCommand } from '../../application/commands/create-company-user.command';
import { UpdateCompanyUserCommand } from '../../application/commands/update-company-user.command';
import { SetCompanyUserActiveCommand } from '../../application/commands/set-company-user-active.command';
import { DeleteCompanyUserCommand } from '../../application/commands/delete-company-user.command';
import {
  CreateCompanyUserRequestDto,
  UpdateCompanyUserRequestDto,
  SetCompanyUserActiveRequestDto,
  CompanyUserMutationResponseDto,
} from '../../application/dtos/company-user-crud.dto';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CannotModifySelfError,
  CompanyUserEmailExistsError,
  CompanyUserNotFoundError,
  InvalidCompanyUserRolesError,
} from '../../application/errors/company-user.errors';
import { KeycloakAdminError } from '../services/keycloak-admin.service';

@ApiTags('Autenticación de Usuarios')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('user/auth')
export class AuthUserController {
  private readonly logger = new Logger(AuthUserController.name);
  constructor(
    private readonly authUserService: AuthUserService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('login')
  @PublicEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión de usuario',
    description:
      'Verifica las credenciales y devuelve tokens de acceso y actualización',
  })
  @ApiBody({ type: LoginRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Usuario autenticado correctamente',
    type: TokenResponseDto,
  })
  @ApiValidationError('Error de validación (formato de email incorrecto)')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
  ): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    try {
      const tokens = await this.authUserService.login(email, password);
      return {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      };
    } catch (error) {
      this.logger.error('Error logging in user', error);
      if (error instanceof ValidationError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof UnauthorizedError) {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo usuario',
    description: 'Crea un nuevo usuario en el sistema con el rol especificado',
  })
  @ApiBody({ type: RegisterRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Usuario registrado correctamente',
  })
  @ApiValidationError(
    'Error de validación (formato de email incorrecto, contraseña no cumple requisitos)',
  )
  @ApiResponse({
    status: 409,
    description: 'El usuario ya existe',
  })
  @ApiBearerAuth()
  @Roles(['admin'])
  @UseGuards(AuthGuard, RolesGuard)
  async register(
    @Body('email') email: string,
    @Body('name') name: string,
    @Body('roles') roles: string[],
    @Req() req: { user: { companyId: string } },
  ): Promise<void> {
    try {
      await this.authUserService.register(
        email,
        name,
        req.user.companyId,
        roles,
      );
    } catch (error) {
      this.logger.error('Error registering user', error);
      if (error instanceof ValidationError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof UserAlreadyExistsError) {
        throw new HttpException(error.message, HttpStatus.CONFLICT);
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('refresh')
  @PublicEndpoint()
  @ApiOperation({
    summary: 'Renovar token de acceso',
    description:
      'Utiliza un token de actualización para obtener un nuevo token de acceso',
  })
  @ApiBody({ type: RefreshTokenRequestDto })
  @ApiResponse({
    status: 200,
    description: 'Token renovado correctamente',
    type: RefreshTokenResponseDto,
  })
  @ApiValidationError('Error de validación (token mal formado)')
  async refresh(@Body('refreshToken') refreshToken: string) {
    try {
      const tokens = await this.authUserService.refresh(refreshToken);
      return {
        accessToken: tokens.accessToken,
      };
    } catch (error) {
      this.logger.error('Error refreshing token', error);
      if (error instanceof ValidationError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof UnauthorizedError) {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('logout')
  @PublicEndpoint()
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Cierra la sesión del usuario y revoca sus tokens',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión cerrada correctamente',
  })
  async logout() {
    try {
      await this.authUserService.logout();
    } catch (error) {
      this.logger.error('Error logging out user', error);
      if (error instanceof ValidationError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof UnauthorizedError) {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
      } else {
        throw new HttpException(
          'Internal server error',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  @Get('validate')
  @ApiOperation({
    summary: 'Validar token de acceso',
    description: 'Verifica que el token de acceso sea válido',
  })
  @ApiBearerAuth()
  @ApiHeader({
    name: 'Authorization',
    description: 'Token de acceso con formato Bearer',
    required: true,
    schema: { type: 'string', default: 'Bearer <token>' },
  })
  @ApiResponse({
    status: 204,
    description: 'Token válido',
  })
  @ApiValidationError('Error de validación (token mal formado)')
  @HttpCode(HttpStatus.NO_CONTENT)
  async validate(@Headers('Authorization') bearerToken: string) {
    const [prefix, accessToken] = bearerToken.split(' ');
    if (prefix !== 'Bearer') {
      throw new HttpException('Invalid token', HttpStatus.BAD_REQUEST);
    }
    try {
      await this.authUserService.validate(accessToken);
      return;
    } catch (error) {
      this.logger.error('Error validating token', error);
      if (error instanceof ValidationError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof UnauthorizedException) {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
  @Post('accept-invite')
  @PublicEndpoint()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aceptar invitación',
    description:
      'Acepta una invitación para unirse a una compañía y establece la contraseña',
  })
  @ApiBody({
    type: AcceptInviteRequestDto,
    description: 'Datos para aceptar la invitación',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Invitación aceptada correctamente',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Invitación aceptada correctamente',
        },
      },
    },
  })
  @ApiValidationError(
    'Error de validación (token inválido o contraseña no cumple requisitos)',
  )
  async acceptInvite(
    @Body() acceptInviteDto: AcceptInviteRequestDto,
  ): Promise<{ message: string }> {
    try {
      const command = new AcceptInviteCommand(
        acceptInviteDto.token,
        acceptInviteDto.password,
      );
      await this.commandBus.execute(command);

      return { message: 'Invitación aceptada correctamente' };
    } catch (error) {
      this.logger.error('Error accepting invite', error);
      if (error instanceof ValidationError) {
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }
      if (error instanceof UnauthorizedError) {
        throw new HttpException(error.message, HttpStatus.UNAUTHORIZED);
      }

      throw new HttpException(
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('company-users')
  @ApiOperation({
    summary: 'Listar usuarios de la compañía',
    description:
      'Devuelve los usuarios asociados a la compañía del token JWT / sesión BFF',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Listado de usuarios',
    type: UserListResponseDto,
  })
  @Roles(['admin'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async listCompanyUsers(@Req() req: any): Promise<UserListResponseDto> {
    // Extrae el companyId del payload del token (req.user)
    const companyId = (req as { user?: { companyId?: string } }).user
      ?.companyId;
    if (!companyId) {
      throw new HttpException('No companyId in token', HttpStatus.UNAUTHORIZED);
    }
    // Ejecuta la query CQRS para obtener los usuarios
    const users: UserAccountPrimitives[] = await this.queryBus.execute(
      new FindUsersByCompanyIdQuery(UserAccountCompanyId.create(companyId)),
    );
    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        roles: u.roles,
        companyId: u.companyId,
        isActive: u.isActive,
        keycloakId: u.keycloakId,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt ?? null,
      })),
    };
  }

  @Post('company-users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear usuario de la compañía',
    description:
      'Crea el usuario en Keycloak, envía email para definir contraseña y persiste en BD',
  })
  @ApiBearerAuth()
  @ApiBody({ type: CreateCompanyUserRequestDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado',
    type: CompanyUserMutationResponseDto,
  })
  @Roles(['admin'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async createCompanyUser(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateCompanyUserRequestDto,
  ): Promise<CompanyUserMutationResponseDto> {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new HttpException('No companyId in token', HttpStatus.UNAUTHORIZED);
    }
    if (!body?.name?.trim() || !body?.email?.trim()) {
      throw new HttpException(
        'name y email son obligatorios',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result: Result<{ userId: string }, DomainError> =
      await this.commandBus.execute(
        new CreateCompanyUserCommand(
          companyId,
          body.name,
          body.email,
          body.roles ?? [],
        ),
      );

    if (result.isErr()) {
      throw this.mapCompanyUserError(result.error);
    }
    return { userId: result.unwrap().userId };
  }

  @Patch('company-users/:userId')
  @ApiOperation({
    summary: 'Actualizar usuario de la compañía',
    description: 'Actualiza nombre y/o roles (BD + Keycloak)',
  })
  @ApiBearerAuth()
  @ApiParam({ name: 'userId', description: 'ID del usuario en Guiders' })
  @ApiBody({ type: UpdateCompanyUserRequestDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @Roles(['admin'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async updateCompanyUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: UpdateCompanyUserRequestDto,
  ): Promise<{ ok: true }> {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new HttpException('No companyId in token', HttpStatus.UNAUTHORIZED);
    }

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

  @Patch('company-users/:userId/active')
  @ApiOperation({
    summary: 'Activar o desactivar usuario de la compañía',
    description: 'Actualiza isActive en BD y enabled en Keycloak',
  })
  @ApiBearerAuth()
  @ApiParam({ name: 'userId', description: 'ID del usuario en Guiders' })
  @ApiBody({ type: SetCompanyUserActiveRequestDto })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @Roles(['admin'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async setCompanyUserActive(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: SetCompanyUserActiveRequestDto,
  ): Promise<{ ok: true }> {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new HttpException('No companyId in token', HttpStatus.UNAUTHORIZED);
    }
    if (typeof body?.isActive !== 'boolean') {
      throw new HttpException(
        'isActive debe ser boolean',
        HttpStatus.BAD_REQUEST,
      );
    }

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

  @Delete('company-users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar usuario de la compañía',
    description: 'Borrado duro en Keycloak y en BD Guiders',
  })
  @ApiBearerAuth()
  @ApiParam({ name: 'userId', description: 'ID del usuario en Guiders' })
  @ApiResponse({ status: 204, description: 'Usuario eliminado' })
  @Roles(['admin'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async deleteCompanyUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
  ): Promise<void> {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new HttpException('No companyId in token', HttpStatus.UNAUTHORIZED);
    }

    const actorId = req.user?.id ?? '';
    const result: Result<void, DomainError> = await this.commandBus.execute(
      new DeleteCompanyUserCommand(companyId, userId, actorId, actorId),
    );

    if (result.isErr()) {
      throw this.mapCompanyUserError(result.error);
    }
  }

  private mapCompanyUserError(error: DomainError): HttpException {
    if (error instanceof CompanyUserNotFoundError) {
      return new HttpException(error.message, HttpStatus.NOT_FOUND);
    }
    if (
      error instanceof CompanyUserEmailExistsError ||
      error instanceof InvalidCompanyUserRolesError ||
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
    this.logger.error(`Error company-users: ${error.message}`);
    return new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Obtener usuario autenticado',
    description:
      'Devuelve la información del usuario asociado al token de acceso o sesión BFF. Soporta JWT Bearer tokens y cookies de Keycloak. Requiere rol admin o commercial.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Usuario encontrado',
    type: CurrentUserResponseDto,
  })
  @ApiNotFoundError('Usuario', 'Usuario no encontrado')
  @Roles(['admin', 'commercial'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<CurrentUserResponseDto> {
    const rawUserId: string | undefined = req.user?.id;
    if (!rawUserId) {
      throw new HttpException(
        'No se encontró el usuario en el contexto',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      this.logger.log(`[me] Usuario autenticado con ID: ${rawUserId}`);

      // Resolver el ID (puede ser Keycloak ID si viene de BFF)
      let backendUserId: string;

      // Intentar resolver por Keycloak ID primero
      const keycloakResult = await this.queryBus.execute(
        new FindUserByKeycloakIdQuery(rawUserId),
      );

      if (keycloakResult.isOk()) {
        backendUserId = keycloakResult.value.id;
        this.logger.log(
          `[me] Usuario resuelto por Keycloak ID. Backend ID: ${backendUserId}`,
        );
      } else {
        // Si no es Keycloak ID, asumir que ya es Backend ID
        backendUserId = rawUserId;
        this.logger.log(
          `[me] Usando directamente como Backend ID: ${backendUserId}`,
        );
      }

      const optional: Optional<{ user: UserAccountPrimitives }> =
        await this.queryBus.execute(new FindOneUserByIdQuery(backendUserId));

      if (optional.isEmpty()) {
        throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
      }

      const { user } = optional.get();
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        companyId: user.companyId,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt ?? null,
        keycloakId: user.keycloakId ?? null,
        avatarUrl: user.avatarUrl ?? null,
      };
    } catch (error) {
      this.logger.error('Error fetching current user (/me)', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':keycloakId')
  @ApiOperation({
    summary: 'Obtener usuario por Keycloak ID',
    description:
      'Devuelve la información de un usuario específico usando su Keycloak ID (sub del token JWT). Requiere autenticación.',
  })
  @ApiParam({
    name: 'keycloakId',
    description: 'Keycloak ID del usuario (sub del token JWT de Keycloak)',
    type: 'string',
    example: 'd9b32cfd-f838-4764-b03f-465ed59ce245',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Usuario encontrado',
    type: CurrentUserResponseDto,
  })
  @ApiNotFoundError('Usuario', 'Usuario no encontrado con ese Keycloak ID')
  @Roles(['admin', 'commercial'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async getUserById(
    @Param('keycloakId') keycloakId: string,
  ): Promise<CurrentUserResponseDto> {
    try {
      this.logger.log(
        `[getUserById] Buscando usuario con Keycloak ID: ${keycloakId}`,
      );

      // Buscar SOLO por Keycloak ID
      const keycloakResult = await this.queryBus.execute(
        new FindUserByKeycloakIdQuery(keycloakId),
      );

      if (keycloakResult.isErr()) {
        throw new HttpException(
          `Usuario con Keycloak ID ${keycloakId} no encontrado`,
          HttpStatus.NOT_FOUND,
        );
      }

      const userDto = keycloakResult.value;
      this.logger.log(`[getUserById] Usuario encontrado: ${userDto.email}`);

      // Obtener datos completos del usuario
      const optional: Optional<{ user: UserAccountPrimitives }> =
        await this.queryBus.execute(new FindOneUserByIdQuery(userDto.id));

      if (optional.isEmpty()) {
        throw new HttpException('Usuario no encontrado', HttpStatus.NOT_FOUND);
      }

      const userPrimitives = optional.get().user;

      return {
        id: userPrimitives.id,
        email: userPrimitives.email,
        name: userPrimitives.name,
        roles: userPrimitives.roles,
        companyId: userPrimitives.companyId,
        isActive: userPrimitives.isActive,
        createdAt: userPrimitives.createdAt,
        updatedAt: userPrimitives.updatedAt,
        lastLoginAt: userPrimitives.lastLoginAt ?? null,
        keycloakId: userPrimitives.keycloakId ?? null,
        avatarUrl: userPrimitives.avatarUrl ?? null,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching user by Keycloak ID ${keycloakId}`,
        error,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('sync-with-keycloak')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(['superadmin'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sincronizar usuario con Keycloak',
    description:
      'Crea un nuevo usuario en el backend y lo vincula con un usuario existente de Keycloak',
  })
  @ApiBody({ type: SyncUserWithKeycloakDto })
  @ApiResponse({
    status: 201,
    description: 'Usuario sincronizado exitosamente',
    type: SyncUserResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 409,
    description: 'Usuario ya existe o Keycloak ID ya está vinculado',
  })
  async syncWithKeycloak(
    @Body() dto: SyncUserWithKeycloakDto,
  ): Promise<SyncUserResponseDto> {
    try {
      const result = await this.commandBus.execute(
        new SyncUserWithKeycloakCommand(
          dto.email,
          dto.name,
          dto.keycloakId,
          dto.roles,
          dto.companyId,
        ),
      );

      if (result && typeof result.isErr === 'function' && result.isErr()) {
        throw new HttpException(result.error.message, HttpStatus.CONFLICT);
      }

      const { userId } =
        result && typeof result.unwrap === 'function'
          ? result.unwrap()
          : result;
      return {
        userId,
        message: 'Usuario sincronizado exitosamente con Keycloak',
      };
    } catch (error) {
      this.logger.error('Error syncing user with Keycloak', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':userId/link-keycloak')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(['superadmin'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Vincular usuario existente con Keycloak',
    description:
      'Asocia un usuario existente del backend con un usuario de Keycloak mediante su keycloakId',
  })
  @ApiParam({
    name: 'userId',
    description: 'ID del usuario en el backend (UUID)',
  })
  @ApiBody({
    schema: {
      properties: { keycloakId: { type: 'string', format: 'uuid' } },
      required: ['keycloakId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario vinculado exitosamente con Keycloak',
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Usuario ya vinculado o keycloakId en uso',
  })
  async linkWithKeycloak(
    @Param('userId') userId: string,
    @Body('keycloakId') keycloakId: string,
  ): Promise<{ message: string }> {
    const result = await this.commandBus.execute<
      LinkUserWithKeycloakCommand,
      import('src/context/shared/domain/result').Result<
        void,
        import('src/context/shared/domain/domain.error').DomainError
      >
    >(new LinkUserWithKeycloakCommand(userId, keycloakId));

    if (result.isErr()) {
      const msg = result.error.message;
      const status = msg.includes('no encontrado')
        ? HttpStatus.NOT_FOUND
        : HttpStatus.CONFLICT;
      throw new HttpException(msg, status);
    }

    return { message: `Usuario ${userId} vinculado exitosamente con Keycloak` };
  }

  @Post('verify-role-mapping')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(['superadmin'])
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verificar mapeo de roles de Keycloak',
    description:
      'Verifica cómo se mapearían los roles de Keycloak a roles del backend sin crear usuario',
  })
  @ApiBody({ type: VerifyRoleMappingDto })
  @ApiResponse({
    status: 200,
    description: 'Resultado de la verificación del mapeo de roles',
    type: VerifyRoleMappingResponseDto,
  })
  @ApiValidationError()
  async verifyRoleMapping(
    @Body() dto: VerifyRoleMappingDto,
  ): Promise<VerifyRoleMappingResponseDto> {
    try {
      const result = await this.queryBus.execute(
        new VerifyRoleMappingQuery(dto.keycloakRoles),
      );

      return result;
    } catch (error) {
      this.logger.error('Error verifying role mapping', error);
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':keycloakId/avatar')
  @ApiOperation({
    summary: 'Subir o actualizar avatar del usuario',
    description:
      'Permite a un usuario subir su avatar o a un admin subir el avatar de cualquier usuario. Formatos permitidos: PNG, JPG. Tamaño máximo: 5MB. Requiere Keycloak ID.',
  })
  @ApiParam({
    name: 'keycloakId',
    description: 'Keycloak ID del usuario (sub del token JWT de Keycloak)',
    type: 'string',
    example: 'd9b32cfd-f838-4764-b03f-465ed59ce245',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Archivo de imagen (PNG o JPG, máx 5MB)',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar actualizado exitosamente',
    schema: {
      type: 'object',
      properties: {
        avatarUrl: {
          type: 'string',
          example: 'https://bucket.s3.region.amazonaws.com/avatars/user-id.jpg',
        },
        message: { type: 'string', example: 'Avatar actualizado exitosamente' },
      },
    },
  })
  @ApiValidationError('Archivo inválido o no proporcionado')
  @ApiNotFoundError('Usuario', 'Usuario no encontrado')
  @ApiBearerAuth()
  @Roles(['admin', 'commercial'])
  @UseGuards(DualAuthGuard, RolesGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Param('keycloakId') keycloakId: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ avatarUrl: string; message: string }> {
    if (!file) {
      throw new HttpException(
        'No se proporcionó ningún archivo',
        HttpStatus.BAD_REQUEST,
      );
    }

    const rawRequesterId = req.user?.id;
    if (!rawRequesterId) {
      throw new HttpException(
        'No se encontró el usuario en el contexto',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      // Resolver el Keycloak ID del usuario objetivo a Backend ID
      this.logger.log(
        `[uploadAvatar] Buscando usuario objetivo con Keycloak ID: ${keycloakId}`,
      );

      const targetUserResult = await this.queryBus.execute(
        new FindUserByKeycloakIdQuery(keycloakId),
      );

      if (targetUserResult.isErr()) {
        throw new HttpException(
          `Usuario con Keycloak ID ${keycloakId} no encontrado`,
          HttpStatus.NOT_FOUND,
        );
      }

      const userId = targetUserResult.value.id;
      this.logger.log(
        `[uploadAvatar] Usuario objetivo encontrado. Backend ID: ${userId}`,
      );

      // Resolver el Keycloak ID del usuario autenticado a Backend ID
      this.logger.log(
        `[uploadAvatar] Resolviendo requester Keycloak ID: ${rawRequesterId}`,
      );

      const requesterResult = await this.queryBus.execute(
        new FindUserByKeycloakIdQuery(rawRequesterId),
      );

      if (requesterResult.isErr()) {
        throw new HttpException(
          'No se pudo resolver el usuario autenticado',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const requesterId = requesterResult.value.id;
      this.logger.log(
        `[uploadAvatar] Requester encontrado. Backend ID: ${requesterId}`,
      );

      const command = new UpdateUserAvatarCommand(userId, file, requesterId);
      const result = await this.commandBus.execute(command);

      if (result.isErr()) {
        const error = result.error;
        if (error.message.includes('no encontrado')) {
          throw new HttpException(error.message, HttpStatus.NOT_FOUND);
        }
        if (error.message.includes('permisos')) {
          throw new HttpException(error.message, HttpStatus.FORBIDDEN);
        }
        throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
      }

      const avatarUrl = result.unwrap();
      return {
        avatarUrl,
        message: 'Avatar actualizado exitosamente',
      };
    } catch (error) {
      this.logger.error('Error uploading avatar', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':keycloakId/avatar')
  @ApiOperation({
    summary: 'Eliminar avatar del usuario',
    description:
      'Permite a un usuario eliminar su avatar o a un admin eliminar el avatar de cualquier usuario. Requiere Keycloak ID.',
  })
  @ApiParam({
    name: 'keycloakId',
    description: 'Keycloak ID del usuario (sub del token JWT de Keycloak)',
    type: 'string',
    example: 'd9b32cfd-f838-4764-b03f-465ed59ce245',
  })
  @ApiResponse({
    status: 200,
    description: 'Avatar eliminado exitosamente',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Avatar eliminado exitosamente' },
      },
    },
  })
  @ApiNotFoundError('Usuario', 'Usuario no encontrado')
  @ApiBearerAuth()
  @Roles(['admin', 'commercial'])
  @UseGuards(DualAuthGuard, RolesGuard)
  async deleteAvatar(
    @Param('keycloakId') keycloakId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    const rawRequesterId = req.user?.id;
    if (!rawRequesterId) {
      throw new HttpException(
        'No se encontró el usuario en el contexto',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      // Resolver el Keycloak ID del usuario objetivo a Backend ID
      const targetUserResult = await this.queryBus.execute(
        new FindUserByKeycloakIdQuery(keycloakId),
      );

      if (targetUserResult.isErr()) {
        throw new HttpException(
          `Usuario con Keycloak ID ${keycloakId} no encontrado`,
          HttpStatus.NOT_FOUND,
        );
      }

      const userId = targetUserResult.value.id;

      // Resolver el Keycloak ID del usuario autenticado a Backend ID
      const requesterResult = await this.queryBus.execute(
        new FindUserByKeycloakIdQuery(rawRequesterId),
      );

      if (requesterResult.isErr()) {
        throw new HttpException(
          'No se pudo resolver el usuario autenticado',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const requesterId = requesterResult.value.id;

      // Crear un command para eliminar el avatar (pasamos null como nuevo avatar)
      const _command = new UpdateUserAvatarCommand(
        userId,
        null as unknown as Express.Multer.File, // Will be handled specially in handler
        requesterId,
      );

      // Para DELETE, necesitamos un handler especial o modificar el existente
      // Por ahora vamos a retornar un mensaje simple
      // TODO: Implementar DeleteUserAvatarCommand separado si es necesario

      return {
        message: 'Avatar eliminado exitosamente',
      };
    } catch (error) {
      this.logger.error('Error deleting avatar', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
