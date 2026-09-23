import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IntegrationApiKeyGuard,
  IntegrationApiKeyRequest,
} from '../integration-api-key.guard';
import {
  EmbedTokenGuard,
  EmbedTokenRequest,
} from '../guards/embed-token.guard';
import { CreateEmbedTokenCommandHandler } from '../../application/commands/create-embed-token.command-handler';
import { CreateEmbedTokenCommand } from '../../application/commands/create-embed-token.command';
import { RefreshEmbedTokenCommandHandler } from '../../application/commands/refresh-embed-token.command-handler';
import { RefreshEmbedTokenCommand } from '../../application/commands/refresh-embed-token.command';
import { FindEmbedTokenAuditLogQuery } from '../../application/queries/find-embed-token-audit-log.query';
import { extractAuditContext } from 'src/context/shared/utils/audit-context';
import {
  CreateEmbedTokenDto,
  CreateEmbedTokenResponseDto,
  EmbedTokenForbiddenResponseDto,
} from '../../application/dtos/create-embed-token.dto';
import {
  RefreshEmbedTokenDto,
  RefreshEmbedTokenResponseDto,
} from '../../application/dtos/refresh-embed-token.dto';
import { QueryEmbedTokenAuditLogDto } from '../../application/dtos/query-embed-token-audit-log.dto';
import { EmbedTokenAuditLogListResponseDto } from '../../application/dtos/embed-token-audit-log-response.dto';
import {
  EmbedTokenForbiddenError,
  EmbedTokenExpiredError,
  EmbedTokenInvalidError,
  EmbedTokenUserMismatchError,
} from '../../domain/errors/embed-token.errors';
import { MongoEmbedAuditLogPersistenceError } from '../persistence/mongo-embed-token-audit-log.repository.impl';

@ApiTags('Integration Embed')
@Controller('v2/integration/embed')
@ApiBearerAuth()
@ApiCookieAuth('access_token')
export class EmbedController {
  private readonly logger = new Logger(EmbedController.name);

