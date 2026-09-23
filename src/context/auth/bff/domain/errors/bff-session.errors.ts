import { DomainError } from 'src/context/shared/domain/domain.error';

/**
 * Interfaz de marcador para todos los errores del BffSessionService.
 * Permite checks de tipo polimórficos (`error satisfies IBffSessionServiceError`).
 */
export interface IBffSessionServiceError {
  readonly code: string;
  readonly statusCode: number;
}

/**
 * Error base del BffSessionService. Es la raíz de la jerarquía
 * (los errores específicos heredan de este). HTTP 500.
 *
 * Se usa también como fallback para errores de validación de inputs
 * (userId vacío, roles > 64, JSON > 8KB) que no son bugs del
 * cliente sino del caller.
 */
export class BffSessionError
  extends DomainError
  implements IBffSessionServiceError
{
  public readonly code: string = 'BFF_SESSION_ERROR';
  public readonly statusCode: number = 500;

  constructor(message: string) {
    super(message);
  }
}

/**
 * El sessionId no es base64url de 43 chars. NO es un "no encontrado"
 * legítimo: el caller envió basura. HTTP 400.
 */
export class BffSessionInvalidFormatError extends BffSessionError {
  public readonly code = 'BFF_SESSION_INVALID_FORMAT';
  public readonly statusCode = 400;

  constructor() {
    super(
      'BFF session ID con formato inválido (debe ser base64url de 43 chars)',
    );
  }
}

/**
 * La session no existe en Redis (expirada, revocada, o nunca emitida).
 * HTTP 401.
 */
export class BffSessionNotFoundError extends BffSessionError {
  public readonly code = 'BFF_SESSION_NOT_FOUND';
  public readonly statusCode = 401;

  constructor(sessionIdPrefix?: string) {
    super(
      sessionIdPrefix
        ? `BFF session no encontrada o expirada: ${sessionIdPrefix}`
        : 'BFF session no encontrada o expirada',
    );
  }
}

/**
 * El VALUE en Redis existe pero no es un BffSessionData válido
 * (JSON corrupto, campos faltantes, tipos incorrectos). Indice de
 * corrupción o bug de serialización. HTTP 500 (incidente, no leak).
 */
export class BffSessionCorruptedError extends BffSessionError {
  public readonly code = 'BFF_SESSION_CORRUPTED';
  public readonly statusCode = 500;

  constructor() {
    super('BFF session corrupta (JSON no conforme al esquema esperado)');
  }
}

/**
 * Redis no responde o tira excepción. HTTP 503 — el cliente puede reintentar.
 */
export class BffSessionServiceUnavailableError extends BffSessionError {
  public readonly code = 'BFF_SESSION_SERVICE_UNAVAILABLE';
  public readonly statusCode = 503;

  constructor(
    message: string = 'BFF session service temporalmente no disponible',
  ) {
    super(message);
  }
}

/**
 * El userId/companyId del body no coincide con el del token.
 * Es defense-in-depth: el body es opcional y solo se chequea si está
 * presente. HTTP 403.
 */
export class EmbedBodyTokenMismatchError extends DomainError {
  public readonly code = 'EMBED_BODY_TOKEN_MISMATCH';
  public readonly statusCode = 403;

  constructor() {
    super('El userId/companyId del body no coincide con el del token');
  }
}
