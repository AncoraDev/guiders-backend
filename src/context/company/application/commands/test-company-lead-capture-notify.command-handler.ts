import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { TestCompanyLeadCaptureNotifyCommand } from './test-company-lead-capture-notify.command';
import {
  COMPANY_REPOSITORY,
  CompanyRepository,
} from '../../domain/company.repository';
import {
  COMPANY_SECRET_CIPHER,
  CompanySecretCipher,
} from '../../domain/company-secret-cipher';
import {
  EMAIL_SENDER_SERVICE,
  EmailSenderService,
} from 'src/context/shared/domain/email/email-sender.service';
import { LeadCaptureNotifyEmail } from '../../domain/value-objects/lead-capture-notify-email';
import { LeadCaptureResendFrom } from '../../domain/value-objects/lead-capture-resend-from';
import { LeadCaptureResendApiKey } from '../../domain/value-objects/lead-capture-resend-api-key';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { CompanyNotFoundError } from '../../domain/errors/company.error';
import { InvalidCompanyDataError } from '../errors/company-platform.errors';

@CommandHandler(TestCompanyLeadCaptureNotifyCommand)
export class TestCompanyLeadCaptureNotifyCommandHandler
  implements ICommandHandler<TestCompanyLeadCaptureNotifyCommand>
{
  private readonly logger = new Logger(
    TestCompanyLeadCaptureNotifyCommandHandler.name,
  );

  constructor(
    @Inject(COMPANY_REPOSITORY)
    private readonly companyRepository: CompanyRepository,
    @Inject(COMPANY_SECRET_CIPHER)
    private readonly cipher: CompanySecretCipher,
    @Inject(EMAIL_SENDER_SERVICE)
    private readonly emailSender: EmailSenderService,
  ) {}

  async execute(
    command: TestCompanyLeadCaptureNotifyCommand,
  ): Promise<Result<void, DomainError>> {
    if (!Uuid.validate(command.companyId)) {
      return err(new InvalidCompanyDataError('ID de empresa no válido'));
    }

    const found = await this.companyRepository.findById(
      new Uuid(command.companyId),
    );
    if (found.isErr()) {
      return err(new CompanyNotFoundError());
    }

    let email: LeadCaptureNotifyEmail;
    let from: LeadCaptureResendFrom;
    let incomingKey: LeadCaptureResendApiKey;
    try {
      email = LeadCaptureNotifyEmail.fromInput(command.email);
      from = LeadCaptureResendFrom.fromInput(command.from);
      incomingKey = LeadCaptureResendApiKey.fromInput(command.apiKey);
    } catch (error) {
      return err(
        new InvalidCompanyDataError(
          error instanceof Error ? error.message : 'Datos de avisos no válidos',
        ),
      );
    }

    const company = found.unwrap();
    const savedKey = this.cipher.decrypt(
      company.getLeadCaptureResendApiKeyEncrypted(),
    );
    const apiKey = incomingKey.value || savedKey;
    const sender = from.value || company.getLeadCaptureResendFrom();

    if (!email.value) {
      return err(
        new InvalidCompanyDataError(
          'Indica un email de destino además de la API key de Resend',
        ),
      );
    }
    if (!apiKey) {
      return err(
        new InvalidCompanyDataError(
          'Indica la API key de Resend además del email de destino',
        ),
      );
    }
    if (!sender) {
      return err(
        new InvalidCompanyDataError(
          'Indica el remitente verificado en Resend',
        ),
      );
    }

    try {
      await this.emailSender.sendEmail({
        to: email.value,
        from: sender,
        apiKey,
        subject: 'Prueba de avisos de captación — Guiders',
        html: `
          <p>Este es un correo de prueba de Guiders.</p>
          <p>Si lo has recibido, la cuenta de Resend está bien configurada y recibirás aquí los leads del asistente cuando no haya comerciales en Atención.</p>
        `,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo enviar el email de prueba';
      this.logger.warn(
        `Prueba de avisos fallida para company ${command.companyId}: ${message}`,
      );
      return err(new InvalidCompanyDataError(message));
    }

    return okVoid();
  }
}
