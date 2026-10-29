import { CommercialId } from './value-objects/commercial-id';
import { CommercialConnectionStatus } from './value-objects/commercial-connection-status';
import { CommercialLastActivity } from './value-objects/commercial-last-activity';

/**
 * Interfaz del domain service para gestionar conexiones de comerciales
 * Esta abstracción permite que el dominio interactúe con la infraestructura de conexiones
 * sin conocer los detalles de implementación (Redis, etc.)
 */
export interface CommercialConnectionDomainService {
  /**
   * Establece o actualiza el estado de conexión de un comercial
   * @param companyId - Identificador de la empresa del comercial (para filtrado por tenant en Redis)
   */
  setConnectionStatus(
    commercialId: CommercialId,
    connectionStatus: CommercialConnectionStatus,
    companyId?: string,
  ): Promise<void>;

  /**
   * Obtiene el estado actual de conexión de un comercial
   */
  getConnectionStatus(
    commercialId: CommercialId,
  ): Promise<CommercialConnectionStatus>;

  /**
   * Actualiza la última actividad de un comercial (heartbeat)
   */
  updateLastActivity(
    commercialId: CommercialId,
    lastActivity: CommercialLastActivity,
  ): Promise<void>;

  /**
   * Alarga la presencia de quien ya está en Conectado.
   * No enciende a quien está desconectado.
   */
  renewOnlinePresence(
    commercialId: CommercialId,
    companyId?: string,
  ): Promise<boolean>;

  /**
   * Obtiene la última actividad de un comercial
   */
  getLastActivity(commercialId: CommercialId): Promise<CommercialLastActivity>;

  /**
   * Elimina el registro de conexión de un comercial (cuando se desconecta definitivamente)
   * @param companyId - Identificador de la empresa, para limpiar sets por tenant
   */
  removeConnection(
    commercialId: CommercialId,
    companyId?: string,
  ): Promise<void>;

  /**
   * Verifica si un comercial está actualmente online
   */
  isCommercialOnline(commercialId: CommercialId): Promise<boolean>;

  /**
   * Verifica si un comercial está activo (no expirado según timeout)
   */
  isCommercialActive(
    commercialId: CommercialId,
    timeoutMinutes?: number,
  ): Promise<boolean>;

  /**
   * Obtiene todos los comerciales que están online
   */
  getOnlineCommercials(): Promise<CommercialId[]>;

  /**
   * Comerciales online o ocupados de una empresa.
   * Away y offline no cuentan: no pueden cubrir un chat ajeno.
   */
  listConnectedByCompany(companyId: string): Promise<CommercialId[]>;

  /**
   * Obtiene todos los comerciales que están disponibles (online y no busy)
   * @param companyId - Si se proporciona, filtra por tenant. Sin él, devuelve todos (uso interno).
   */
  getAvailableCommercials(companyId?: string): Promise<CommercialId[]>;

  /**
   * Obtiene el número de comerciales disponibles para un tenant específico
   * Operación O(1) usando SCARD en Redis — optimizada para emisión de eventos WS
   */
  getOnlineCountByTenant(companyId: string): Promise<number>;

  /**
   * Recupera el companyId asociado a un comercial desde la key de tenant en Redis
   * Útil para el scheduler de inactividad, que no tiene el JWT del comercial
   * Devuelve undefined si la key expiró (comercial inactivo mucho tiempo)
   */
  getCompanyIdByCommercial(
    commercialId: CommercialId,
  ): Promise<string | undefined>;

  /**
   * Obtiene todos los comerciales que están ocupados (busy)
   */
  getBusyCommercials(): Promise<CommercialId[]>;

  /**
   * Obtiene todos los comerciales activos (considerando timeout)
   */
  getActiveCommercials(timeoutMinutes?: number): Promise<CommercialId[]>;

  /**
   * Establece que un comercial está escribiendo en un chat
   */
  setTyping(commercialId: CommercialId, chatId: string): Promise<void>;

  /**
   * Obtiene si un comercial está escribiendo en un chat
   */
  isTyping(commercialId: CommercialId, chatId: string): Promise<boolean>;

  /**
   * Limpia el estado de "escribiendo" de un comercial en un chat
   */
  clearTyping(commercialId: CommercialId, chatId: string): Promise<void>;

  /**
   * Obtiene todos los comerciales que están escribiendo en un chat
   */
  getTypingInChat(chatId: string): Promise<CommercialId[]>;
}

/**
 * Símbolo para inyección de dependencias
 */
export const COMMERCIAL_CONNECTION_DOMAIN_SERVICE = Symbol(
  'CommercialConnectionDomainService',
);
