import { Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';

export const COMMERCIAL_CONNECTION_SESSION_REPOSITORY = Symbol(
  'CommercialConnectionSessionRepository',
);

export type ConnectionSessionEndReason =
  | 'manual'
  | 'logout'
  | 'browser_close'
  | 'unknown';

export interface CommercialConnectionSessionPrimitives {
  id: string;
  commercialId: string;
  companyId: string;
  commercialDisplayName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  durationMs: number | null;
  endReason: ConnectionSessionEndReason | null;
}

export interface ConnectionSessionSearchParams {
  companyId: string;
  /** Si se indica, filtra por este comercial (siempre dentro de companyId). */
  commercialId?: string;
  from?: Date;
  to?: Date;
  endReason?: ConnectionSessionEndReason;
  status?: 'open' | 'closed';
  page: number;
  limit: number;
}

export interface ConnectionSessionSearchResult {
  sessions: CommercialConnectionSessionPrimitives[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CommercialConnectionSessionRepository {
  /**
   * Abre sesión si no hay una abierta para el comercial.
   */
  openSession(params: {
    commercialId: string;
    companyId: string;
    startedAt?: Date;
    commercialDisplayName?: string | null;
  }): Promise<Result<CommercialConnectionSessionPrimitives, DomainError>>;

  /**
   * Cierra la sesión abierta del comercial (si existe).
   */
  closeOpenSession(params: {
    commercialId: string;
    endedAt?: Date;
    endReason?: ConnectionSessionEndReason;
  }): Promise<Result<CommercialConnectionSessionPrimitives | null, DomainError>>;

  /**
   * Búsqueda paginada con filtros (siempre scoped por companyId).
   */
  search(
    params: ConnectionSessionSearchParams,
  ): Promise<Result<ConnectionSessionSearchResult, DomainError>>;

  /** @deprecated Preferir search() */
  listByCommercial(
    commercialId: string,
    limit?: number,
  ): Promise<Result<CommercialConnectionSessionPrimitives[], DomainError>>;

  /** @deprecated Preferir search() */
  listByCompany(
    companyId: string,
    limit?: number,
  ): Promise<Result<CommercialConnectionSessionPrimitives[], DomainError>>;
}
