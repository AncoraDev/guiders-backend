import { ICommand } from '@nestjs/cqrs';
import { LeadCaptureAnswer } from '../../domain/entities/message.aggregate';

export interface SubmitLeadCapturePayload {
  flowId?: string;
  nombre?: string;
  apellidos?: string;
  email?: string;
  telefono?: string;
  poblacion?: string;
  comentarios?: string;
  acceptedPrivacyPolicy?: boolean;
  acceptedMarketing?: boolean;
  answers?: LeadCaptureAnswer[];
}

/**
 * El visitante completa el guion de captación por su cuenta, sin que ningún
 * comercial se lo haya pedido.
 */
export class SubmitLeadCaptureCommand implements ICommand {
  constructor(
    public readonly chatId: string,
    public readonly visitorId: string,
    public readonly data: SubmitLeadCapturePayload,
    public readonly ipAddress: string = '',
    public readonly userAgent?: string,
  ) {}
}
