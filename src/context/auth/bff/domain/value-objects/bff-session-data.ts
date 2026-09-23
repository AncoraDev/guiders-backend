/**
 * Datos de sesión BFF tal como se almacenan en Redis.
 *
 * La BFF session es un value object separado del embed token. El
 * embed token vive en `embed:token:*` y lo emite/valida
 * `EmbedTokenService`. La BFF session vive en `bff:session:*` y la
 * emite `BffSessionService` después de validar el embed token.
 *
 * El campo `embedTokenRef` guarda el embed token original que creó
 * la sesión — útil para trazabilidad y revocación en cascada (logout
 * del usuario invalida la BFF session y, opcionalmente, el embed
 * token asociado — ver Story 2.3).
 *
 * El campo `expiresAt` (opcional) se incluye para que la estrategia
 * JWT (Story 2.6) pueda verificar expiración sin lookup extra a Redis.
 */

export interface BffSessionData {
  userId: string;
  companyId: string;
  roles: string[];
  createdAt: string; // ISO 8601 — preserved from embed token
  embedTokenRef: string; // the embed token that created this session
  expiresAt?: string; // ISO 8601 — opcional, alineado con TTL de Redis
}

/**
 * Prefijo de namespace para todas las BFF sessions en Redis.
 * Aislado de otros namespaces (embed:token:*, visitor:*, bff:auth:*).
 */
export const BFF_SESSION_KEY_PREFIX = 'bff:session:';

/**
 * TTL de las BFF sessions: 8 horas (28800 segundos). Mirror del TTL
 * del embed token para que la sesión muera al mismo tiempo que el
 * token que la creó.
 */
export const BFF_SESSION_TTL_SECONDS = 28800;
