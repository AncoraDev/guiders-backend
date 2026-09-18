import { ConnectionSessionEndReason } from '../../domain/commercial-connection-session.repository';

/**
 * Lista el registro de conexiones de los comerciales de una empresa.
 *
 * `requesterId` es el id interno del usuario autenticado. Un comercial solo ve
 * sus propias conexiones; admin y supervisor ven toda la empresa y pueden
 * filtrar por un agente concreto.
 */
export class ListConnectionSessionsQuery {
  constructor(
    public readonly companyId: string,
    public readonly requesterId: string,
    public readonly requesterRoles: string[],
    public readonly filters: {
      commercialId?: string;
      from?: Date;
      to?: Date;
      endReason?: ConnectionSessionEndReason;
      status?: 'open' | 'closed';
      page: number;
      limit: number;
    },
  ) {}
}
