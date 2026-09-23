/**
 * Helper para extraer contexto de auditoría de los headers HTTP.
 *
 * AI-4 (Story 2.2 retro + Story 2.3 retro): este bloque se copiaba en 4
 * controllers (bff-auth.logoutEmbed, embed-session.authenticate,
 * embed.start, embed.refresh). DRY violation.
 *
 * Patrón unificado para extraer `origin`, `ipAddress`, `userAgent`
 * de los headers de una Request de Express, con fallbacks seguros
 * (string vacío cuando el header no está presente o tiene formato
 * inesperado).
 *
 * Origen del header:
 *   - `Origin`: header estándar de CORS — la fuente preferida para `origin`
 *   - `Referer`: fallback si Origin no está presente (puede incluir path)
 *   - `x-forwarded-for`: si `trust proxy` está configurado en main.ts,
 *     `req.ip` ya lo procesa correctamente. Si no, usamos el primer
 *     hop del header como fallback.
 *
 * IPs se hashean en el persistence handler (PII sanitization,
 * NO aquí — separación de concerns).
 */
import type { Request } from 'express';

export interface AuditContext {
  /** Origin de la request (CORS Origin o fallback a Referer). Vacío si no hay. */
  origin: string;
  /** IP del cliente (req.ip o x-forwarded-for fallback). Vacío si no detectable. */
  ipAddress: string;
  /** User-Agent header. Vacío si no presente. */
  userAgent: string;
}

/**
 * Extrae el contexto de auditoría de una Request de Express.
 *
 * Comportamiento de fallback (en orden de prioridad):
 *  - origin: header `origin` → header `referer` → ''
 *  - ipAddress: `req.ip` → primer IP de `x-forwarded-for` → ''
 *  - userAgent: header `user-agent` → ''
 *
 * Garantiza que todos los campos retornan `string` (nunca `undefined`),
 * eliminando la necesidad de null-checks en los handlers.
 *
 * @example
 * ```typescript
 * const ctx = extractAuditContext(req);
 * tryPublish(eventBus, new AuthenticatedEvent({
 *   ...,
 *   origin: ctx.origin,
 *   ipAddress: ctx.ipAddress,
 *   userAgent: ctx.userAgent,
 * }), this.logger, 'handler-name');
 * ```
 */
export function extractAuditContext(req: Request): AuditContext {
  const origin = readHeader(req, 'origin') ?? readHeader(req, 'referer') ?? '';

  // req.ip es la IP ya procesada por Express (respeta trust proxy).
  // Fallback a x-forwarded-for solo si req.ip NO está disponible
  // (undefined, null, o empty string — todos cuentan como "no hay IP").
  //
  // NOTA: usamos truthy check (`reqIp ||`) NO nullish coalescing (`reqIp ??`),
  // porque empty string "" debería caer al fallback. Esto corrige el bug
  // PR #115 VALIDATION_GAP-21 detectado en re-review.
  const reqIp =
    typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : undefined;
  const xff = readHeader(req, 'x-forwarded-for');
  const rawIp = reqIp || (xff ? xff.split(',')[0]?.trim() : '') || '';

  // TD-3 fix: normalizar IPv6-mapped IPv4 (`::ffff:192.168.1.1`)
  // a IPv4 plano (`192.168.1.1`). Sin esto, el hash IP produce valores
  // distintos para el mismo cliente (rompe correlación de eventos en
  // incidentes). Solo aplica si la IP comienza con el prefijo IPv6-mapped.
  const ipAddress = normalizeIpv6Mapped(rawIp);

  const userAgent = readHeader(req, 'user-agent') ?? '';

  return { origin, ipAddress, userAgent };
}

/**
 * Normaliza una IP en formato IPv6-mapped IPv4 a IPv4 plano.
 *
 * El prefijo `::ffff:` indica una dirección IPv4 mapeada en IPv6
 * (RFC 4291). Express retorna este formato cuando el cliente se conecta
 * via IPv4 a un servidor con dual-stack IPv6. Si no se normaliza,
 * `hashIp('::ffff:192.168.1.1') !== hashIp('192.168.1.1')` aunque
 * representan el mismo cliente.
 *
 * @example
 * normalizeIpv6Mapped('::ffff:192.168.1.1') → '192.168.1.1'
 * normalizeIpv6Mapped('192.168.1.1') → '192.168.1.1' (no-op)
 * normalizeIpv6Mapped('2001:db8::1') → '2001:db8::1' (IPv6 pura, no-op)
 */
function normalizeIpv6Mapped(ip: string): string {
  // ::ffff:192.168.1.1 → 192.168.1.1
  // (case-insensitive para robustez)
  const match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (match) {
    return match[1];
  }
  // Para otras variantes (con zone, prefix diferente), retornar tal cual
  return ip;
}

/**
 * Helper interno para leer un header HTTP de forma type-safe.
 * Express puede retornar `string | string[] | undefined` para headers.
 * Para audit context solo nos interesa el primer valor (string) o
 * `undefined` si no está presente.
 */
function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}
