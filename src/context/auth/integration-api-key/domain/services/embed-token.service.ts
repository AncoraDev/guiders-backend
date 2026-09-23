/**
 * Servicio de dominio para emisión, validación, refresh y revocación
 * de tokens opacos de embed.
 *
 * Los tokens son opacos (256 bits, base64url) y se almacenan en Redis
 * bajo el namespace `embed:token:*` con TTL de 8h. NO se usa JWT —
 * la validación se hace contra el valor en Redis.
 *
 * Implementación: ver `RedisEmbedTokenService` en infrastructure/.
 */

import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  EmbedTokenData,
  EmbedTokenIssued,
} from '../value-objects/embed-token-data';

export interface IEmbedTokenService {
  /**
   * Genera un nuevo token opaco y lo almacena en Redis con TTL 8h.
   */
  createToken(
    companyId: string,
    userId: string,
    roles: string[],
  ): Promise<Result<EmbedTokenIssued, DomainError>>;

  /**
   * Recupera los datos de un token existente. Retorna err si no existe
   * o ha expirado.
   */
  validateToken(token: string): Promise<Result<EmbedTokenData, DomainError>>;

  /**
   * Genera un nuevo token para un token válido, eliminando el viejo
   * atómicamente.
   */
  refreshToken(token: string): Promise<Result<EmbedTokenIssued, DomainError>>;

  /**
   * Elimina el token de Redis. Idempotente.
   *
   * **Nota**: no distingue entre "el token existía y fue borrado" y "el
   * token no existía". Para distinguir (necesario para Story 2.3 logout
   * con cascading), usar `revokeTokenWithCount()` que retorna el número
   * de keys eliminadas.
   */
  revokeToken(token: string): Promise<Result<void, DomainError>>;

  /**
   * Como `revokeToken()` pero retorna el número de keys eliminadas:
   *   - 0 = token no existía (idempotente, ya fue revocado o nunca existió)
   *   - 1 = token existía y fue eliminado OK
   *   - err = Redis down o formato inválido
   *
   * Story 2.3 usa este método para detectar cascading parcial:
   *   - deleted=1 → cascadingResult='success'
   *   - deleted=0 → cascadingResult='partial' (race con refresh/revoke previo)
   */
  revokeTokenWithCount(
    token: string,
  ): Promise<Result<{ deleted: 0 | 1 }, DomainError>>;
}

export const EMBED_TOKEN_SERVICE = Symbol('EmbedTokenService');
