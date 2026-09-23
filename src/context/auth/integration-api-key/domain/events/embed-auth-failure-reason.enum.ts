/**
 * Códigos de error para EmbedTokenAuthenticationFailedEvent.
 *
 * Catálogo cerrado de razones por las que una auth de embed puede fallar.
 * Permite a soporte filtrar por categoría y construir alertas.
 *
 * Cobertura:
 * - Auth del embed token: errores del EmbedTokenService (1.2/1.4)
 * - Validación del body: defense-in-depth mismatch
 * - Tenant gating: empresa deshabilitada, usuario no pertenece
 * - Infra: Redis/Mongo down
 * - Catch-all: UNKNOWN_ERROR para errores no clasificados
 */
export enum EmbedAuthFailureReason {
  // Embed token validation (Story 1.2/1.4)
  EMBED_TOKEN_MISSING = 'EMBED_TOKEN_MISSING',
  EMBED_TOKEN_INVALID = 'EMBED_TOKEN_INVALID',
  EMBED_TOKEN_EXPIRED = 'EMBED_TOKEN_EXPIRED',

  // Body defense-in-depth (Story 2.1)
  EMBED_BODY_TOKEN_MISMATCH = 'EMBED_BODY_TOKEN_MISMATCH',

  // Tenant gating (Story 1.3)
  EMBED_DISABLED_FOR_TENANT = 'EMBED_DISABLED_FOR_TENANT',
  EMBED_USER_NOT_IN_TENANT = 'EMBED_USER_NOT_IN_TENANT',
  EMBED_TENANT_MISMATCH = 'EMBED_TENANT_MISMATCH',

  // Logout (Story 2.3)
  EMBED_SESSION_NOT_FOUND = 'EMBED_SESSION_NOT_FOUND',
  LOGOUT_TRIGGERED = 'LOGOUT_TRIGGERED',

  // Infrastructure
  EMBED_SERVICE_UNAVAILABLE = 'EMBED_SERVICE_UNAVAILABLE',

  // Catch-all
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
