/**
 * Resuelve qué app BFF (console | admin) está llamando, para no mezclar cookies.
 */
export type BffAuthApp = 'console' | 'admin';

export function getBffSessionCookieNames(): {
  console: string;
  admin: string;
} {
  return {
    console:
      process.env.SESSION_COOKIE_CONSOLE ||
      process.env.SESSION_COOKIE ||
      'console_session',
    admin: process.env.SESSION_COOKIE_ADMIN || 'admin_session',
  };
}

/**
 * Detecta la app desde cabeceras (Origin/Referer o X-Guiders-App).
 * Devuelve null si no se puede determinar.
 */
export function resolveBffAuthApp(request: {
  headers?: Record<string, unknown>;
}): BffAuthApp | null {
  const headers = request.headers ?? {};
  const headerApp = String(
    headers['x-guiders-app'] ?? headers['X-Guiders-App'] ?? '',
  ).toLowerCase();
  if (headerApp === 'admin' || headerApp === 'console') {
    return headerApp;
  }

  const origin = String(headers.origin ?? headers.referer ?? '');
  if (!origin) return null;

  // Admin local :4201 o hosts admin.*
  if (/:4201\b/i.test(origin) || /\/\/admin[.-]/i.test(origin)) {
    return 'admin';
  }

  // Console local :4200 o hosts console/app
  if (
    /:4200\b/i.test(origin) ||
    /\/\/console[.-]/i.test(origin) ||
    /\/\/app[.-]/i.test(origin)
  ) {
    return 'console';
  }

  return null;
}
