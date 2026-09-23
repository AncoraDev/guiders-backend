/**
 * Utilidades de sanitización de PII para el audit log (Story 2.2, Task 8.1).
 *
 * GDPR compliance: la IP es dato personal bajo Art. 4(1), por lo que
 * NO se persiste en claro. Se hashea con SHA-256 (primeros 16 chars
 * hex = 8 bytes) para evitar colisiones mientras se preserva el espacio
 * de búsqueda.
 *
 * El userAgent y failureDetail se truncan y limpian para evitar
 * information leak y mantener tamaño acotado en MongoDB.
 */

import { createHash } from 'crypto';

/**
 * Hashea una IP (IPv4 o IPv6) con SHA-256 y retorna los primeros
 * 16 chars hex (8 bytes). Determinista: misma IP → mismo hash.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

/**
 * Trunca user agent a max 500 chars (evita payloads abusivos).
 */
export function truncateUserAgent(ua: string): string {
  if (!ua) return '';
  return ua.length > 500 ? ua.substring(0, 500) : ua;
}

/**
 * Sanitiza failure detail:
 * 1. Trunca a 500 chars max
 * 2. Remueve tokens base64url-like (40+ chars alfanum + -_) para
 *    evitar que un error message filtre un embed token o session ID
 */
export function sanitizeFailureDetail(detail: string): string {
  if (!detail) return '';
  const TOKEN_PATTERN = /[A-Za-z0-9_-]{40,}/g;
  const cleaned = detail.replace(TOKEN_PATTERN, '[REDACTED]');
  return cleaned.length > 500 ? cleaned.substring(0, 500) : cleaned;
}
