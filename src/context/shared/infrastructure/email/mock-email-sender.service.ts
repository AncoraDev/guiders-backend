// Implementación mock de EmailSenderService para desarrollo/pruebas
// Ubicación: src/context/shared/infrastructure/email/mock-email-sender.service.ts
import { Injectable } from '@nestjs/common';
import { EmailSenderService } from '../../domain/email/email-sender.service';

@Injectable()
export class MockEmailSenderService implements EmailSenderService {
  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    apiKey?: string;
    from?: string;
  }): Promise<void> {
    // Simula el envío de email (en real, aquí iría la integración con SMTP, SendGrid, etc.)

    console.log('[MOCK EMAIL]', params);
    return Promise.resolve();
  }
}
