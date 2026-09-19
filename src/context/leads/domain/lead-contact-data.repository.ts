import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { LeadContactDataPrimitives } from './services/crm-sync.service';
import { LeadFollowUpStatus } from './lead-follow-up';

export interface LeadContactListFilters {
  source?: 'assistant' | 'manual';
  status?: LeadFollowUpStatus;
}

/**
 * Interface del repositorio de datos de contacto de leads
 */
export interface ILeadContactDataRepository {
  /**
   * Guarda nuevos datos de contacto
   */
  save(data: LeadContactDataPrimitives): Promise<Result<void, DomainError>>;

  /**
   * Busca datos de contacto por visitorId y companyId
   */
  findByVisitorId(
    visitorId: string,
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives | null, DomainError>>;

  /**
   * Actualiza datos de contacto existentes
   */
  update(data: LeadContactDataPrimitives): Promise<Result<void, DomainError>>;

  /**
   * Elimina datos de contacto
   */
  delete(
    visitorId: string,
    companyId: string,
  ): Promise<Result<void, DomainError>>;

  /**
   * Busca datos de contacto por email y companyId
   */
  findByEmail(
    email: string,
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives | null, DomainError>>;

  /**
   * Verifica si existen datos de contacto para un visitor
   */
  exists(
    visitorId: string,
    companyId: string,
  ): Promise<Result<boolean, DomainError>>;

  /**
   * Busca datos de contacto por chatId
   */
  findByChatId(
    chatId: string,
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives[], DomainError>>;

  /**
   * Busca datos de contacto por id
   */
  findById(
    id: string,
  ): Promise<Result<LeadContactDataPrimitives | null, DomainError>>;

  /**
   * Busca todos los datos de contacto de una empresa
   */
  findByCompanyId(
    companyId: string,
    filters?: LeadContactListFilters,
  ): Promise<Result<LeadContactDataPrimitives[], DomainError>>;
}

/**
 * Symbol para inyeccion de dependencias
 */
export const LEAD_CONTACT_DATA_REPOSITORY = Symbol(
  'ILeadContactDataRepository',
);
