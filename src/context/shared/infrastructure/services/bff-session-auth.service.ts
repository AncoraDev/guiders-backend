import { Injectable, Logger } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  BffAuthApp,
  getBffSessionCookieNames,
} from '../bff-app-cookie';

export interface BffUserInfo {
  sub: string;
  email?: string;
  roles: string[];
}

/**
 * Servicio para validar sesiones de BFF (Backend For Frontend) conectado con Keycloak.
 * Extrae y valida cookies de sesión del BFF como 'console_session' que contienen JWT.
 */
@Injectable()
export class BffSessionAuthService {
  private readonly logger = new Logger(BffSessionAuthService.name);
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  /**
   * Valida una cookie de sesión BFF que contiene un JWT de Keycloak
   * @param sessionToken Token JWT extraído de la cookie de sesión
   * @returns Información del usuario si el token es válido, null si no
   */
  async validateBffSession(sessionToken: string): Promise<BffUserInfo | null> {
    try {
      this.logger.debug(
        `Validando sesión BFF, token length: ${sessionToken.length}`,
      );

      // Configuración de validación desde variables de entorno
      const { issuer, audience } = this.readAuthEnv();
      const verifyOptions: { issuer?: string; audience?: string } = {
        audience,
      };
      if (issuer) {
        verifyOptions.issuer = issuer;
      }

      this.logger.debug(
        `Opciones de verificación JWT: audience=${audience}, issuer=${issuer ?? 'none'}`,
      );

      // Verificar el JWT usando JWKS
      const verified = await jwtVerify(
        sessionToken,
        this.getJWKS(),
        verifyOptions,
      );
      const payload = verified.payload;

      // Extraer información del usuario del payload
      const userPayload = payload as JWTPayload & {
        email?: string;
        realm_access?: { roles?: string[] };
      };

      const userInfo: BffUserInfo = {
        sub: payload.sub!,
        email: userPayload.email,
        roles: userPayload.realm_access?.roles ?? [],
      };

      this.logger.debug(
        `Sesión BFF válida: sub=${userInfo.sub}, email=${userInfo.email ?? 'none'}, roles=[${userInfo.roles.join(', ')}]`,
      );

      return userInfo;
    } catch (error) {
      this.logger.debug(
        `Fallo en validación de sesión BFF: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Extrae cookies de sesión BFF de la cabecera Cookie.
   * Si se indica preferredApp, solo usa la cookie de esa app (aisla Console/Admin).
   */
  extractBffSessionTokens(
    cookieHeader?: string,
    preferredApp?: BffAuthApp | null,
  ): string[] {
    if (!cookieHeader) {
      return [];
    }

    this.logger.debug(
      `Extrayendo tokens BFF de cookies: ${cookieHeader.substring(0, 100)}...`,
    );

    const tokens: string[] = [];
    const names = getBffSessionCookieNames();
    const cookies = this.parseCookies(cookieHeader);

    const patterns =
      preferredApp === 'admin'
        ? [names.admin]
        : preferredApp === 'console'
          ? [names.console]
          : [names.console, names.admin, 'bff_sess'];

    for (const pattern of patterns) {
      const token = cookies[pattern];
      if (token && this.looksLikeJWT(token)) {
        tokens.push(token);
        this.logger.debug(
          `Token BFF encontrado en cookie '${pattern}': ${token.substring(0, 50)}...`,
        );
      }
    }

    return tokens;
  }

  /**
   * Parsea la cabecera Cookie de forma robusta
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    try {
      const pairs = cookieHeader.split(';');

      for (const pair of pairs) {
        const [name, ...valueParts] = pair.split('=');
        if (name && valueParts.length > 0) {
          const cleanName = name.trim();
          const cleanValue = valueParts.join('=').trim();

          // Decodificar URL si es necesario
          try {
            cookies[cleanName] = decodeURIComponent(cleanValue);
          } catch {
            // Si falla el decode, usar el valor sin decodificar
            cookies[cleanName] = cleanValue;
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Error parseando cookies: ${error}`);
    }

    return cookies;
  }

  /**
   * Verifica si un string parece ser un JWT válido
   */
  private looksLikeJWT(token: string): boolean {
    // Un JWT debe tener exactamente 3 partes separadas por puntos
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }

  /**
   * Inicializa/memoiza JWKS desde OIDC_JWKS_URI o derivado de OIDC_ISSUER
   */
  private getJWKS() {
    if (this.jwks) {
      return this.jwks;
    }

    const jwksUri = process.env.OIDC_JWKS_URI;
    const issuer = process.env.OIDC_ISSUER;

    if (jwksUri) {
      this.jwks = createRemoteJWKSet(new URL(jwksUri));
      return this.jwks;
    }

    if (issuer) {
      const base = issuer.replace(/\/$/, '');
      this.jwks = createRemoteJWKSet(
        new URL(`${base}/protocol/openid-connect/certs`),
      );
      return this.jwks;
    }

    throw new Error(
      'OIDC_ISSUER u OIDC_JWKS_URI no configurados para validación BFF',
    );
  }

  /**
   * Lee configuración de autenticación desde variables de entorno
   */
  private readAuthEnv() {
    return {
      issuer: process.env.OIDC_ISSUER,
      audience: process.env.KEYCLOAK_AUDIENCE || 'account',
    } as const;
  }
}
