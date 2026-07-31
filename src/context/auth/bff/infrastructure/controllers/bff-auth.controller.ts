// src/context/auth/bff/infrastructure/controllers/bff-auth.controller.ts
import { Controller, Get, Post, Req, Res, Logger, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  ApiInternalServerError,
  ApiValidationError,
  PublicEndpoint,
} from 'src/context/shared/infrastructure/swagger';
import type { Request, Response } from 'express';
import { OidcService } from '../services/oidc.service';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { QueryBus } from '@nestjs/cqrs';
import { FindUserByKeycloakIdQuery } from '../../../auth-user/application/queries/find-user-by-keycloak-id.query';
import { UserResponseDto } from '../../../auth-user/application/dtos/user-list-response.dto';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Result } from 'src/context/shared/domain/result';
import { BFFMeResponseDto } from '../dtos/bff-auth.dto';

// Helpers de configuración en runtime para evitar valores congelados al cargar el módulo
function parseSameSite(value?: string): 'strict' | 'lax' | 'none' {
  const normalized = value?.toLowerCase();
  console.log('[BFF parseSameSite Debug]', {
    originalValue: value,
    normalized: normalized,
    willReturn:
      normalized === 'strict' || normalized === 'lax' || normalized === 'none'
        ? normalized
        : 'lax',
  });

  if (
    normalized === 'strict' ||
    normalized === 'lax' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  return 'lax'; // Default seguro para desarrollo
}

function readCookieEnv(app?: string) {
  // Nota: en local (HTTP) cookies secure=true no se guardan
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';

  // Configuración por aplicación
  let sessionName: string;
  let refreshName: string;

  if (app === 'admin') {
    sessionName = process.env.SESSION_COOKIE_ADMIN || 'admin_session';
    refreshName = process.env.REFRESH_COOKIE_ADMIN || 'admin_refresh';
  } else {
    // Por defecto console
    sessionName =
      process.env.SESSION_COOKIE_CONSOLE ||
      process.env.SESSION_COOKIE ||
      'console_session';
    refreshName =
      process.env.REFRESH_COOKIE_CONSOLE ||
      process.env.REFRESH_COOKIE ||
      'console_refresh';
  }

  const cookieConfig = {
    sessionName,
    refreshName,
    sameSite: parseSameSite(process.env.SAMESITE),
    path: process.env.COOKIE_PATH || '/',
    refreshPath: process.env.REFRESH_PATH || '/api/bff/auth/refresh',
    domain: process.env.COOKIE_DOMAIN || undefined,
    secure,
  } as const;

  // Log detallado de la configuración de cookies
  console.log(`[BFF Cookie Config Debug - ${app || 'default'}]`, {
    app: app || 'console',
    rawSameSite: process.env.SAMESITE,
    parsedSameSite: cookieConfig.sameSite,
    rawSecure: process.env.COOKIE_SECURE,
    parsedSecure: cookieConfig.secure,
    nodeEnv: process.env.NODE_ENV,
    sessionName: cookieConfig.sessionName,
    refreshName: cookieConfig.refreshName,
  });

  return cookieConfig;
}

function readAuthEnv() {
  return {
    issuer: process.env.OIDC_ISSUER,
    audience: process.env.KEYCLOAK_AUDIENCE || 'account',
  } as const;
}
// Nota: JWKS se inicializa de forma perezosa para evitar fallos si OIDC_ISSUER no está definido al cargar el módulo.

// Obtiene allowlist de orígenes en runtime (evita leer antes de cargar .env)
function getAllowedReturnTo(): string[] {
  const raw = process.env.ALLOW_RETURN_TO || 'http://localhost:4200';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sanitizeReturnTo(input?: string) {
  const allowed = getAllowedReturnTo();
  const fallback = allowed[0] || 'http://localhost:4200';
  try {
    const url = new URL(input || '/', fallback);
    if (!allowed.includes(url.origin)) return fallback + '/';
    return url.href;
  } catch {
    return fallback + '/';
  }
}

@ApiTags('BFF Auth')
@ApiInternalServerError()
@Controller('bff/auth')
export class BffController {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly logger = new Logger(BffController.name);

  constructor(
    private readonly oidc: OidcService,
    private readonly queryBus: QueryBus,
  ) {}

  // Inicializa/memoiza JWKS desde OIDC_JWKS_URI o derivado de OIDC_ISSUER
  private getJWKS() {
    if (this.jwks) return this.jwks;
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
    throw new Error('OIDC_ISSUER u OIDC_JWKS_URI no configurados');
  }

  @ApiOperation({
    summary: 'Iniciar login OIDC (console)',
    description:
      'Inicia el flujo OIDC con PKCE. Guarda returnTo en sesión y redirige al proveedor OIDC. Uso por defecto para la app console.',
  })
  @ApiQuery({
    name: 'redirect',
    required: false,
    description:
      'URL a la que volver tras autenticación. Validada contra ALLOW_RETURN_TO.',
  })
  @ApiResponse({ status: 302, description: 'Redirección a proveedor OIDC' })
  @ApiValidationError()
  @Get('login')
  @PublicEndpoint()
  async login(
    @Req()
    req: Request & {
      session: Record<string, unknown> & { returnTo?: string };
    },
    @Res() res: Response,
  ) {
    // Guarda a dónde volver
    const redirectParam =
      typeof req.query.redirect === 'string' ? req.query.redirect : undefined;
    const resolvedReturnTo = sanitizeReturnTo(redirectParam);
    this.logger.debug(
      `[BFF /login] redirectParam=${redirectParam ?? 'none'} => returnTo=${resolvedReturnTo}`,
    );
    req.session.returnTo = resolvedReturnTo;

    const authUrl = await this.oidc.buildAuthUrl(req.session);
    try {
      const u = new URL(authUrl);
      this.logger.debug(
        `[BFF /login] Auth URL -> ${u.origin}${u.pathname} (code_challenge=${u.searchParams.has('code_challenge')}, state=${u.searchParams.has('state')}, nonce=${u.searchParams.has('nonce')})`,
      );
    } catch {
      this.logger.debug(`[BFF /login] Auth URL construido`);
    }
    return res.redirect(authUrl);
  }

  @ApiOperation({
    summary: 'Iniciar login OIDC para app',
    description:
      'Inicia el flujo OIDC para una app específica (console|admin). Guarda returnTo y redirige al proveedor OIDC.',
  })
  @ApiParam({ name: 'app', enum: ['console', 'admin'] })
  @ApiQuery({
    name: 'redirect',
    required: false,
    description:
      'URL a la que volver tras autenticación. Validada contra ALLOW_RETURN_TO.',
  })
  @ApiResponse({ status: 302, description: 'Redirección a proveedor OIDC' })
  @ApiValidationError()
  @Get('login/:app')
  @PublicEndpoint()
  async loginForApp(
    @Param('app') app: string,
    @Req()
    req: Request & {
      session: Record<string, unknown> & { returnTo?: string };
    },
    @Res() res: Response,
  ) {
    const redirectParam =
      typeof req.query.redirect === 'string' ? req.query.redirect : undefined;
    const resolvedReturnTo = sanitizeReturnTo(redirectParam);
    this.logger.debug(
      `[BFF /login/${app}] redirectParam=${redirectParam ?? 'none'} => returnTo=${resolvedReturnTo}`,
    );
    req.session.returnTo = resolvedReturnTo;
    const loginSessionId =
      ((req.session as Record<string, unknown>)?.id as string) ||
      (req as Request & { sessionID?: string }).sessionID ||
      'unknown';
    this.logger.debug(`[BFF /login/${app}] sessionID=${loginSessionId}`);

    const authUrl = await this.oidc.buildAuthUrl(req.session, { app });
    try {
      const u = new URL(authUrl);
      this.logger.debug(
        `[BFF /login/${app}] Auth URL -> ${u.origin}${u.pathname} (code_challenge=${u.searchParams.has('code_challenge')}, state=${u.searchParams.has('state')}, nonce=${u.searchParams.has('nonce')})`,
      );
    } catch {
      this.logger.debug(`[BFF /login/${app}] Auth URL construido`);
    }
    return res.redirect(authUrl);
  }

  @ApiOperation({
    summary: 'Callback OIDC',
    description:
      'Procesa el callback OIDC, emite cookies HttpOnly (session/refresh) y redirige a returnTo. Si hay error de sesión, reintenta login.',
  })
  @ApiParam({ name: 'app', enum: ['console', 'admin'] })
  @ApiResponse({
    status: 302,
    description: 'Redirección a returnTo tras login',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirección a login en caso de error',
  })
  @ApiValidationError('Callback inválido')
  @Get('callback/:app')
  @PublicEndpoint()
  async callback(
    @Param('app') app: string,
    @Req()
    req: Request & {
      session: Record<string, unknown> & { returnTo?: string };
      cookies: Record<string, string | undefined>;
      query: Record<string, string | string[]>;
    },
    @Res() res: Response,
  ) {
    let tokens: {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    try {
      const sessKeys = Object.keys(req.session || {});
      const queryKeys = Object.keys(
        (req.query || {}) as Record<string, unknown>,
      );
      const sessionId =
        ((req.session as Record<string, unknown>)?.id as string) ||
        (req as Request & { sessionID?: string }).sessionID ||
        'unknown';
      this.logger.debug(
        `[BFF /callback/${app}] sessionID=${sessionId} sessionKeys=[${sessKeys.join(', ')}] queryKeys=[${queryKeys.join(', ')}] hasPkce=${!!req.session?.pkce_verifier} hasState=${!!req.session?.oidc_state}`,
      );
      tokens = await this.oidc.handleCallback(req.query, req.session, {
        app,
      });
    } catch (e) {
      // Si falta la sesión PKCE/state/nonce o hay cualquier error, reintenta login limpio
      const reason =
        e instanceof Error && /session|state|nonce/i.test(e.message)
          ? 'session_mismatch'
          : 'callback_error';
      return res.redirect(`/api/bff/auth/login/${app}?reason=${reason}`);
    }

    // Cookies HttpOnly - usando configuración específica por app
    const cenv = readCookieEnv(app);
    this.logger.debug(
      `[BFF /callback/${app}] tokens: access=present refresh=${tokens.refresh_token ? 'present' : 'none'} id_token=${tokens.id_token ? 'present' : 'none'} exp_in=${tokens.expires_in ?? 'n/a'}`,
    );

    // Log detallado de la configuración de cookies antes de establecerlas
    this.logger.debug(
      `[BFF /callback/${app}] Cookie Config Debug: ${JSON.stringify({
        sessionName: cenv.sessionName,
        refreshName: cenv.refreshName,
        sameSite: cenv.sameSite,
        secure: cenv.secure,
        path: cenv.path,
        refreshPath: cenv.refreshPath,
        domain: cenv.domain,
      })}`,
    );

    const sessionCookieOptions = {
      httpOnly: true,
      secure: cenv.secure,
      sameSite: cenv.sameSite,
      domain: cenv.domain,
      path: cenv.path,
      maxAge: (tokens.expires_in ? tokens.expires_in : 600) * 1000,
    };

    this.logger.debug(
      `[BFF /callback/${app}] Setting session cookie with options: ${JSON.stringify(sessionCookieOptions)}`,
    );
    this.logger.debug(
      `[BFF /callback/${app}] set-cookie session name=${cenv.sessionName} path=${cenv.path} domain=${cenv.domain ?? 'host-only'} secure=${cenv.secure} sameSite=${cenv.sameSite}`,
    );

    res.cookie(cenv.sessionName, tokens.access_token, sessionCookieOptions);

    if (tokens.refresh_token) {
      const refreshCookieOptions = {
        httpOnly: true,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
        domain: cenv.domain,
        path: cenv.refreshPath,
        maxAge: 30 * 24 * 3600 * 1000,
      };

      this.logger.debug(
        `[BFF /callback/${app}] Setting refresh cookie with options: ${JSON.stringify(refreshCookieOptions)}`,
      );
      this.logger.debug(
        `[BFF /callback/${app}] set-cookie refresh name=${cenv.refreshName} path=${cenv.refreshPath} domain=${cenv.domain ?? 'host-only'} secure=${cenv.secure} sameSite=${cenv.sameSite}`,
      );

      res.cookie(cenv.refreshName, tokens.refresh_token, refreshCookieOptions);
    }

    // Guardar id_token para usarlo en el logout (requerido por Keycloak)
    if (tokens.id_token) {
      const idTokenCookieName = `${cenv.sessionName}_id`;
      const idTokenCookieOptions = {
        httpOnly: true,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
        domain: cenv.domain,
        path: cenv.path,
        maxAge: (tokens.expires_in ? tokens.expires_in : 600) * 1000,
      };

      this.logger.debug(
        `[BFF /callback/${app}] Setting id_token cookie with options: ${JSON.stringify(idTokenCookieOptions)}`,
      );

      res.cookie(idTokenCookieName, tokens.id_token, idTokenCookieOptions);
    }

    const ret = req.session.returnTo || '/';
    req.session.returnTo = undefined;
    this.logger.debug(`[BFF /callback/${app}] redirect to returnTo=${ret}`);
    return res.redirect(ret);
  }

  // Devuelve claims mínimas
  @ApiOperation({
    summary: 'Obtener información del usuario autenticado (console)',
    description:
      'Devuelve información del usuario autenticado obtenida desde la base de datos, incluyendo companyId. Requiere cookie de sesión válida.',
  })
  @ApiResponse({
    status: 200,
    description: 'Información del usuario',
    type: BFFMeResponseDto,
  })
  @ApiValidationError('Solicitud inválida')
  @Get('me')
  @PublicEndpoint()
  async me(
    @Req() req: Request & { cookies: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    return this.getMeForApp(req, res, 'console'); // Por defecto console
  }

  @ApiOperation({
    summary: 'Obtener información del usuario autenticado (app)',
    description:
      'Devuelve información del usuario autenticado obtenida desde la base de datos para la app indicada (console|admin), incluyendo companyId. Requiere cookie de sesión válida.',
  })
  @ApiParam({ name: 'app', enum: ['console', 'admin'] })
  @ApiResponse({
    status: 200,
    description: 'Información del usuario',
    type: BFFMeResponseDto,
  })
  @ApiValidationError('Solicitud inválida')
  @Get('me/:app')
  @PublicEndpoint()
  async meForApp(
    @Param('app') app: string,
    @Req() req: Request & { cookies: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    return this.getMeForApp(req, res, app);
  }

  private async getMeForApp(
    req: Request & { cookies: Record<string, string | undefined> },
    res: Response,
    app: string,
  ) {
    const cenv = readCookieEnv(app);
    const cookieKeys = Object.keys(req.cookies || {});

    // Log muy detallado de todas las cookies recibidas
    this.logger.debug(
      `[BFF /me/${app}] Raw cookies object: ${JSON.stringify(req.cookies || {}, null, 2)}`,
    );
    this.logger.debug(
      `[BFF /me/${app}] Cookies recibidas: [${cookieKeys.join(', ')}], sessionName=${cenv.sessionName}`,
    );
    this.logger.debug(`[BFF /me/${app}] Buscando cookie: ${cenv.sessionName}`);
    this.logger.debug(
      `[BFF /me/${app}] Headers recibidos: ${JSON.stringify(req.headers.cookie || 'none')}`,
    );

    const tok = req.cookies?.[cenv.sessionName] as string | undefined;
    if (!tok) {
      this.logger.debug(`[BFF /me/${app}] Cookie de sesión no presente`);
      this.logger.debug(
        `[BFF /me/${app}] Expected cookie name: ${cenv.sessionName}, Available cookies: ${Object.keys(req.cookies || {}).join(', ')}`,
      );
      return res
        .status(401)
        .send({ error: 'unauthenticated', reason: 'no_cookie' });
    }

    this.logger.debug(
      `[BFF /me/${app}] Cookie encontrada, longitud: ${tok.length} caracteres`,
    );

    // valida issuer/audience/firma
    const { issuer, audience } = readAuthEnv();
    const verifyOptions: { issuer?: string; audience?: string } = {
      audience,
    };
    if (issuer) verifyOptions.issuer = issuer;
    this.logger.debug(
      `[BFF /me/${app}] Verificando JWT: audience=${audience}, issuer=${issuer ?? 'none'}`,
    );
    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(tok, this.getJWKS(), verifyOptions);
      payload = verified.payload;
    } catch (e) {
      this.logger.debug(
        `[BFF /me/${app}] Fallo en verificación JWT: ${e instanceof Error ? e.message : String(e)}`,
      );
      return res
        .status(401)
        .send({ error: 'unauthenticated', reason: 'jwt_verify_failed' });
    }

    this.logger.debug(
      `[BFF /me/${app}] JWT OK: sub=${payload.sub ?? 'n/a'}, exp=${payload.exp ?? 'n/a'}`,
    );

    // Obtener información del usuario desde la base de datos
    if (!payload.sub) {
      this.logger.error(`[BFF /me/${app}] JWT sin claim 'sub'`);
      return res
        .status(401)
        .send({ error: 'unauthenticated', reason: 'invalid_jwt_sub' });
    }

    const userResult = await this.queryBus.execute<
      FindUserByKeycloakIdQuery,
      Result<UserResponseDto, DomainError>
    >(new FindUserByKeycloakIdQuery(payload.sub));

    if (userResult.isErr()) {
      this.logger.warn(
        `[BFF /me/${app}] Usuario con sub=${payload.sub} no encontrado en BD: ${userResult.error.message}`,
      );
      // 403 (no 401): el JWT de Keycloak es válido pero el usuario no está
      // provisionado en la BD del backend. Usar 401 provocaría que el frontend
      // interprete la sesión como expirada, reintente login, y entre en un bucle
      // infinito porque el login OAuth vuelve a completarse con el mismo JWT sin
      // que el usuario exista en BD. 403 corta el loop y permite mostrar un
      // mensaje específico ("cuenta no configurada") en lugar de redirigir a login.
      return res
        .status(403)
        .send({ error: 'forbidden', reason: 'user_not_provisioned' });
    }

    const user = userResult.unwrap();
    this.logger.debug(
      `[BFF /me/${app}] Usuario encontrado: id=${user.id}, email=${user.email}, companyId=${user.companyId}`,
    );

    const response = {
      sub: payload.sub,
      email: user.email,
      roles: user.roles,
      companyId: user.companyId,
      app: app,
      session: { exp: payload.exp, iat: payload.iat },
    };

    this.logger.log(
      `📤 [BFF /me/${app}] Respuesta final: ${JSON.stringify(response)}`,
    );

    return res.send(response);
  }

  @ApiOperation({
    summary: 'Refrescar sesión (console)',
    description:
      'Renueva la cookie de sesión usando el refresh token HttpOnly. Responde 204 sin contenido si OK.',
  })
  @ApiResponse({ status: 204, description: 'Sesión renovada' })
  @ApiValidationError('Solicitud inválida')
  @Post('refresh')
  @PublicEndpoint()
  async refresh(
    @Req() req: Request & { cookies: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    return this.doRefresh(req, res, 'console'); // Por defecto console
  }

  @ApiOperation({
    summary: 'Refrescar sesión (app)',
    description:
      'Renueva la cookie de sesión para la app indicada (console|admin) usando el refresh token HttpOnly. Responde 204 si OK.',
  })
  @ApiParam({ name: 'app', enum: ['console', 'admin'] })
  @ApiResponse({ status: 204, description: 'Sesión renovada' })
  @ApiValidationError('Solicitud inválida')
  @Post('refresh/:app')
  @PublicEndpoint()
  async refreshForApp(
    @Param('app') app: string,
    @Req() req: Request & { cookies: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    return this.doRefresh(req, res, app);
  }

  private async doRefresh(
    req: Request & { cookies: Record<string, string | undefined> },
    res: Response,
    app: string,
  ) {
    const cenv = readCookieEnv(app);
    const rt = req.cookies?.[cenv.refreshName] as string | undefined;
    if (!rt) return res.status(401).send({ error: 'no_refresh' });
    // (recomendado) valida CSRF header aquí

    let t: {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in?: number;
    };
    try {
      t = await this.oidc.refresh(rt, app);
    } catch (e) {
      // El refresh token puede estar expirado, revocado o ser inválido
      const errorMessage = e instanceof Error ? e.message : 'Error desconocido';
      this.logger.warn(
        `[BFF /refresh/${app}] Error al refrescar token: ${errorMessage}`,
      );

      // Limpiar cookies inválidas
      res.clearCookie(cenv.sessionName, {
        path: cenv.path,
        domain: cenv.domain,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
      });
      res.clearCookie(cenv.refreshName, {
        path: cenv.refreshPath,
        domain: cenv.domain,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
      });
      res.clearCookie(`${cenv.sessionName}_id`, {
        path: cenv.path,
        domain: cenv.domain,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
      });

      return res.status(401).send({
        error: 'refresh_failed',
        reason: errorMessage.includes('invalid_grant')
          ? 'token_expired'
          : 'refresh_error',
      });
    }

    res.cookie(cenv.sessionName, t.access_token, {
      httpOnly: true,
      secure: cenv.secure,
      sameSite: cenv.sameSite,
      domain: cenv.domain,
      path: cenv.path,
      maxAge: (t.expires_in ? t.expires_in : 600) * 1000,
    });
    if (t.refresh_token) {
      res.cookie(cenv.refreshName, t.refresh_token, {
        httpOnly: true,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
        domain: cenv.domain,
        path: cenv.refreshPath,
        maxAge: 30 * 24 * 3600 * 1000,
      });
    }
    // Renovar id_token si viene en el refresh (también requerido para logout futuro)
    if (t.id_token) {
      const idTokenCookieName = `${cenv.sessionName}_id`;
      res.cookie(idTokenCookieName, t.id_token, {
        httpOnly: true,
        secure: cenv.secure,
        sameSite: cenv.sameSite,
        domain: cenv.domain,
        path: cenv.path,
        maxAge: (t.expires_in ? t.expires_in : 600) * 1000,
      });
    }
    return res.sendStatus(204);
  }

  @ApiOperation({
    summary: 'Cerrar sesión (console)',
    description:
      'Revoca refresh token si existe, limpia cookies y redirige a /api/bff/auth/login/console.',
  })
  @ApiResponse({ status: 302, description: 'Redirige a /login/console' })
  @ApiValidationError('Solicitud inválida')
  @Get('logout')
  @PublicEndpoint()
  async logout(
    @Req() req: Request & { cookies: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    return this.doLogout(req, res, 'console'); // Por defecto console
  }

  @ApiOperation({
    summary: 'Cerrar sesión (app)',
    description:
      'Revoca refresh token si existe, limpia cookies y redirige a /api/bff/auth/login/:app.',
  })
  @ApiParam({ name: 'app', enum: ['console', 'admin'] })
  @ApiResponse({ status: 302, description: 'Redirige a /login/:app' })
  @ApiValidationError('Solicitud inválida')
  @Get('logout/:app')
  @PublicEndpoint()
  async logoutForApp(
    @Param('app') app: string,
    @Req() req: Request & { cookies: Record<string, string | undefined> },
    @Res() res: Response,
  ) {
    return this.doLogout(req, res, app);
  }

  private async doLogout(
    req: Request & { cookies: Record<string, string | undefined> },
    res: Response,
    app: string,
  ) {
    const cenv = readCookieEnv(app);
    const rt = req.cookies?.[cenv.refreshName] as string | undefined;
    const idTokenCookieName = `${cenv.sessionName}_id`;
    const idToken = req.cookies?.[idTokenCookieName] as string | undefined;

    // Revocar refresh token si existe
    if (rt) {
      await this.oidc.revoke(rt, app);
    }

    // Limpiar cookies de la aplicación (incluyendo id_token)
    res.clearCookie(cenv.sessionName, {
      path: cenv.path,
      domain: cenv.domain,
      secure: cenv.secure,
      sameSite: cenv.sameSite,
    });
    res.clearCookie(cenv.refreshName, {
      path: cenv.refreshPath,
      domain: cenv.domain,
      secure: cenv.secure,
      sameSite: cenv.sameSite,
    });
    res.clearCookie(idTokenCookieName, {
      path: cenv.path,
      domain: cenv.domain,
      secure: cenv.secure,
      sameSite: cenv.sameSite,
    });

    // Construir URL de logout de Keycloak con id_token_hint
    // Después del logout, redirigir al frontend de la app correspondiente
    const allowedOrigins = getAllowedReturnTo();
    const preferredOrigin =
      app === 'admin'
        ? allowedOrigins.find((o) => o.includes('4201') || o.includes('admin'))
        : allowedOrigins.find(
            (o) => o.includes('4200') || o.includes('console'),
          );
    const postLogoutRedirectUri =
      preferredOrigin || allowedOrigins[0] || 'http://localhost:4200';

    try {
      const keycloakLogoutUrl = this.oidc.buildLogoutUrl({
        postLogoutRedirectUri,
        app,
        idTokenHint: idToken, // Keycloak requiere id_token_hint para logout
      });

      this.logger.debug(
        `[BFF /logout/${app}] Redirigiendo a logout de Keycloak con id_token_hint=${idToken ? 'present' : 'missing'}, post_logout_redirect=${postLogoutRedirectUri}`,
      );

      return res.redirect(keycloakLogoutUrl);
    } catch (error) {
      // Fallback: si falla construir URL de Keycloak, ir directo al frontend
      this.logger.warn(
        `[BFF /logout/${app}] No se pudo construir URL de logout de Keycloak: ${error instanceof Error ? error.message : String(error)}`,
      );
      return res.redirect(postLogoutRedirectUri);
    }
  }
}
