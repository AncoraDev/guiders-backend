// Servicio de envío de emails usando Resend API
// Ubicación: src/context/shared/infrastructure/email/resend-email-sender.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import {
  EmailSenderService,
  EMAIL_SENDER_SERVICE,
} from 'src/context/shared/domain/email/email-sender.service';

@Injectable()
export class ResendEmailSenderService implements EmailSenderService {
  private readonly logger = new Logger(ResendEmailSenderService.name);
  private readonly apiKey: string;
  private readonly emailFrom: string;

  constructor(private readonly configService: ConfigService) {
    // Obtiene la API key y el remitente desde variables de entorno
    this.apiKey = this.configService.get<string>('RESEND_API_KEY') || '';
    this.emailFrom = this.configService.get<string>('EMAIL_FROM') || '';
  }

  // Implementación del envío de email usando la API de Resend
  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    apiKey?: string;
    from?: string;
  }): Promise<void> {
    const apiKey = params.apiKey || this.apiKey;
    const from = params.from || this.emailFrom;
    if (!apiKey) {
      throw new Error('Falta la API key de Resend');
    }
    if (!from) {
      throw new Error('Falta el remitente de Resend');
    }
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      this.logger.error(
        `Error al enviar el email a ${params.to}: ${error.message}`,
      );
      throw new Error(error.message);
    }
    this.logger.log(
      `Email enviado a ${params.to} con asunto "${params.subject}".`,
    );
  }
}

// Proveedor para inyección de dependencias
export const ResendEmailSenderServiceProvider = {
  provide: EMAIL_SENDER_SERVICE,
  useClass: ResendEmailSenderService,
};
