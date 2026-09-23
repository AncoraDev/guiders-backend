/**
 * Guard que extrae y valida el `Authorization: Bearer <token>` header
 * para los endpoints de embed.
 *
 * A diferencia de `IntegrationApiKeyGuard` (que valida API keys de
 * integradores B2B), este guard valida tokens opacos emitidos por
 * `/v2/integration/embed/start`.
 *
 * El token NO se valida contra Redis aquí — solo se valida el formato.
 * La validación completa (Redis lookup) la hace el command handler
 * vía `EmbedTokenService.validateToken()`. Esto evita una llamada
 * extra a Redis en cada request y mantiene el guard rápido.
 *
 * RFC 6750 §2.1: el scheme "Bearer" es case-insensitive. Aceptamos
 * `Bearer`, `bearer`, `BEARER`, `bEaReR`, etc.
 *
 * Toleramos whitespace múltiple entre "Bearer" y el token (clientes
 * HTTP/1.1 a veces concatenan headers).
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

export const EMBED_TOKEN_HEADER = 'authorization';
const BEARER_SCHEME = 'bearer';
const BASE64URL_REGEX = /^[A-Za-z0-9_-]{43}$/;

export interface EmbedTokenRequest extends Request {
  embedToken?: string;
}

@Injectable()
export class EmbedTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<EmbedTokenRequest>();
    const rawHeader = request.headers[EMBED_TOKEN_HEADER];

    // Missing header
    if (rawHeader === undefined || rawHeader === null || rawHeader === '') {
      throw new UnauthorizedException({
        code: 'EMBED_TOKEN_MISSING',
        message: 'Authorization header requerido en formato "Bearer <token>"',
        statusCode: 401,
      });
    }

    // Multi-value header (e.g., proxy injects multiple Authorization)
    if (typeof rawHeader !== 'string') {
      throw new UnauthorizedException({
        code: 'EMBED_TOKEN_INVALID',
        message: 'Authorization header duplicado o con formato inválido',
        statusCode: 401,
      });
    }

    // Split by whitespace to handle "Bearer   xxx" (multi-space),
    // "Bearer\txxx" (tab), etc. RFC 7230 allows OWS (optional whitespace).
    const parts = rawHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== BEARER_SCHEME) {
      throw new UnauthorizedException({
        code: 'EMBED_TOKEN_INVALID',
        message:
          'Authorization header debe tener formato "Bearer <token>" (case-insensitive)',
        statusCode: 401,
      });
    }

    const token = parts[1];
    if (!BASE64URL_REGEX.test(token)) {
      throw new UnauthorizedException({
        code: 'EMBED_TOKEN_INVALID',
        message:
          'Embed token con formato inválido (debe ser base64url de 43 chars)',
        statusCode: 401,
      });
    }

    request.embedToken = token;
    return true;
  }
}
