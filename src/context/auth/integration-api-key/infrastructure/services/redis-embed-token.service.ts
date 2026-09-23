/**
 * Implementación Redis del EmbedTokenService.
 *
 * Storage:
 * - Key:   `embed:token:<token>` (256-bit base64url, 43 chars)
 * - Value: JSON { userId, companyId, roles[], createdAt, refreshedAt? }
 * - TTL:   8h (28800 segundos) — sliding window en refresh
 *
 * El cliente Redis se inicializa en onModuleInit y se libera en
 * onModuleDestroy. Sigue el patrón establecido por
 * `redis-visitor-connection.domain-service.ts`.
 */

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { randomBytes } from 'crypto';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { IEmbedTokenService } from '../../domain/services/embed-token.service';
import {
  EmbedTokenNotFoundError,
  EmbedTokenError,
  EmbedTokenCorruptedError,
  EmbedTokenInvalidFormatError,
} from '../../domain/errors/embed-token.errors';
import {
  EmbedTokenData,
  EmbedTokenIssued,
} from '../../domain/value-objects/embed-token-data';

const BASE64URL_REGEX = /^[A-Za-z0-9_-]{43}$/;
const MAX_ROLES = 64;
const MAX_STRING_LENGTH = 256;
const MAX_JSON_LENGTH = 8 * 1024; // 8KB

/**
 * Lua script: refresca un token atómicamente en el lado servidor.
 *
 * - KEYS[1] = old token key
 * - KEYS[2] = new token key
 * - ARGV[1] = new token JSON value
 * - ARGV[2] = TTL seconds
 *
 * Si old key no existe → retorna -1 (caller retorna NotFoundError)
 * Si new key ya existe → retorna -2 (colisión 256-bit, prácticamente 0)
 * Si éxito → retorna 1
 *
 * Garantiza: el ciclo GETDEL + SET EX es atómico, sin orphan tokens
 * ni race windows.
 */
const REFRESH_LUA = `
local oldVal = redis.call('GET', KEYS[1])
if not oldVal then
  return -1
end
local newExists = redis.call('EXISTS', KEYS[2])
if newExists == 1 then
  return -2
end
redis.call('DEL', KEYS[1])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
return 1
`;

