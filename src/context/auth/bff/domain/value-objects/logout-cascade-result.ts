/**
 * Resultado de una operación de logout con revocación en cascada.
 *
 * Story 2.3: cuando el iframe llama a `POST /bff/auth/logout`, el servidor
 * intenta borrar 2 cosas:
 *  1. La BFF session (`bff:session:<sessionId>`)
 *  2. El embed token padre (`embed:token:<embedTokenRef>`)
 *
 * El resultado se clasifica en una de 4 categorías para que el audit
 * log pueda registrar el outcome exacto y soporte pueda alertar sobre
 * anomalías (e.g., partial = race condition entre logout y refresh).
 */

export enum LogoutCascadeResult {
  /**
   * Ambos Redis DELs retornaron 1 (existed and was deleted).
   * Caso normal de logout.
   */
  SUCCESS = 'SUCCESS',

  /**
   * BFF session borrada OK, pero el embed token ya no existía
   * (race condition: refresh o revoke previo).
   * Se considera OK para el cliente, pero se registra en audit
   * con `failureDetail: 'token already revoked'` para investigación.
   */
  PARTIAL = 'PARTIAL',

  /**
   * La BFF session no existía en el momento del logout (idempotencia).
   * Puede ser una segunda llamada a logout o sesión expirada.
   * Se considera OK (idempotente), pero se registra en audit con
   * `EMBED_SESSION_NOT_FOUND`.
   */
  NOT_FOUND = 'NOT_FOUND',

  /**
   * Error de Redis u otro fallo irrecuperable. NO se completó la
   * revocación. Se retorna 503 al cliente.
   */
  FAILURE = 'FAILURE',
}

/**
 * Value object inmutable que encapsula el resultado del cascade.
 * Usado en el handler para retornar al controller y para emitir
 * al audit log con `toJSON()`.
 */
export class LogoutCascadeResultValue {
  private constructor(public readonly value: LogoutCascadeResult) {}

  static success(): LogoutCascadeResultValue {
    return new LogoutCascadeResultValue(LogoutCascadeResult.SUCCESS);
  }

  static partial(): LogoutCascadeResultValue {
    return new LogoutCascadeResultValue(LogoutCascadeResult.PARTIAL);
  }

  static notFound(): LogoutCascadeResultValue {
    return new LogoutCascadeResultValue(LogoutCascadeResult.NOT_FOUND);
  }

  static failure(): LogoutCascadeResultValue {
    return new LogoutCascadeResultValue(LogoutCascadeResult.FAILURE);
  }

  /**
   * Serializa a string lowercase para el audit log (MongoDB storage
   * + API response). Mapping:
   *   SUCCESS   → 'success'
   *   PARTIAL   → 'partial'
   *   NOT_FOUND → 'not_found'
   *   FAILURE   → 'failure'
   */
  toJSON(): 'success' | 'partial' | 'not_found' | 'failure' {
    switch (this.value) {
      case LogoutCascadeResult.SUCCESS:
        return 'success';
      case LogoutCascadeResult.PARTIAL:
        return 'partial';
      case LogoutCascadeResult.NOT_FOUND:
        return 'not_found';
      case LogoutCascadeResult.FAILURE:
        return 'failure';
    }
  }

  equals(other: LogoutCascadeResultValue): boolean {
    return this.value === other.value;
  }
}
