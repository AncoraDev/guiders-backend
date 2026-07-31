import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

/**
 * Tipos de CRM soportados
 */
export type CrmType = 'leadcars' | 'hubspot' | 'salesforce';

/**
 * Datos de contacto del lead para sincronización
 */
export interface LeadContactDataPrimitives {
  id: string;
  visitorId: string;
  companyId: string;
  /** Alias interno para identificar al lead en consola */
  alias?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  dni?: string;
  poblacion?: string;
  additionalData?: Record<string, unknown>;
  extractedFromChatId?: string;
  extractedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Configuración de empresa para CRM
 */
export interface CrmCompanyConfigPrimitives {
  id: string;
  companyId: string;
  crmType: CrmType;
  enabled: boolean;
  syncChatConversations: boolean;
  triggerEvents: string[];
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mensaje de chat para sincronización
 */
export interface ChatMessageForSync {
  content: string;
  senderType: 'visitor' | 'commercial' | 'bot' | 'system';
  sentAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Datos del chat para sincronización
 */
export interface ChatSyncData {
  chatId: string;
  visitorId: string;
  companyId: string;
  messages: ChatMessageForSync[];
  startedAt: Date;
  closedAt?: Date;
  summary?: string;
}

/**
 * Resultado de sincronización de lead
 */
export interface SyncLeadResult {
  externalLeadId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Interface genérica para servicios de sincronización con CRM
 * Cada adapter (LeadCars, HubSpot, etc.) debe implementar esta interface
 */
export interface ICrmSyncService {
  /**
   * Tipo de CRM que implementa este servicio
   */
  readonly crmType: CrmType;

  /**
   * Sincroniza un lead con el CRM externo
   * @param contactData Datos de contacto del lead
   * @param config Configuración de la empresa para este CRM
   * @returns Resultado con el ID externo del lead creado
   */
  syncLead(
    contactData: LeadContactDataPrimitives,
    config: CrmCompanyConfigPrimitives,
  ): Promise<Result<SyncLeadResult, DomainError>>;

  /**
   * Sincroniza una conversación de chat con el CRM
   * @param externalLeadId ID del lead en el CRM externo
   * @param chatData Datos del chat a sincronizar
   * @param config Configuración de la empresa para este CRM
   */
  syncChat(
    externalLeadId: string,
    chatData: ChatSyncData,
    config: CrmCompanyConfigPrimitives,
  ): Promise<Result<void, DomainError>>;

  /**
   * Verifica la conexión con el CRM
   * @param config Configuración a verificar
   * @returns true si la conexión es válida
   */
  testConnection(
    config: CrmCompanyConfigPrimitives,
  ): Promise<Result<boolean, DomainError>>;

  /**
   * Valida que la configuración tiene todos los campos requeridos
   * @param config Configuración a validar
   * @returns Lista de errores de validación (vacía si es válida)
   */
  validateConfig(config: CrmCompanyConfigPrimitives): string[];
}

/**
 * Symbol para inyección de dependencias del servicio de sincronización
 */
export const CRM_SYNC_SERVICE = Symbol('ICrmSyncService');

/**
 * Factory para obtener el adapter correcto según el tipo de CRM
 */
export interface ICrmSyncServiceFactory {
  /**
   * Obtiene el adapter de CRM para el tipo especificado
   * @param crmType Tipo de CRM
   * @returns Adapter que implementa ICrmSyncService o null si no existe
   */
  getAdapter(crmType: CrmType): ICrmSyncService | null;

  /**
   * Verifica si un tipo de CRM está soportado
   * @param crmType Tipo de CRM a verificar
   */
  isSupported(crmType: CrmType): boolean;

  /**
   * Obtiene la lista de tipos de CRM soportados
   */
  getSupportedTypes(): CrmType[];

  /**
   * Alias para getSupportedTypes (conveniencia para controllers)
   */
  getSupportedCrmTypes(): CrmType[];
}

/**
 * Symbol para inyección del factory de servicios CRM
 */
export const CRM_SYNC_SERVICE_FACTORY = Symbol('ICrmSyncServiceFactory');
