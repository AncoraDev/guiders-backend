import { ICommand } from '@nestjs/cqrs';

/**
 * Comando para conectar un comercial al sistema
 */
export class ConnectCommercialCommand implements ICommand {
  constructor(
    public readonly commercialId: string,
    public readonly name: string,
    public readonly metadata?: Record<string, any>,
    /** companyId del usuario autenticado (tenant) — crítico para Redis + WS */
    public readonly companyId?: string,
  ) {}
}
