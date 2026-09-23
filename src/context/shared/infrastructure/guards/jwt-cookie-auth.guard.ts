import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

const OPAQUE_SESSION_REGEX = /^[A-Za-z0-9_-]{43}$/;
const JWT_SEGMENT_COUNT = 3;

export type TokenKind = 'jwt' | 'opaque' | 'missing' | 'invalid';

export function detectTokenKind(token: string | undefined): TokenKind {
  if (!token) return 'missing';
  if (token.split('.').length === JWT_SEGMENT_COUNT) return 'jwt';
  if (OPAQUE_SESSION_REGEX.test(token)) return 'opaque';
  return 'invalid';
}

@Injectable()
export class JwtCookieAuthGuard extends AuthGuard('jwt-cookie') {
  private readonly logger = new Logger(JwtCookieAuthGuard.name);

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request?.cookies?.['access_token'];
    const tokenKind = detectTokenKind(token);

    if (tokenKind === 'opaque') {
      throw new UnauthorizedException(
        'Opaque BFF session not supported by this guard. Use BffSessionCookieAuthGuard instead.',
      );
    }

    if (tokenKind === 'missing' || tokenKind === 'invalid') {
      return super.canActivate(context) as Promise<boolean>;
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException('Token de autenticación requerido en cookie')
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return user;
  }
}
