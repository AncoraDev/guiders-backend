import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { TokenVerifyService } from '../token-verify.service';
import { AuthenticatedRequest } from './auth.guard';
import { resolveVisitorSessionId } from '../../../visitors-v2/infrastructure/http/visitor-session-cookie.util';
import { VisitorSessionAuthService } from '../services/visitor-session-auth.service';
import { BffSessionAuthService } from '../services/bff-session-auth.service';
import { FindUserByKeycloakIdQuery } from '../../../auth/auth-user/application/queries/find-user-by-keycloak-id.query';
import { UserResponseDto } from '../../../auth/auth-user/application/dtos/user-list-response.dto';
import { Result } from '../../domain/result';
import { DomainError } from '../../domain/domain.error';
import { resolveBffAuthApp } from '../bff-app-cookie';

/**
 * Guard de autenticación opcional que soporta múltiples métodos:
 * 1. JWT Bearer token (misma lógica que AuthGuard)
 * 2. Cookie de sesión de visitante V2 ('sid')
 * 3. Cookies de sesión BFF conectado con Keycloak ('console_session', 'bff_sess', etc.)
 *
 * Este guard NO falla si no hay autenticación, pero pobla request.user
 * si encuentra credenciales válidas. Es responsabilidad del endpoint
 * validar si requiere autenticación específica.
 */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
  private readonly logger = new Logger(OptionalAuthGuard.name);

  constructor(
    private readonly tokenVerifyService: TokenVerifyService,
    private readonly visitorSessionAuthService: VisitorSessionAuthService,
    private readonly bffSessionAuthService: BffSessionAuthService,
    private readonly queryBus: QueryBus,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    this.logger.debug('🔍 OptionalAuthGuard iniciado');

    try {
      // Intentar autenticación por JWT Bearer token primero
      if (await this.tryJwtAuth(request)) {
        this.logger.debug('✅ Autenticación exitosa por JWT Bearer token');
        return true;
      }

      // Intentar autenticación por cookies BFF de Keycloak
      if (await this.tryBffSessionAuth(request)) {
        this.logger.debug(
          '✅ Autenticación exitosa por sesión BFF de Keycloak',
        );
        return true;
      }

      // Intentar autenticación por cookie de sesión de visitante V2
      if (await this.tryVisitorSessionAuth(request)) {
        this.logger.debug(
          '✅ Autenticación exitosa por sesión de visitante V2',
        );
        return true;
      }

      // No hay autenticación, pero permitir continuar
      this.logger.debug('❌ Sin autenticación detectada, continuar sin user');
      return true;
    } catch (error) {
      this.logger.warn(`💥 Error en autenticación opcional: ${error}`);
      // En caso de error, continuar sin autenticación
      return true;
    }
  }

  /**
   * Intenta autenticar usando JWT Bearer token
   */
  private async tryJwtAuth(request: AuthenticatedRequest): Promise<boolean> {
    try {
      if (!request.headers.authorization) {
        return false;
      }

      const { prefix, token } = this.extractToken(
        String(request.headers.authorization),
      );

      if (prefix !== 'Bearer') {
        return false;
      }

      const { sub, typ, role, username, email, companyId } =
        await this.tokenVerifyService.verifyToken(token);

      if (typ !== 'access') {
        return false;
      }

      request.user = {
        id: sub,
        roles: role,
        username: (username as string) ?? '',
        email: (email as string) ?? '',
        companyId: (companyId as string) ?? undefined,
      };

      return true;
    } catch (error) {
      this.logger.debug(`JWT auth falló: ${error}`);
      return false;
    }
  }

  /**
   * Intenta autenticar usando cookies de sesión BFF de Keycloak
   */
  private async tryBffSessionAuth(
    request: AuthenticatedRequest,
  ): Promise<boolean> {
    try {
      const cookieHeader = request.headers.cookie as string | undefined;

      this.logger.debug(
        `BFF session auth: cookie header presente: ${cookieHeader ? 'sí' : 'no'}`,
      );

      if (!cookieHeader) {
        return false;
      }

      const preferredApp = resolveBffAuthApp(request);
      const bffTokens = this.bffSessionAuthService.extractBffSessionTokens(
        cookieHeader,
        preferredApp,
      );

      this.logger.debug(
        `BFF tokens encontrados: ${bffTokens.length} (app=${preferredApp ?? 'unknown'})`,
      );

      if (bffTokens.length === 0) {
        return false;
      }

      // Intentar validar cada token hasta que uno funcione
      for (const token of bffTokens) {
        const bffUserInfo =
          await this.bffSessionAuthService.validateBffSession(token);

        if (bffUserInfo) {
          // Intentar resolver companyId desde base de datos usando el sub (keycloakId)
          let companyId: string | undefined;

          try {
            const userResult: Result<UserResponseDto, DomainError> =
              await this.queryBus.execute(
                new FindUserByKeycloakIdQuery(bffUserInfo.sub),
              );

            if (userResult.isOk()) {
              companyId = userResult.value.companyId;
              this.logger.debug(
                `CompanyId resuelto para usuario BFF ${bffUserInfo.sub}: ${companyId}`,
              );
            } else {
              this.logger.warn(
                `No se pudo resolver companyId para usuario BFF ${bffUserInfo.sub}: ${userResult.error.message}`,
              );
            }
          } catch (error) {
            this.logger.warn(
              `Error resolviendo companyId para usuario BFF ${bffUserInfo.sub}: ${error}`,
            );
          }

          // Poblar request.user con información del BFF
          request.user = {
            id: bffUserInfo.sub,
            roles: bffUserInfo.roles,
            username: bffUserInfo.email?.split('@')[0] || 'Usuario BFF',
            email: bffUserInfo.email || '',
            companyId: companyId, // Ahora se resuelve desde la base de datos
          };

          this.logger.debug(
            `BFF auth exitosa: sub=${bffUserInfo.sub}, roles=[${bffUserInfo.roles.join(', ')}], companyId=${companyId}`,
          );

          return true;
        }
      }

      return false;
    } catch (error) {
      this.logger.debug(`BFF session auth falló: ${error}`);
      return false;
    }
  }

  /**
   * Intenta autenticar usando cookie de sesión de visitante V2
   */
  private async tryVisitorSessionAuth(
    request: AuthenticatedRequest,
  ): Promise<boolean> {
    try {
      const sessionId = resolveVisitorSessionId(request);

      this.logger.debug(
        `Visitor session ID resuelto: ${sessionId || 'no encontrado'}`,
      );

      if (!sessionId) {
        return false;
      }

      const visitorInfo =
        await this.visitorSessionAuthService.validateSession(sessionId);

      if (!visitorInfo) {
        return false;
      }

      // Poblar request.user con información del visitante
      // Usar formato compatible con AuthenticatedRequest
      request.user = {
        id: visitorInfo.visitorId,
        roles: ['visitor'],
        username: visitorInfo.username || 'Visitante',
        email: visitorInfo.email,
        companyId: visitorInfo.tenantId, // TenantId equivale a CompanyId
      };

      return true;
    } catch (error) {
      this.logger.debug(`Visitor session auth falló: ${error}`);
      return false;
    }
  }

  private extractToken(authorization: string): {
    prefix: string;
    token: string;
  } {
    const [prefix, token] = authorization.split(' ');
    return { prefix, token };
  }
}
