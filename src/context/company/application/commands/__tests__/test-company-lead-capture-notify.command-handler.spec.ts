import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { COMPANY_REPOSITORY } from '../../../domain/company.repository';
import { COMPANY_SECRET_CIPHER } from '../../../domain/company-secret-cipher';
import { EMAIL_SENDER_SERVICE } from 'src/context/shared/domain/email/email-sender.service';
import { Company } from '../../../domain/company.aggregate';
import { CompanyName } from '../../../domain/value-objects/company-name';
import { CompanySites } from '../../../domain/value-objects/company-sites';
import { TestCompanyLeadCaptureNotifyCommand } from '../test-company-lead-capture-notify.command';
import { TestCompanyLeadCaptureNotifyCommandHandler } from '../test-company-lead-capture-notify.command-handler';

class TestError extends DomainError {}

describe('TestCompanyLeadCaptureNotifyCommandHandler', () => {
  let handler: TestCompanyLeadCaptureNotifyCommandHandler;
  let companyRepository: { findById: jest.Mock };
  let cipher: { encrypt: jest.Mock; decrypt: jest.Mock };
  let emailSender: { sendEmail: jest.Mock };

  const companyId = Uuid.random().value;

  const company = Company.create({
    id: new Uuid(companyId),
    companyName: new CompanyName('Demo Rmotion'),
    sites: CompanySites.fromPrimitives([
      {
        id: Uuid.random().value,
        name: 'Sitio',
        canonicalDomain: 'demo.local',
        domainAliases: [],
      },
    ]),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    companyRepository = {
      findById: jest.fn().mockResolvedValue(ok(company)),
    };
    cipher = {
      encrypt: jest.fn(),
      decrypt: jest.fn().mockReturnValue(''),
    };
    emailSender = { sendEmail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestCompanyLeadCaptureNotifyCommandHandler,
        { provide: COMPANY_REPOSITORY, useValue: companyRepository },
        { provide: COMPANY_SECRET_CIPHER, useValue: cipher },
        { provide: EMAIL_SENDER_SERVICE, useValue: emailSender },
      ],
    }).compile();

    handler = module.get(TestCompanyLeadCaptureNotifyCommandHandler);
  });

  it('envía un email de prueba con email y API key', async () => {
    const result = await handler.execute(
      new TestCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'Guiders <no-reply@concesionario.com>',
        're_test_abcd',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(emailSender.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'avisos@concesionario.com',
        from: 'Guiders <no-reply@concesionario.com>',
        apiKey: 're_test_abcd',
      }),
    );
    expect(emailSender.sendEmail.mock.calls[0][0].subject).toContain('Prueba');
  });

  it('usa la API key guardada si no llega una nueva', async () => {
    const withKey = company.updateLeadCaptureNotify({
      email: 'avisos@concesionario.com',
      from: 'no-reply@concesionario.com',
      apiKeyEncrypted: 'enc:re_keep_wxyz',
    });
    companyRepository.findById.mockResolvedValue(ok(withKey));
    cipher.decrypt.mockReturnValue('re_keep_wxyz');

    const result = await handler.execute(
      new TestCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'no-reply@concesionario.com',
        '',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(emailSender.sendEmail.mock.calls[0][0].apiKey).toBe('re_keep_wxyz');
  });

  it('exige email de destino además de la API key', async () => {
    const result = await handler.execute(
      new TestCompanyLeadCaptureNotifyCommand(
        companyId,
        '',
        'no-reply@concesionario.com',
        're_test_abcd',
      ),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('email de destino');
    }
    expect(emailSender.sendEmail).not.toHaveBeenCalled();
  });

  it('exige la API key además del email', async () => {
    const result = await handler.execute(
      new TestCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'no-reply@concesionario.com',
        '',
      ),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('API key');
    }
    expect(emailSender.sendEmail).not.toHaveBeenCalled();
  });

  it('devuelve el error de Resend si el envío falla', async () => {
    emailSender.sendEmail.mockRejectedValue(
      new Error('The guiders.io domain is not verified'),
    );

    const result = await handler.execute(
      new TestCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'no-reply@concesionario.com',
        're_test_abcd',
      ),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('not verified');
    }
  });

  it('falla si no existe la empresa', async () => {
    companyRepository.findById.mockResolvedValue(err(new TestError('no')));

    const result = await handler.execute(
      new TestCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'no-reply@concesionario.com',
        're_test_abcd',
      ),
    );

    expect(result.isErr()).toBe(true);
  });
});
