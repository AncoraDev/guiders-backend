import { DomainError } from 'src/context/shared/domain/domain.error';

/**
 * Error: Integración CRM no configurada para la empresa
 */
export class CrmNotConfiguredError extends DomainError {
  constructor(companyId: string, crmType?: string) {
    const crmInfo = crmType ? ` (${crmType})` : '';
    super(
      `No hay integración CRM${crmInfo} configurada para la empresa ${companyId}`,
    );
  }
}

/**
 * Error: Integración CRM deshabilitada para la empresa
 */
export class CrmDisabledError extends DomainError {
  constructor(companyId: string, crmType: string) {
    super(
      `La integración con ${crmType} está deshabilitada para la empresa ${companyId}`,
    );
  }
}

/**
 * Error: Tipo de CRM no soportado
 */
export class CrmTypeNotSupportedError extends DomainError {
  constructor(crmType: string) {
    super(`El tipo de CRM '${crmType}' no está soportado`);
  }
}

/**
 * Error: Fallo en la API del CRM
 */
export class CrmApiError extends DomainError {
  constructor(
    crmType: string,
    message: string,
    public readonly statusCode?: number,
    public readonly apiResponse?: unknown,
    public readonly endpoint?: string,
  ) {
    super(`Error en API ${crmType}: ${message}`);
  }
}

/**
 * Error: Fallo en la sincronización del lead
 */
export class LeadSyncFailedError extends DomainError {
  constructor(visitorId: string, crmType: string, reason: string) {
    super(
      `Error al sincronizar visitante ${visitorId} con ${crmType}: ${reason}`,
    );
  }
}

/**
 * Error: Lead ya sincronizado con el CRM
 */
export class LeadAlreadySyncedError extends DomainError {
  constructor(visitorId: string, crmType: string, externalLeadId: string) {
    super(
      `El visitante ${visitorId} ya está sincronizado con ${crmType} (ID externo: ${externalLeadId})`,
    );
  }
}

/**
 * Error: Datos de contacto no disponibles
 */
export class LeadContactDataNotFoundError extends DomainError {
  constructor(visitorId: string) {
    super(
      `No hay datos de contacto disponibles para el visitante ${visitorId}`,
    );
  }
}

/**
 * Error: Datos de contacto incompletos para sincronización
 */
export class LeadContactDataIncompleteError extends DomainError {
  constructor(visitorId: string, missingFields: string[]) {
    super(
      `Datos de contacto incompletos para visitante ${visitorId}. Faltan: ${missingFields.join(', ')}`,
    );
  }
}

/**
 * Error: Registro de sincronización no encontrado
 */
export class CrmSyncRecordNotFoundError extends DomainError {
  constructor(visitorId: string, crmType?: string) {
    const crmInfo = crmType ? ` con ${crmType}` : '';
    super(
      `No existe registro de sincronización${crmInfo} para el visitante ${visitorId}`,
    );
  }
}

/**
 * Error: Chat ya sincronizado con el CRM
 */
export class ChatAlreadySyncedError extends DomainError {
  constructor(chatId: string, crmType: string) {
    super(`El chat ${chatId} ya ha sido sincronizado con ${crmType}`);
  }
}

/**
 * Error: Configuración de CRM inválida
 */
export class CrmConfigInvalidError extends DomainError {
  constructor(crmType: string, reason: string) {
    super(`Configuración de ${crmType} inválida: ${reason}`);
  }
}

/**
 * Error de persistencia del contexto leads
 */
export class LeadsPersistenceError extends DomainError {
  constructor(message: string) {
    super(`Error de persistencia en leads: ${message}`);
  }
}

/**
 * Error: Configuración de empresa no encontrada
 */
export class CrmCompanyConfigNotFoundError extends DomainError {
  constructor(companyId: string, crmType?: string) {
    const crmInfo = crmType ? ` para ${crmType}` : '';
    super(`No existe configuración CRM${crmInfo} para la empresa ${companyId}`);
  }
}

/**
 * Error: Fallo en la sincronización del chat
 */
export class ChatSyncFailedError extends DomainError {
  constructor(chatId: string, crmType: string, reason: string) {
    super(`Error al sincronizar chat ${chatId} con ${crmType}: ${reason}`);
  }
}

/**
 * Error: Visitor no existe
 */
export class VisitorNotFoundError extends DomainError {
  constructor(visitorId: string) {
    super(`El visitor ${visitorId} no existe`);
  }
}
