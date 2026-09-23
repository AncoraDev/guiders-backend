// Interfaz y símbolo para el servicio de envío de emails
// Ubicación: src/context/shared/domain/email/email-sender.service.ts

export interface EmailSenderService {
  // Envía un email a un destinatario con asunto y contenido HTML
  sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    apiKey?: string;
    from?: string;
  }): Promise<void>;
}

export const EMAIL_SENDER_SERVICE = Symbol('EmailSenderService');
