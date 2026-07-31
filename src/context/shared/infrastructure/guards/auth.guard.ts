import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TokenVerifyService } from '../token-verify.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { FindUserByKeycloakIdQuery } from 'src/context/auth/auth-user/application/queries/find-user-by-keycloak-id.query';
import { UserResponseDto } from 'src/context/auth/auth-user/application/dtos/user-list-response.dto';
import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { QueryBus } from '@nestjs/cqrs';
import {
  getBffSessionCookieNames,
  resolveBffAuthApp,
} from '../bff-app-cookie';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    roles: string[];
    username: string;
    email?: string;
    companyId?: string; // Añadimos companyId al tipado del usuario autenticado
  };
  // Aseguramos que headers esté correctamente tipado
  headers: Record<string, any>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly service: TokenVerifyService,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Si el endpoint está marcado con @Public(), saltar autenticación
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    try {
      const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

      // Extraer token: primero del header Authorization, luego de la cookie BFF
      const token = this.extractTokenFromRequest(request);
      if (!token) {
        throw new UnauthorizedException('No se encontró el token');
      }

      try {
        const payload = await this.service.verifyToken(token);
        const { sub, typ, role, username, email, companyId } = payload;

        // typ="access" para tokens internos; typ="Bearer" para tokens Keycloak BFF
        if (typ !== 'access' && typ !== 'Bearer') {
          throw new UnauthorizedException('Token inválido');
        }

        // Para tokens Keycloak (BFF), sub = keycloakId → buscar usuario en BD para obtener id interno y companyId
        if (typ === 'Bearer') {
          const queryBus = this.moduleRef.get(QueryBus, { strict: false });
          const userResult: Result<UserResponseDto, DomainError> =
            await queryBus.execute(new FindUserByKeycloakIdQuery(sub));

          if (userResult.isErr()) {
            throw new UnauthorizedException(
              `Usuario no encontrado: ${userResult.error.message}`,
            );
          }

          const user = userResult.unwrap();
          request.user = {
            id: user.id,
            roles: user.roles,
            username: user.name,
            email: user.email,
            companyId: user.companyId ?? undefined,
          };
        } else {
          request.user = {
            id: sub,
            roles: role,
            username: (username as string) ?? '',
            email: (email as string) ?? '',
            companyId: (companyId as string) ?? undefined,
          };
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        if (error instanceof Error) {
          throw new UnauthorizedException(error.message);
        }
        throw new UnauthorizedException('Unauthorized access');
      }
    } catch (error) {
      this.logger.error(`Error en el guard de autenticación : ${error}`);
      throw error;
    }

    return true;
  }

  private extractTokenFromRequest(
    request: AuthenticatedRequest,
  ): string | null {
    // 1. Intentar extraer desde el header Authorization (Bearer token)
    if (request.headers.authorization) {
      const { prefix, token } = this.extractToken(
        String(request.headers.authorization),
      );
      if (prefix === 'Bearer' && token) {
        return token;
      }
    }

    // 2. Fallback: cookie BFF de la app que llama (nunca mezclar console/admin)
    const cookies = (request as any).cookies as
      | Record<string, string>
      | undefined;
    if (cookies) {
      const names = getBffSessionCookieNames();
      const app = resolveBffAuthApp(request);

      if (app === 'admin') {
        return cookies[names.admin] ?? null;
      }
      if (app === 'console') {
        return cookies[names.console] ?? null;
      }

      // Origen desconocido: no preferir una cookie sobre otra si ambas existen
      const consoleToken = cookies[names.console];
      const adminToken = cookies[names.admin];
      if (consoleToken && !adminToken) return consoleToken;
      if (adminToken && !consoleToken) return adminToken;
    }

    return null;
  }

  private extractToken(authorization: string): {
    prefix: string;
    token: string;
  } {
    const [prefix, token] = authorization.split(' ');
    return { prefix, token };
  }
}
