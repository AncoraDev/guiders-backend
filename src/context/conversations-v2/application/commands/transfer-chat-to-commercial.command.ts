import { IsOptional, IsString } from 'class-validator';

/**
 * Command para transferir un chat ya asignado a otro comercial
 */
export class TransferChatToCommercialCommand {
  @IsString()
  readonly chatId: string;

  @IsString()
  readonly commercialId: string;

  @IsOptional()
  @IsString()
  readonly transferredBy?: string;

  constructor(params: {
    chatId: string;
    commercialId: string;
    transferredBy?: string;
  }) {
    if (!params.chatId || params.chatId.trim() === '') {
      throw new Error('El ID del chat es requerido');
    }

    if (!params.commercialId || params.commercialId.trim() === '') {
      throw new Error('El ID del comercial es requerido');
    }

    this.chatId = params.chatId;
    this.commercialId = params.commercialId;
    this.transferredBy = params.transferredBy;
  }
}
