/**
 * Cierra la captación de un visitante. La dispara el envío del guion, para que
 * el asistente no se le vuelva a ofrecer en ninguna visita.
 */
export class CompleteLeadCaptureSessionCommand {
  constructor(
    public readonly visitorId: string,
    public readonly chatId?: string,
    public readonly companyId?: string,
  ) {}
}
