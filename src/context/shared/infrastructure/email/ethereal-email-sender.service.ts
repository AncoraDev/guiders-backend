// Implementación de EmailSenderService usando nodemailer y una cuenta de prueba de Ethereal
// Ubicación: src/context/shared/infrastructure/email/ethereal-email-sender.service.ts
import { Injectable, Logger } from '@nestjs/common';
// Importación robusta de nodemailer para evitar problemas de undefined en entornos CommonJS/ESM
import * as nodemailer from 'nodemailer';
// Importar SMTPTransport para tipado seguro (comentado si no se usa)
// import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Resend } from 'resend';
import { EmailSenderService } from '../../domain/email/email-sender.service';

@Injectable()
export class EtherealEmailSenderService implements EmailSenderService {
  private readonly logger = new Logger(EtherealEmailSenderService.name);
  private transporterPromise: Promise<nodemailer.Transporter>;

  constructor() {
    // Crea el transporter de nodemailer con una cuenta de prueba de Ethereal
    this.transporterPromise = this.createTransporter();
  }

  // Método privado para inicializar el transporter de forma segura y tipada
  private async createTransporter(): Promise<nodemailer.Transporter> {
    // Se accede a createTestAccount desde el objeto nodemailer para máxima compatibilidad
    const testAccount = await nodemailer.createTestAccount();
    if (
      !testAccount ||
      !testAccount.smtp ||
      !testAccount.smtp.host ||
      !testAccount.smtp.port ||
      typeof testAccount.smtp.secure !== 'boolean' ||
      !testAccount.user ||
      !testAccount.pass
    ) {
      throw new Error('Cuenta de test Ethereal inválida');
    }
    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    this.logger.log(`Cuenta Ethereal creada: ${testAccount.user}`);
    return transporter;
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    apiKey?: string;
    from?: string;
  }): Promise<void> {
    if (params.apiKey) {
      const resend = new Resend(params.apiKey);
      const { error } = await resend.emails.send({
        from: params.from || 'no-reply@guiders.io',
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
      if (error) {
        this.logger.error(
          `Error al enviar con Resend del cliente a ${params.to}: ${error.message}`,
        );
        throw new Error(error.message);
      }
      this.logger.log(
        `Email enviado vía Resend (cuenta del cliente) a ${params.to}.`,
      );
      return;
    }

    const transporter = await this.transporterPromise;

    const info = await transporter.sendMail({
      from: params.from || 'no-reply@guiders.io',
      to: params.to,
      subject: params.subject,
      html: params.html,
    });

    // Validación mínima: solo verificar que el email se envió (tiene messageId)
    if (!info || typeof info !== 'object' || !('messageId' in info)) {
      throw new Error('Respuesta inesperada de nodemailer.sendMail');
    }

    // Generar URL de preview para ver el email en Ethereal
    const previewUrl = nodemailer.getTestMessageUrl(info);
    this.logger.log(
      `Email enviado a ${params.to}. Preview: ${previewUrl ?? 'no disponible'}`,
    );
  }
}
