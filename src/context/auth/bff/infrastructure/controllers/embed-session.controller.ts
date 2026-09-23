/**
 * Controller para POST /embed/authenticate-session (Story 2.1).
 *
 * El iframe llama este endpoint tras recibir el embed token para
 * obtener una cookie de sesión. La cookie es HttpOnly, Secure,
 * SameSite=Lax y se llama `access_token` para reusar el
 * `JwtCookieStrategy` extractor (`auth-user/infrastructure/
 * strategies/jwt-cookie.strategy.ts:38`).
 *
 * Diferencia con `bff-auth.controller.ts` (BFF OIDC): este controller
 *  - NO usa `IntegrationApiKeyGuard` (no es server-to-server)
 *  - NO llama a Keycloak ni genera JWT
 *  - Usa `EmbedTokenGuard` (bearer token) + Redis session opaca
 *
 * Limitación conocida: el `JwtCookieStrategy` intentará verificar
 * el session ID opaco como JWT contra Keycloak JWKS y devolverá
 * 401. Story 2.6 (fuera de este epic) hará que la strategy acepte
 * tanto JWT como session ID opaco. Por ahora, la cookie se setea
 * correctamente pero NO se puede usar contra endpoints protegidos
 * por `JwtCookieAuthGuard` hasta que 2.6 ship.
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PublicEndpoint } from 'src/context/shared/infrastructure/swagger/public-endpoint.decorator';
import {
  EmbedTokenGuard,
  EmbedTokenRequest,
} from 'src/context/auth/integration-api-key/infrastructure/guards/embed-token.guard';
import { AuthenticateEmbedSessionCommandHandler } from '../../application/commands/authenticate-embed-session.command-handler';
import { AuthenticateEmbedSessionCommand } from '../../application/commands/authenticate-embed-session.command';
import {
  AuthenticateEmbedSessionDto,
  EmbedAuthenticateSessionResponseDto,
} from '../../application/dtos/authenticate-embed-session.dto';
import { readCookieEnv } from '../cookie-helper';
import { extractAuditContext } from 'src/context/shared/utils/audit-context';
import {
  EmbedTokenNotFoundError,
  EmbedTokenInvalidFormatError,
  EmbedTokenError,
  EmbedTokenCorruptedError,
} from 'src/context/auth/integration-api-key/domain/errors/embed-token.errors';
import {
  BffSessionError,
  EmbedBodyTokenMismatchError,
} from '../../domain/errors/bff-session.errors';

@ApiTags('BFF Embed')
@Controller('embed')
export class EmbedSessionController {
  private readonly logger = new Logger(EmbedSessionController.name);

  constructor(
    private readonly authenticateHandler: AuthenticateEmbedSessionCommandHandler,
  ) {}

  @Post('authenticate-session')
  @HttpCode(HttpStatus.OK)
  @UseGuards(EmbedTokenGuard)
  // F5 (code review Story 2.1): @PublicEndpoint() para que la operación
  // OpenAPI tenga `security: [{}]` (la auth es via EmbedTokenGuard, no JWT,
  // y Swagger no conoce el guard custom). Sin este decorador falla la
  // regla Redocly `security-defined` en CI.
  @PublicEndpoint()
  @ApiOperation({
    summary: 'Establecer sesión BFF a partir de un embed token',
    description:
      'El iframe llama este endpoint tras recibir el token para obtener ' +
      'una cookie de sesión. La cookie es HttpOnly, Secure, SameSite=Lax y se ' +
      'llama `access_token` para reusar el `JwtCookieStrategy` extractor.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sesión BFF establecida',
    type: EmbedAuthenticateSessionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'DTO inválido (userId/companyId no son UUID v4)',
  })
  @ApiResponse({
    status: 401,
    description:
      'Token expirado, revocado, o con formato/contenido inválido. ' +
      'Códigos: EMBED_TOKEN_MISSING (header ausente), EMBED_TOKEN_INVALID ' +
      '(formato o contenido), EMBED_TOKEN_EXPIRED (no existe en Redis)',
  })
  @ApiResponse({
    status: 403,
    description:
      'UserId o companyId del body no coincide con el del token ' +
      '(código EMBED_BODY_TOKEN_MISMATCH)',
  })
  @ApiResponse({
    status: 503,
    description:
      'Servicio de tokens o sesiones no disponible (Mongo/Redis caído). ' +
      'Código: EMBED_SERVICE_UNAVAILABLE',
  })
  async authenticate(
    @Body() dto: AuthenticateEmbedSessionDto,
    @Req() req: EmbedTokenRequest,
    @Res() res: Response,
  ): Promise<void> {
    // Story 2.2 + AI-4: extract audit context via shared helper (DRY)
    const { origin, ipAddress, userAgent } = extractAuditContext(req);

    const result = await this.authenticateHandler.execute(
      new AuthenticateEmbedSessionCommand(
        req.embedToken as string,
        dto.userId,
        dto.companyId,
        origin,
        ipAddress,
        userAgent,
      ),
    );

    if (result.isErr()) {
      const errValue = result.error;
      this.handleError(errValue, res);
      return;
    }

    const { sessionId, expiresAt } = result.unwrap();
    const cenv = readCookieEnv('admin'); // Las sesiones embed son para la app admin

    // Setea cookie `access_token` con el sessionId opaco.
    // El nombre DEBE ser `access_token` (no `embed_session`) para que
    // `JwtCookieStrategy` lo extraiga (`auth-user/.../jwt-cookie.strategy.ts:38`).
    const sessionCookieOptions = {
      httpOnly: true,
      secure: cenv.secure,
      sameSite: cenv.sameSite,
      domain: cenv.domain,
      path: cenv.path,
      maxAge: 28800 * 1000, // 8h, mirror del TTL de Redis
    };

    res.cookie('access_token', sessionId, sessionCookieOptions);

    const responseBody: EmbedAuthenticateSessionResponseDto = {
      sessionEstablished: true,
      expiresAt,
    };
    res.status(200).json(responseBody);
  }

  private handleError(error: unknown, res: Response): void {
    if (error instanceof EmbedTokenNotFoundError) {
      res.status(401).json({
        code: 'EMBED_TOKEN_EXPIRED',
        message: error.message,
        statusCode: 401,
      });
      return;
    }
    if (
      error instanceof EmbedTokenInvalidFormatError ||
      error instanceof EmbedTokenCorruptedError
    ) {
      res.status(401).json({
        code: 'EMBED_TOKEN_INVALID',
        message: error.message,
        statusCode: 401,
      });
      return;
    }
    if (error instanceof EmbedBodyTokenMismatchError) {
      res.status(403).json({
        code: error.code,
        message: error.message,
        statusCode: 403,
      });
      return;
    }
    if (error instanceof BffSessionError) {
      res.status(503).json({
        code: 'EMBED_SERVICE_UNAVAILABLE',
        message: 'Servicio de sesiones temporalmente no disponible, reintentar',
        statusCode: 503,
      });
      return;
    }
    if (error instanceof EmbedTokenError) {
      res.status(503).json({
        code: 'EMBED_SERVICE_UNAVAILABLE',
        message: 'Servicio de tokens temporalmente no disponible, reintentar',
        statusCode: 503,
      });
      return;
    }
    // Unknown error
    this.logger.error('Error inesperado en /embed/authenticate-session', error);
    res.status(503).json({
      code: 'EMBED_SERVICE_UNAVAILABLE',
      message: 'Servicio temporalmente no disponible, reintentar',
      statusCode: 503,
    });
  }
}
