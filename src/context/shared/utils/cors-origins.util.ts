/**
 * Helpers para configurar CORS en main.ts.
 *
 * Story 3.3 — Epic 3: Cross-Frame Auth Handshake.
 *
 * Permite parsear env vars con listas separadas por comas y unificar
 * múltiples fuentes (defaults hardcoded + env var legacy + nueva env var
 * embed) en una sola lista final de origins permitidos.
 *
 * Spec: `_bmad-output/implementation-artifacts/3-3-add-cors-origins-for-embed-clients-in-main-ts.md`
 */

/**
 * Default origins that can embed the Guiders admin iframe.
 *
 * LeadCars es nuestro customer de referencia — sus origins de producción
 * van aquí. Para otros integradores B2B, agregar sus origins via
 * `EMBED_ALLOWED_DEFAULT_ORIGINS` env var (comma-separated).
 *
 * Comparación es **case-sensitive** y sin wildcards (consistente con
 * `EmbedAllowedOriginsService` del frontend Story 3.1).
 */
export const DEFAULT_EMBED_ORIGINS: ReadonlyArray<string> = [
  'https://app.leadcars.com',
  'https://www.leadcars.com',
];

/**
 * Parsea una env var con origins separados por comas.
 *
 * @param raw - Valor de la env var (string o unknown)
 * @returns Array de origins trimmeados y no vacíos. Array vacío si input no es string.
 *
 * @example
 * parseAllowedOrigins('https://a.com, https://b.com')
 * // => ['https://a.com', 'https://b.com']
 *
 * parseAllowedOrigins('  ,  , https://a.com ,')
 * // => ['https://a.com'] (vacíos filtrados)
 */
export function parseAllowedOrigins(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Unifica múltiples fuentes de origins permitidos en una sola lista deduplicada.
 *
 * Precedencia (orden de merge, luego dedupe via Set):
 * 1. `DEFAULT_EMBED_ORIGINS` (hardcoded — LeadCars production)
 * 2. `EMBED_ALLOWED_DEFAULT_ORIGINS` env var (nueva, spec Story 3.3)
 * 3. `CORS_ALLOWED_ORIGINS` env var (legacy, backward compat)
 *
 * El Set preserva el orden de inserción (primer match wins en validación).
 *
 * @example
 * mergeAllowedOrigins(['https://b.com'], ['https://a.com'])
 * // => ['https://b.com', 'https://a.com'] (default first, env second)
 */
export function mergeAllowedOrigins(
  envEmbedOrigins: ReadonlyArray<string>,
  envLegacyOrigins: ReadonlyArray<string>,
): string[] {
  return Array.from(
    new Set([
      ...DEFAULT_EMBED_ORIGINS,
      ...envEmbedOrigins,
      ...envLegacyOrigins,
    ]),
  );
}
