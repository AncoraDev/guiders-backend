import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import {
  CommercialConnectionDomainService,
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
} from '../../domain/commercial-connection.domain-service';
import { CommercialId } from '../../domain/value-objects/commercial-id';
import { CommercialConnectionStatus } from '../../domain/value-objects/commercial-connection-status';
import { CommercialLastActivity } from '../../domain/value-objects/commercial-last-activity';

/**
 * Implementación Redis del servicio de dominio de conexiones de comerciales
 * No se expone fuera de infraestructura; se inyecta mediante el símbolo
 */
@Injectable()
export class RedisCommercialConnectionDomainService
  implements CommercialConnectionDomainService, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    RedisCommercialConnectionDomainService.name,
  );
  private client: RedisClientType;
  private readonly TTL_SECONDS = 300; // 5 minutos por defecto
  private readonly TYPING_TTL_SECONDS = 3; // 3 segundos para typing indicator
  private readonly PREFIX_STATUS = 'commercial:status:'; // key -> status
  private readonly PREFIX_ACTIVITY = 'commercial:activity:'; // key -> timestamp
  private readonly PREFIX_TYPING = 'commercial:typing:'; // commercial:typing:{commercialId}:{chatId} -> timestamp
  private readonly SET_ONLINE = 'commercials:online';
  private readonly SET_AVAILABLE = 'commercials:available';
  private readonly SET_BUSY = 'commercials:busy';
  // Sets por tenant para filtrado eficiente O(1)
  private readonly PREFIX_SET_ONLINE = 'commercials:online:'; // + companyId
  private readonly PREFIX_SET_AVAILABLE = 'commercials:available:'; // + companyId
  // Key para recuperar companyId de un comercial (usada por el scheduler de inactividad)
  private readonly PREFIX_TENANT = 'commercial:tenant:'; // + commercialId → companyId

  async onModuleInit() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.client.on('error', (err) =>
      this.logger.error('Error en cliente Redis conexiones comerciales', err),
    );
    await this.client.connect();
    this.logger.log('Cliente Redis conexiones comerciales inicializado');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  private statusKey(commercialId: CommercialId): string {
    return `${this.PREFIX_STATUS}${commercialId.value}`;
  }

  private activityKey(commercialId: CommercialId): string {
    return `${this.PREFIX_ACTIVITY}${commercialId.value}`;
  }

  async setConnectionStatus(
    commercialId: CommercialId,
    connectionStatus: CommercialConnectionStatus,
    companyId?: string,
  ): Promise<void> {
    const statusKey = this.statusKey(commercialId);
    const status = connectionStatus.value;

    await this.client
      .multi()
      .set(statusKey, status)
      .expire(statusKey, this.TTL_SECONDS)
      .exec();

    // Remover de todos los sets globales para estado limpio
    await this.client.sRem(this.SET_ONLINE, commercialId.value);
    await this.client.sRem(this.SET_AVAILABLE, commercialId.value);
    await this.client.sRem(this.SET_BUSY, commercialId.value);

    // Remover de sets por tenant si se conoce el companyId
    if (companyId) {
      await this.client.sRem(
        `${this.PREFIX_SET_ONLINE}${companyId}`,
        commercialId.value,
      );
      await this.client.sRem(
        `${this.PREFIX_SET_AVAILABLE}${companyId}`,
        commercialId.value,
      );
      // Almacenar relación commercialId → companyId con TTL para uso del scheduler
      await this.client
        .multi()
        .set(`${this.PREFIX_TENANT}${commercialId.value}`, companyId)
        .expire(`${this.PREFIX_TENANT}${commercialId.value}`, this.TTL_SECONDS)
        .exec();
    }

    if (connectionStatus.isOnline()) {
      // Sets globales (retrocompatibilidad)
      await this.client.sAdd(this.SET_ONLINE, commercialId.value);
      await this.client.sAdd(this.SET_AVAILABLE, commercialId.value);
      // Sets por tenant
      if (companyId) {
        await this.client.sAdd(
          `${this.PREFIX_SET_ONLINE}${companyId}`,
          commercialId.value,
        );
        await this.client.sAdd(
          `${this.PREFIX_SET_AVAILABLE}${companyId}`,
          commercialId.value,
        );
      }
    } else if (connectionStatus.isBusy()) {
      // Sets globales (retrocompatibilidad)
      await this.client.sAdd(this.SET_ONLINE, commercialId.value);
      await this.client.sAdd(this.SET_BUSY, commercialId.value);
      // En busy: online pero NO disponible
      if (companyId) {
        await this.client.sAdd(
          `${this.PREFIX_SET_ONLINE}${companyId}`,
          commercialId.value,
        );
      }
    } else if (connectionStatus.isAway()) {
      // Sets globales (retrocompatibilidad)
      await this.client.sAdd(this.SET_ONLINE, commercialId.value);
      // En away: online pero NO disponible (no se añade a available)
      if (companyId) {
        await this.client.sAdd(
          `${this.PREFIX_SET_ONLINE}${companyId}`,
          commercialId.value,
        );
      }
    }
  }

  async getConnectionStatus(
    commercialId: CommercialId,
  ): Promise<CommercialConnectionStatus> {
    const raw = await this.client.get(this.statusKey(commercialId));
    if (!raw) return CommercialConnectionStatus.offline();

    if (raw === 'online') {
      return CommercialConnectionStatus.online();
    }
    if (raw === 'busy') {
      return CommercialConnectionStatus.busy();
    }
    if (raw === 'away') {
      return CommercialConnectionStatus.away();
    }
    return CommercialConnectionStatus.offline();
  }

  async updateLastActivity(
    commercialId: CommercialId,
    lastActivity: CommercialLastActivity,
  ): Promise<void> {
    const activityKey = this.activityKey(commercialId);
    const timestamp = lastActivity.value.getTime().toString();

    await this.client
      .multi()
      .set(activityKey, timestamp)
      .expire(activityKey, this.TTL_SECONDS)
      .exec();
  }

  /**
   * Renueva el plazo de quien sigue en Conectado. Si la clave ya no existe
   * o no está online, no lo vuelve a encender.
   */
  async renewOnlinePresence(
    commercialId: CommercialId,
    companyId?: string,
  ): Promise<boolean> {
    const status = await this.client.get(this.statusKey(commercialId));
    if (status !== 'online') {
      return false;
    }

    const multi = this.client.multi();
    multi.expire(this.statusKey(commercialId), this.TTL_SECONDS);
    multi.expire(this.activityKey(commercialId), this.TTL_SECONDS);
    multi.sAdd(this.SET_ONLINE, commercialId.value);
    multi.sAdd(this.SET_AVAILABLE, commercialId.value);
    if (companyId) {
      multi.expire(
        `${this.PREFIX_TENANT}${commercialId.value}`,
        this.TTL_SECONDS,
      );
      multi.sAdd(`${this.PREFIX_SET_ONLINE}${companyId}`, commercialId.value);
      multi.sAdd(
        `${this.PREFIX_SET_AVAILABLE}${companyId}`,
        commercialId.value,
      );
    }
    await multi.exec();
    return true;
  }

  async getLastActivity(
    commercialId: CommercialId,
  ): Promise<CommercialLastActivity> {
    const raw = await this.client.get(this.activityKey(commercialId));
    if (!raw) return CommercialLastActivity.now();

    const timestamp = parseInt(raw, 10);
    return new CommercialLastActivity(new Date(timestamp));
  }

  async removeConnection(
    commercialId: CommercialId,
    companyId?: string,
  ): Promise<void> {
    await this.client.del(this.statusKey(commercialId));
    await this.client.del(this.activityKey(commercialId));
    // Limpiar sets globales
    await this.client.sRem(this.SET_ONLINE, commercialId.value);
    await this.client.sRem(this.SET_AVAILABLE, commercialId.value);
    await this.client.sRem(this.SET_BUSY, commercialId.value);
    // Limpiar sets por tenant si se conoce el companyId
    if (companyId) {
      await this.client.sRem(
        `${this.PREFIX_SET_ONLINE}${companyId}`,
        commercialId.value,
      );
      await this.client.sRem(
        `${this.PREFIX_SET_AVAILABLE}${companyId}`,
        commercialId.value,
      );
      await this.client.del(`${this.PREFIX_TENANT}${commercialId.value}`);
    }
  }

  async isCommercialOnline(commercialId: CommercialId): Promise<boolean> {
    const status = await this.getConnectionStatus(commercialId);
    return status.isOnline() || status.isBusy();
  }

  async isCommercialActive(
    commercialId: CommercialId,
    timeoutMinutes: number = 5,
  ): Promise<boolean> {
    const lastActivity = await this.getLastActivity(commercialId);
    return !lastActivity.isExpired(timeoutMinutes);
  }

  async getOnlineCommercials(): Promise<CommercialId[]> {
    const members = await this.client.sMembers(this.SET_ONLINE);
    const validCommercials: CommercialId[] = [];

    // Validar que cada comercial en el set realmente tenga su key de status activa
    for (const id of members) {
      const statusKey = `${this.PREFIX_STATUS}${id}`;
      const exists = await this.client.exists(statusKey);

      if (exists) {
        validCommercials.push(new CommercialId(id));
      } else {
        // Key expiró, limpiar del set
        this.logger.warn(
          `Comercial ${id} encontrado en SET_ONLINE pero sin key de status. Limpiando...`,
        );
        await this.client.sRem(this.SET_ONLINE, id);
        await this.client.sRem(this.SET_AVAILABLE, id);
        await this.client.sRem(this.SET_BUSY, id);
      }
    }

    return validCommercials;
  }

  async getAvailableCommercials(companyId?: string): Promise<CommercialId[]> {
    // Si se proporciona companyId, usar el set por tenant (filtrado correcto)
    const setKey = companyId
      ? `${this.PREFIX_SET_AVAILABLE}${companyId}`
      : this.SET_AVAILABLE;

    const members = await this.client.sMembers(setKey);
    const validCommercials: CommercialId[] = [];

    // Validar que cada comercial en el set realmente tenga su key de status activa
    // Esto limpia automáticamente comerciales cuyas keys expiraron por falta de heartbeat
    for (const id of members) {
      const statusKey = `${this.PREFIX_STATUS}${id}`;
      const exists = await this.client.exists(statusKey);

      if (exists) {
        validCommercials.push(new CommercialId(id));
      } else {
        // Key expiró, limpiar del set
        this.logger.warn(
          `Comercial ${id} encontrado en set pero sin key de status. Limpiando...`,
        );
        await this.client.sRem(setKey, id);
        // Limpiar también del set global si aplica
        if (companyId) {
          await this.client.sRem(this.SET_AVAILABLE, id);
          await this.client.sRem(this.SET_ONLINE, id);
          await this.client.sRem(this.SET_BUSY, id);
        } else {
          await this.client.sRem(this.SET_ONLINE, id);
          await this.client.sRem(this.SET_BUSY, id);
        }
      }
    }

    return validCommercials;
  }

  async getOnlineCountByTenant(companyId: string): Promise<number> {
    // SCARD es O(1) en Redis — ideal para emisión de eventos WS en tiempo real
    return this.client.sCard(`${this.PREFIX_SET_AVAILABLE}${companyId}`);
  }

  async getCompanyIdByCommercial(
    commercialId: CommercialId,
  ): Promise<string | undefined> {
    const value = await this.client.get(
      `${this.PREFIX_TENANT}${commercialId.value}`,
    );
    return value ?? undefined;
  }

  async getBusyCommercials(): Promise<CommercialId[]> {
    const members = await this.client.sMembers(this.SET_BUSY);
    const validCommercials: CommercialId[] = [];

    // Validar que cada comercial en el set realmente tenga su key de status activa
    for (const id of members) {
      const statusKey = `${this.PREFIX_STATUS}${id}`;
      const exists = await this.client.exists(statusKey);

      if (exists) {
        validCommercials.push(new CommercialId(id));
      } else {
        // Key expiró, limpiar del set
        this.logger.warn(
          `Comercial ${id} encontrado en SET_BUSY pero sin key de status. Limpiando...`,
        );
        await this.client.sRem(this.SET_BUSY, id);
        await this.client.sRem(this.SET_ONLINE, id);
        await this.client.sRem(this.SET_AVAILABLE, id);
      }
    }

    return validCommercials;
  }

  async getActiveCommercials(
    timeoutMinutes: number = 5,
  ): Promise<CommercialId[]> {
    const onlineCommercials = await this.getOnlineCommercials();
    const activeCommercials: CommercialId[] = [];

    for (const commercialId of onlineCommercials) {
      if (await this.isCommercialActive(commercialId, timeoutMinutes)) {
        activeCommercials.push(commercialId);
      }
    }

    return activeCommercials;
  }

  private typingKey(commercialId: CommercialId, chatId: string): string {
    return `${this.PREFIX_TYPING}${commercialId.value}:${chatId}`;
  }

  async setTyping(commercialId: CommercialId, chatId: string): Promise<void> {
    const key = this.typingKey(commercialId, chatId);
    const timestamp = Date.now().toString();

    await this.client
      .multi()
      .set(key, timestamp)
      .expire(key, this.TYPING_TTL_SECONDS)
      .exec();

    this.logger.debug(
      `Comercial ${commercialId.value} está escribiendo en chat ${chatId}`,
    );
  }

  async isTyping(commercialId: CommercialId, chatId: string): Promise<boolean> {
    const key = this.typingKey(commercialId, chatId);
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async clearTyping(commercialId: CommercialId, chatId: string): Promise<void> {
    const key = this.typingKey(commercialId, chatId);
    await this.client.del(key);
    this.logger.debug(
      `Comercial ${commercialId.value} dejó de escribir en chat ${chatId}`,
    );
  }

  async getTypingInChat(chatId: string): Promise<CommercialId[]> {
    // Buscar todas las keys que coincidan con el patrón: commercial:typing:*:{chatId}
    const pattern = `${this.PREFIX_TYPING}*:${chatId}`;
    const keys = await this.client.keys(pattern);

    const typingCommercials: CommercialId[] = [];
    for (const key of keys) {
      // Extraer el commercialId del key
      // Format: commercial:typing:{commercialId}:{chatId}
      const parts = key.replace(this.PREFIX_TYPING, '').split(':');
      if (parts.length === 2) {
        const commercialIdValue = parts[0];
        typingCommercials.push(new CommercialId(commercialIdValue));
      }
    }

    return typingCommercials;
  }
}

/**
 * Provider para inyección de dependencias
 */
export const COMMERCIAL_CONNECTION_SERVICE_PROVIDER = {
  provide: COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  useClass: RedisCommercialConnectionDomainService,
};
