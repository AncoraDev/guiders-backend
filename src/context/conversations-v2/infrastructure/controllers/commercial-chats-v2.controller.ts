import {
  Controller,
  Get,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
  UseGuards,
  Req,
  Header,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { AuthenticatedRequest } from 'src/context/shared/infrastructure/guards/auth.guard';
import { OptionalAuthGuard } from 'src/context/shared/infrastructure/guards/optional-auth.guard';
import { RequiredRoles } from 'src/context/shared/infrastructure/guards/role.guard';

import { ChatListResponseDto } from '../../application/dtos/chat-response.dto';
import { GetChatsQueryDto } from '../../application/dtos/chat-query.dto';
import { GetChatsWithFiltersQuery } from '../../application/queries/get-chats-with-filters.query';
import {
  ApiAuthErrors,
  ApiInternalServerError,
} from 'src/context/shared/infrastructure/swagger';

/**
 * Controller que expone los chats indexados por comercial.
 * Se separa de ChatV2Controller para evitar ambigüedad de paths con
 * `/v2/chats/:chatId/...` (regla `no-ambiguous-paths` de OpenAPI).
 */
@ApiTags('Chats V2')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
@ApiAuthErrors()
@ApiInternalServerError()
@Controller('v2/commercials')
export class CommercialChatsV2Controller {
  private readonly logger = new Logger(CommercialChatsV2Controller.name);

  constructor(private readonly queryBus: QueryBus) {}

  /**
   * Obtiene chats asignados a un comercial específico
   * Soporta autenticación por JWT (Bearer token) o sesión BFF (cookie)
   */
  @Get(':commercialId/chats')
  @UseGuards(OptionalAuthGuard)
  @RequiredRoles('commercial', 'admin', 'supervisor')
  @Header('Cache-Control', 'no-cache, no-store, must-revalidate')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('X-Frame-Options', 'DENY')
  @Header('X-XSS-Protection', '1; mode=block')
  @ApiBearerAuth()
  @ApiCookieAuth('session')
  @ApiHeader({
    name: 'X-Guiders-Session',
    description: 'Session ID como cabecera HTTP alternativa para BFF',
    required: false,
    example: 'sess_1758226307441_commercial',
  })
  @ApiOperation({
    summary:
      'Obtener chats de un comercial con paginación cursor (BFF + SPA compatible)',
    description:
      'Retorna los chats asignados a un comercial específico usando paginación basada en cursor. ' +
      'Soporta múltiples tipos de autenticación:\n' +
      '1. **Bearer Token (JWT)**: Para acceso directo de API\n' +
      '2. **Cookie de sesión**: Para BFF con SPA\n' +
      '3. **Header X-Guiders-Session**: Cabecera alternativa para enviar session ID\n' +
      'Requiere roles: commercial, admin o supervisor.',
  })
  @ApiParam({
    name: 'commercialId',
    description: 'ID del comercial',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiQuery({
    name: 'cursor',
    description: 'Cursor para paginación (opcional)',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'limit',
    description: 'Número máximo de chats a retornar (1-100)',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiQuery({
    name: 'filters',
    description:
      'Filtros adicionales para chats en formato JSON serializado. Ej: {"status":"OPEN"}',
    required: false,
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiQuery({
    name: 'sort',
    description:
      'Opciones de ordenamiento en formato JSON serializado. Ej: {"createdAt":"desc"}',
    required: false,
    schema: { type: 'object', additionalProperties: true },
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de chats del comercial obtenida exitosamente',
    type: ChatListResponseDto,
  })
  async getCommercialChats(
    @Param('commercialId') commercialId: string,
    @Query() queryParams: GetChatsQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ChatListResponseDto> {
    try {
      // Validar autenticación (Bearer token o cookie de sesión BFF)
      if (!req.user || !req.user.id) {
        throw new HttpException(
          'Se requiere autenticación - Bearer token o sesión de cookie',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Validar permisos según roles
      const userRoles = req.user.roles || [];
      const hasRequiredRole = userRoles.some((role) =>
        ['commercial', 'admin', 'supervisor'].includes(role),
      );

      if (!hasRequiredRole) {
        throw new HttpException(
          'Acceso denegado. Permisos insuficientes.',
          HttpStatus.FORBIDDEN,
        );
      }

      const authType = req.headers.authorization ? 'bearer' : 'session';

      this.logger.log(
        `Obteniendo chats del comercial ${commercialId} para usuario: ${req.user.id} (auth: ${authType})`,
      );

      this.logger.debug(`Query params: ${JSON.stringify(queryParams)}`);
      this.logger.debug(`User roles: ${JSON.stringify(userRoles)}`);

      // Construir filtros con assignedCommercialId
      // (filters/sort ya llegan parseados vía Transform en GetChatsQueryDto)
      const filters = {
        ...(queryParams.filters ?? {}),
        assignedCommercialId: commercialId,
      };

      const query = GetChatsWithFiltersQuery.create({
        userId: commercialId,
        userRoles: ['admin'],
        filters,
        sort: queryParams.sort,
        cursor: queryParams.cursor,
        limit: queryParams.limit || 50,
      });

      return await this.queryBus.execute(query);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Error al obtener chats del comercial ${commercialId}:`,
        error,
      );
      throw new HttpException(
        'Error interno del servidor',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
