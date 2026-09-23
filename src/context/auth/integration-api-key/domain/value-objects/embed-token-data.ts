/**
 * Datos de sesión de un embed token tal como se almacenan en Redis.
 *
 * El token en sí es opaco (no contiene información). Estos datos viven
 * en el VALUE de Redis (`embed:token:<token>`) y se recuperan vía
 * `validateToken`.
 */
export interface EmbedTokenData {
  userId: string;
  companyId: string;
  roles: string[];
  createdAt: string; // ISO 8601 — preserved across refreshes
  refreshedAt?: string; // ISO 8601 — only present after first refresh
}

/**
 * Resultado de crear/refresh un token. `expiresAt` es un ISO 8601 string.
 */
export interface EmbedTokenIssued {
  token: string;
  expiresAt: string;
}
