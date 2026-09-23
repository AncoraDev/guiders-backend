// Implementación de EmailSenderService para producción usando SMTP real
// Ubicación: src/context/shared/infrastructure/email/smtp-email-sender.service.ts
import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { EmailSenderService } from '../../domain/email/email-sender.service';

/**
 * Servicio de envío de emails usando SMTP real para producción.
 * Configura el transporte SMTP con credenciales reales.
 * Cambia las credenciales y host según tu proveedor (Gmail, SendGrid, etc).
 */
@Injectable()
export class SmtpEmailSenderService implements EmailSenderService {
  private readonly logger = new Logger(SmtpEmailSenderService.name);
  private transporter: Transporter;

  constructor() {
    // Configuración SMTP para Gmail. Si usas otro proveedor, ajusta los campos.
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'rogerpugaruiz@gmail.com', // Cambia por tu email real
        pass: process.env.SMTP_PASSWORD, // Usa una variable de entorno segura
      },
    });
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    apiKey?: string;
    from?: string;
  }): Promise<void> {
    try {
      // Tipado seguro: validamos el resultado de sendMail antes de acceder a messageId
      const infoRaw: unknown = await this.transporter.sendMail({
        from: 'rogerpugaruiz@gmail.com', // Remitente
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (
        !infoRaw ||
        typeof infoRaw !== 'object' ||
        !('messageId' in infoRaw)
      ) {
        throw new Error('Respuesta inesperada de nodemailer.sendMail');
      }
      const messageId = (infoRaw as { messageId: string }).messageId;
      this.logger.log(`Email enviado a ${params.to}. MessageId: ${messageId}`);
    } catch (error) {
      this.logger.error('Error enviando email SMTP', error);
      throw error instanceof Error
        ? error
        : new Error('Error enviando email SMTP');
    }
  }
}
