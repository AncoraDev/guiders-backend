// Servicio de envío de emails usando SendGrid API
// Ubicación: src/context/shared/infrastructure/email/sendgrid-email-sender.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EmailSenderService,
  EMAIL_SENDER_SERVICE,
} from 'src/context/shared/domain/email/email-sender.service';

/**
 * Implementación de EmailSenderService usando SendGrid API
 *
 * Variables de entorno requeridas:
 * - SENDGRID_API_KEY: API key de SendGrid
 * - EMAIL_FROM: Email remitente verificado en SendGrid
 *
 * Instalación:
 * npm install @sendgrid/mail
 */
@Injectable()
export class SendGridEmailSenderService implements EmailSenderService {
  private readonly logger = new Logger(SendGridEmailSenderService.name);
  private readonly apiKey: string;
  private readonly emailFrom: string;
  private sgMail: any;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SENDGRID_API_KEY') || '';
    this.emailFrom = this.configService.get<string>('EMAIL_FROM') || '';

    // Inicializa SendGrid de forma lazy para evitar errores si no está instalado

    this.initializeSendGrid();
  }

  private initializeSendGrid(): void {
    try {
      // Dynamic require para evitar errores de compilación si @sendgrid/mail no está instalado
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sgMailModule = require('@sendgrid/mail');
      this.sgMail = sgMailModule.default || sgMailModule;
      this.sgMail.setApiKey(this.apiKey);
      this.logger.log('SendGrid inicializado correctamente');
    } catch {
      this.logger.warn(
        'SendGrid no está instalado. Ejecutar: npm install @sendgrid/mail',
      );
    }
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    apiKey?: string;
    from?: string;
  }): Promise<void> {
    if (!this.sgMail) {
      this.logger.error(
        'SendGrid no está inicializado. Instalar: npm install @sendgrid/mail',
      );
      return;
    }

    try {
      const msg = {
        to: params.to,
        from: this.emailFrom,
        subject: params.subject,
        html: params.html,
      };

      await this.sgMail.send(msg);
      this.logger.log(
        `Email enviado a ${params.to} con asunto "${params.subject}".`,
      );
    } catch (error: any) {
      if (error.response) {
        this.logger.error(
          `Error SendGrid: ${error.response.statusCode} - ${JSON.stringify(error.response.body)}`,
        );
      } else if (error instanceof Error) {
        this.logger.error(
          `Error al enviar email a ${params.to}: ${error.message}`,
        );
      }
    }
  }
}

// Proveedor para inyección de dependencias
export const SendGridEmailSenderServiceProvider = {
  provide: EMAIL_SENDER_SERVICE,
  useClass: SendGridEmailSenderService,
};