  constructor(
    private readonly createEmbedTokenHandler: CreateEmbedTokenCommandHandler,
    private readonly refreshEmbedTokenHandler: RefreshEmbedTokenCommandHandler,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IntegrationApiKeyGuard)
  @ApiOperation({
    summary: 'Solicitar embed token para un usuario',
    description:
      'Autentica al integrador mediante `x-api-key` y emite un embed token opaco (256-bit base64url) con TTL 8h. ' +
      'El integrador envía este token al iframe de Guiders para autenticar al usuario final.',
  })
  @ApiResponse({
    status: 200,
    description: 'Embed token emitido',
    type: CreateEmbedTokenResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'DTO inválido (userId/companyId no son UUID)',
  })
  @ApiResponse({
    status: 401,
    description: 'API key de integración inválida o revocada',
  })
  @ApiResponse({
    status: 403,
    description:
      'Embed deshabilitado para la empresa, usuario no pertenece, o tenant mismatch',
    type: EmbedTokenForbiddenResponseDto,
  })
  @ApiResponse({
    status: 503,
    description:
      'Servicio de tokens o white-label config no disponible (Mongo/Redis caído)',
  })
  async start(
    @Body() dto: CreateEmbedTokenDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<CreateEmbedTokenResponseDto> {
    // Tenant mismatch check: API key companyId === body companyId
    if (req.integrationApiKey.companyId !== dto.companyId) {
      throw new ForbiddenException({
        code: 'EMBED_TENANT_MISMATCH',
        message: 'El companyId del body no coincide con el de la API Key',
        statusCode: 403,
      });
    }

    // Story 2.2 + AI-4: extract audit context via shared helper (DRY)
    const { origin, ipAddress, userAgent } = extractAuditContext(req);

    const result = await this.createEmbedTokenHandler.execute(
      new CreateEmbedTokenCommand(
        dto.userId,
        dto.companyId,
        origin,
        ipAddress,
        userAgent,
        '/v2/integration/embed/start',
      ),
    );

    if (result.isErr()) {
      const errValue = result.error;
      if (errValue instanceof EmbedTokenForbiddenError) {
        throw new ForbiddenException({
          code: errValue.code,
          message: errValue.message,
          statusCode: 403,
        });
      }
      // Unknown error (Redis down, etc.) — 503
      throw new ServiceUnavailableException({
        code: 'EMBED_SERVICE_UNAVAILABLE',
        message: 'Servicio de tokens temporalmente no disponible, reintentar',
        statusCode: 503,
      });
    }

    const issued = result.unwrap();
    return {
      token: issued.token,
      expiresAt: issued.expiresAt,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EmbedTokenGuard)
  @ApiOperation({
    summary: 'Refrescar embed token antes de expirar',
    description:
      'El iframe llama este endpoint con `Authorization: Bearer <token>` antes de que el token expire (8h) para extender la sesión. ' +
      'El token viejo se elimina atómicamente (Lua script) y se emite uno nuevo. ' +
      'Si el body incluye `userId` y difiere del token → 403.',
  })
  @ApiResponse({
    status: 200,
    description: 'Embed token refrescado',
    type: RefreshEmbedTokenResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'DTO inválido (userId no es UUID si se proporciona)',
  })
  @ApiResponse({
    status: 401,
    description:
      'Token expirado, revocado, o con formato/contenido inválido. Códigos: EMBED_TOKEN_MISSING (header ausente), EMBED_TOKEN_INVALID (formato o contenido), EMBED_TOKEN_EXPIRED (no existe en Redis o tenant desactivó embed)',
  })
  @ApiResponse({
    status: 403,
    description:
      'UserId del body no coincide con el del token (código EMBED_TOKEN_USER_MISMATCH)',
  })
  @ApiResponse({
    status: 503,
    description:
      'Servicio de tokens o white-label config no disponible (Mongo/Redis caído)',
  })
  async refresh(
    @Body() dto: RefreshEmbedTokenDto,
    @Req() req: EmbedTokenRequest,
  ): Promise<RefreshEmbedTokenResponseDto> {
    // Story 2.2 + AI-4: extract audit context via shared helper (DRY)
    const { origin, ipAddress, userAgent } = extractAuditContext(req);

    const result = await this.refreshEmbedTokenHandler.execute(
      new RefreshEmbedTokenCommand(
        req.embedToken as string,
        dto.userId,
        // apiKeyCompanyId solo presente si el IntegrationApiKeyGuard corrió antes
        (
          req as unknown as { integrationApiKey?: { companyId: string } }
        ).integrationApiKey?.companyId,
        origin,
        ipAddress,
        userAgent,
      ),
    );

    if (result.isErr()) {
      const errValue = result.error;
      if (errValue instanceof EmbedTokenExpiredError) {
        throw new UnauthorizedException({
          code: errValue.code,
          message: errValue.message,
          statusCode: 401,
        });
      }
      if (errValue instanceof EmbedTokenInvalidError) {
        throw new UnauthorizedException({
          code: errValue.code,
          message: errValue.message,
          statusCode: 401,
        });
      }
      if (errValue instanceof EmbedTokenUserMismatchError) {
        throw new ForbiddenException({
          code: errValue.code,
          message: errValue.message,
          statusCode: 403,
        });
      }
      // Mongo/Redis down (EmbedTokenError genérico) → 503
      throw new ServiceUnavailableException({
        code: 'EMBED_SERVICE_UNAVAILABLE',
        message: 'Servicio de tokens temporalmente no disponible, reintentar',
        statusCode: 503,
      });
    }

    const issued = result.unwrap();
    return {
      token: issued.token,
      expiresAt: issued.expiresAt,
    };
  }

  @Get('audit-log')
  @HttpCode(HttpStatus.OK)
  @UseGuards(IntegrationApiKeyGuard)
  @ApiOperation({
    summary: 'Consultar audit log de eventos de autenticación de embed',
    description:
      'Lista los eventos de éxito/fallo de autenticación de embed ' +
      '(POST /start, /refresh, /embed/authenticate-session) para un tenant. ' +
      'Soporta paginación y filtros. Server-to-server only (no iframe).',
  })
  @ApiResponse({
    status: 200,
    description: 'Eventos de audit log',
    type: EmbedTokenAuditLogListResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Query params inválidos (limit fuera de rango, etc.)',
  })
  @ApiResponse({
    status: 401,
    description: 'API key de integración inválida o revocada',
  })
  @ApiResponse({
    status: 403,
    description: 'companyId del query no coincide con el de la API Key',
  })
  @ApiResponse({
    status: 503,
    description: 'Mongo no disponible (código EMBED_SERVICE_UNAVAILABLE)',
  })
  async getAuditLog(
    @Query() query: QueryEmbedTokenAuditLogDto,
    @Req() req: IntegrationApiKeyRequest,
  ): Promise<EmbedTokenAuditLogListResponseDto> {
    // Story 2.2 AC6: defense-in-depth multi-tenant — el companyId
    // del query DEBE coincidir con el de la API Key. Si no, 403
    // (prevención de cross-tenant queries, incluso dentro del mismo tenant).
    if (req.integrationApiKey.companyId !== query.companyId) {
      throw new ForbiddenException({
        code: 'EMBED_TENANT_MISMATCH',
        message: 'El companyId del query no coincide con el de la API Key',
        statusCode: 403,
      });
    }

    const result = await this.queryBus.execute(
      FindEmbedTokenAuditLogQuery.fromDto(query),
    );

    if (result.isErr()) {
      const errValue = result.error;
      if (errValue instanceof MongoEmbedAuditLogPersistenceError) {
        // Mongo down → 503 (recoverable, no es bug del cliente)
        throw new ServiceUnavailableException({
          code: 'EMBED_SERVICE_UNAVAILABLE',
          message: 'Servicio de audit log no disponible, reintentar',
          statusCode: 503,
        });
      }
      // Unknown error
      throw new ServiceUnavailableException({
        code: 'EMBED_SERVICE_UNAVAILABLE',
        message: 'Error inesperado en audit log',
        statusCode: 503,
      });
    }

    return result.unwrap();
  }
}
