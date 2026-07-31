import { ICommand } from '@nestjs/cqrs';
import { ConnectionSessionEndReason } from '../../domain/commercial-connection-session.repository';

export class DisconnectCommercialCommand implements ICommand {
  constructor(
    public readonly commercialId: string,
    public readonly endReason: ConnectionSessionEndReason = 'unknown',
    /** companyId del usuario autenticado (tenant) — crítico para Redis + WS */
    public readonly companyId?: string,
  ) {}
}