@Injectable()
export class RedisEmbedTokenService
  implements IEmbedTokenService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisEmbedTokenService.name);
  // Non-null after onModuleInit(). The `!` is safe because:
  // - NestJS calls onModuleInit() before any other lifecycle hook
  // - internalSetClient() is the only path that sets it pre-init (tests only)
  private client!: RedisClientType;

  private readonly PREFIX = 'embed:token:';
  private readonly TTL_SECONDS = 8 * 60 * 60; // 8 horas
  private readonly TOKEN_BYTES = 32; // 256 bits

  /**
   * @param clientOverride Redis client to use instead of creating one. **@internal**
   *   Solo para tests. En producción NestJS no inyecta este parámetro —
   *   `this.client` se crea en `onModuleInit`.
   */
  /**
   * @internal Only for unit tests. Production code MUST NOT call this.
   * In production, the Redis client is created in `onModuleInit()` from
   * `REDIS_URL`. The optional setter exists because unit tests need to
   * inject an `InMemoryRedisClient` mock — passing it through the
   * constructor would break NestJS DI (parameter has no `@Inject()` token).
   */
  internalSetClient(client: RedisClientType): void {
    this.client = client;
  }

  async onModuleInit(): Promise<void> {
    if (this.client) {
      return;
    }
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => Math.min(retries * 50, 2000),
      },
    });
    this.client.on('error', (err) =>
      this.logger.error('Error en cliente Redis embed tokens', err),
    );
    await this.client.connect();
    this.logger.log('Cliente Redis embed tokens inicializado');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error desconocido';
        this.logger.warn(`Error al cerrar cliente Redis embed: ${message}`);
      }
      this.client = undefined as unknown as RedisClientType;
    }
  }

  private key(token: string): string {
    return `${this.PREFIX}${token}`;
  }

  private isValidInput(
    companyId: string,
    userId: string,
    roles: string[],
  ): boolean {
    return (
      typeof companyId === 'string' &&
      companyId.length > 0 &&
      companyId.length <= MAX_STRING_LENGTH &&
      typeof userId === 'string' &&
      userId.length > 0 &&
      userId.length <= MAX_STRING_LENGTH &&
      Array.isArray(roles) &&
      roles.length > 0 &&
      roles.length <= MAX_ROLES &&
      roles.every(
        (r) =>
          typeof r === 'string' &&
          r.length > 0 &&
          r.length <= MAX_STRING_LENGTH,
      )
    );
  }

  private isValidTokenData(data: unknown): data is EmbedTokenData {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      typeof d.userId === 'string' &&
      d.userId.length > 0 &&
      typeof d.companyId === 'string' &&
      d.companyId.length > 0 &&
      Array.isArray(d.roles) &&
      d.roles.every((r) => typeof r === 'string') &&
      typeof d.createdAt === 'string'
    );
  }

  async createToken(
    companyId: string,
    userId: string,
    roles: string[],
  ): Promise<Result<EmbedTokenIssued, DomainError>> {
    if (!this.isValidInput(companyId, userId, roles)) {
      return err(
        new EmbedTokenError(
          'companyId, userId y roles son requeridos y deben cumplir límites de tamaño',
        ),
      );
    }

    try {
      const token = randomBytes(this.TOKEN_BYTES).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.TTL_SECONDS * 1000);

      const data: EmbedTokenData = {
        userId,
        companyId,
        roles,
        createdAt: now.toISOString(),
      };

      const json = JSON.stringify(data);
      if (json.length > MAX_JSON_LENGTH) {
        return err(
          new EmbedTokenError(
            `El JSON serializado excede el límite de ${MAX_JSON_LENGTH} bytes`,
          ),
        );
      }

      await this.client.set(this.key(token), json, {
        EX: this.TTL_SECONDS,
      });

      this.logger.debug(
        `Embed token emitido: companyId=${companyId} userId=${userId} prefix=${token.substring(0, 8)}...`,
      );

      return ok({
        token,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al crear embed token: ${message}`);
      return err(new EmbedTokenError(`Error al crear embed token: ${message}`));
    }
  }

  async validateToken(
    token: string,
  ): Promise<Result<EmbedTokenData, DomainError>> {
    if (typeof token !== 'string' || !BASE64URL_REGEX.test(token)) {
      return err(new EmbedTokenInvalidFormatError());
    }

    try {
      const raw = await this.client.get(this.key(token));
      if (!raw) {
        return err(new EmbedTokenNotFoundError(token.substring(0, 8)));
      }

      const parsed: unknown = JSON.parse(raw);
      if (!this.isValidTokenData(parsed)) {
        this.logger.warn(
          `Embed token corrupto detectado: ${token.substring(0, 8)}...`,
        );
        return err(new EmbedTokenCorruptedError());
      }

      return ok(parsed);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al validar embed token: ${message}`);
      return err(
        new EmbedTokenError(`Error al validar embed token: ${message}`),
      );
    }
  }

  async refreshToken(
    oldToken: string,
  ): Promise<Result<EmbedTokenIssued, DomainError>> {
    if (typeof oldToken !== 'string' || !BASE64URL_REGEX.test(oldToken)) {
      return err(new EmbedTokenInvalidFormatError());
    }

    const oldData = await this.validateToken(oldToken);
    if (oldData.isErr()) {
      return err(oldData.error);
    }

    const old = oldData.unwrap();
    try {
      const newToken = randomBytes(this.TOKEN_BYTES).toString('base64url');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.TTL_SECONDS * 1000);

      const newData: EmbedTokenData = {
        userId: old.userId,
        companyId: old.companyId,
        roles: old.roles,
        createdAt: old.createdAt, // Preserve original session start
        refreshedAt: now.toISOString(),
      };

      const json = JSON.stringify(newData);
      if (json.length > MAX_JSON_LENGTH) {
        return err(
          new EmbedTokenError(
            `El JSON serializado excede el límite de ${MAX_JSON_LENGTH} bytes`,
          ),
        );
      }

      const result = (await this.client.eval(REFRESH_LUA, {
        keys: [this.key(oldToken), this.key(newToken)],
        arguments: [json, String(this.TTL_SECONDS)],
      })) as number;

      if (result === -1) {
        return err(new EmbedTokenNotFoundError(oldToken.substring(0, 8)));
      }
      if (result === -2) {
        return err(
          new EmbedTokenError(
            'Colisión de token detectada (probabilidad < 2^-256). Reintentar.',
          ),
        );
      }

      this.logger.debug(
        `Embed token refrescado: ${oldToken.substring(0, 8)}... → ${newToken.substring(0, 8)}...`,
      );

      return ok({
        token: newToken,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al refrescar embed token: ${message}`);
      return err(
        new EmbedTokenError(`Error al refrescar embed token: ${message}`),
      );
    }
  }

  async revokeToken(token: string): Promise<Result<void, DomainError>> {
    const result = await this.revokeTokenWithCount(token);
    if (result.isErr()) {
      return err(result.error);
    }
    return ok(undefined);
  }

  async revokeTokenWithCount(
    token: string,
  ): Promise<Result<{ deleted: 0 | 1 }, DomainError>> {
    if (typeof token !== 'string' || !BASE64URL_REGEX.test(token)) {
      // Formato inválido: tratado como "ya no existe" (idempotente).
      // Retorna deleted=0 para que el caller pueda distinguir.
      return ok({ deleted: 0 });
    }

    try {
      const deleted = await this.client.del(this.key(token));
      if (deleted > 0) {
        this.logger.debug(`Embed token revocado: ${token.substring(0, 8)}...`);
        return ok({ deleted: 1 });
      }
      this.logger.debug(
        `Embed token revoke idempotente (no estaba en Redis): ${token.substring(0, 8)}...`,
      );
      return ok({ deleted: 0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al revocar embed token: ${message}`);
      return err(
        new EmbedTokenError(`Error al revocar embed token: ${message}`),
      );
    }
  }
}
