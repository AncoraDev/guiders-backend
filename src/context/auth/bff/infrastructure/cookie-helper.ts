/**
 * Helper para configuración de cookies de sesión.
 *
 * Refactor de la lógica que vivía dentro de `bff-auth.controller.ts:47-95`
 * para que pueda ser reutilizada por el nuevo `EmbedSessionController`
 * (Story 2.1) sin duplicación.
 *
 * Variables de entorno (mismas que el BFF original):
 *  - COOKIE_SECURE: 'true'/'false' (default = NODE_ENV === 'production')
 *  - SAMESITE: 'strict'/'lax'/'none' (default = 'lax')
 *  - COOKIE_PATH: ruta de la cookie (default = '/')
 *  - COOKIE_DOMAIN: dominio de la cookie (default = undefined, host-only)
 *  - SESSION_COOKIE_ADMIN/REFRESH_COOKIE_ADMIN: nombres para app 'admin'
 *  - SESSION_COOKIE_CONSOLE/REFRESH_COOKIE_CONSOLE: nombres para app 'console'
 */

function parseSameSite(value?: string): 'strict' | 'lax' | 'none' {
  const normalized = value?.toLowerCase();
  if (
    normalized === 'strict' ||
    normalized === 'lax' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  return 'lax';
}

export interface CookieEnv {
  sessionName: string;
  refreshName: string;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  refreshPath: string;
  domain: string | undefined;
  secure: boolean;
}

export function readCookieEnv(app?: string): CookieEnv {
  const secure =
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';

  let sessionName: string;
  let refreshName: string;

  if (app === 'admin') {
    sessionName = process.env.SESSION_COOKIE_ADMIN || 'admin_session';
    refreshName = process.env.REFRESH_COOKIE_ADMIN || 'admin_refresh';
  } else {
    sessionName =
      process.env.SESSION_COOKIE_CONSOLE ||
      process.env.SESSION_COOKIE ||
      'console_session';
    refreshName =
      process.env.REFRESH_COOKIE_CONSOLE ||
      process.env.REFRESH_COOKIE ||
      'console_refresh';
  }

  return {
    sessionName,
    refreshName,
    sameSite: parseSameSite(process.env.SAMESITE),
    path: process.env.COOKIE_PATH || '/',
    refreshPath: process.env.REFRESH_PATH || '/api/bff/auth/refresh',
    domain: process.env.COOKIE_DOMAIN || undefined,
    secure,
  };
}
