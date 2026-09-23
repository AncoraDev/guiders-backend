import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { COMPANY_REPOSITORY } from '../../../domain/company.repository';
import { COMPANY_SECRET_CIPHER } from '../../../domain/company-secret-cipher';
import { Company } from '../../../domain/company.aggregate';
import { CompanyName } from '../../../domain/value-objects/company-name';
import { CompanySites } from '../../../domain/value-objects/company-sites';
import { UpdateCompanyLeadCaptureNotifyCommand } from '../update-company-lead-capture-notify.command';
import { UpdateCompanyLeadCaptureNotifyCommandHandler } from '../update-company-lead-capture-notify.command-handler';

class TestError extends DomainError {}

describe('UpdateCompanyLeadCaptureNotifyCommandHandler', () => {
  let handler: UpdateCompanyLeadCaptureNotifyCommandHandler;
  let companyRepository: {
    findById: jest.Mock;
    updateLeadCaptureNotify: jest.Mock;
  };
  let cipher: { encrypt: jest.Mock; decrypt: jest.Mock };

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
      updateLeadCaptureNotify: jest.fn().mockResolvedValue(ok(undefined)),
    };
    cipher = {
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) =>
        value.startsWith('enc:') ? value.slice(4) : value,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCompanyLeadCaptureNotifyCommandHandler,
        { provide: COMPANY_REPOSITORY, useValue: companyRepository },
        { provide: COMPANY_SECRET_CIPHER, useValue: cipher },
      ],
    }).compile();

    handler = module.get(UpdateCompanyLeadCaptureNotifyCommandHandler);
  });

  it('guarda email, remitente y cifra la API key', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'Guiders <no-reply@concesionario.com>',
        're_test_abcd',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toMatchObject({
      email: 'avisos@concesionario.com',
      from: 'Guiders <no-reply@concesionario.com>',
      apiKeyConfigured: true,
      apiKeyLast4: 'abcd',
    });
    expect(result.unwrap().apiKey).toBe('re_test_abcd');
    expect(cipher.encrypt).toHaveBeenCalledWith('re_test_abcd');
    expect(companyRepository.updateLeadCaptureNotify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: 'avisos@concesionario.com',
        from: 'Guiders <no-reply@concesionario.com>',
        apiKeyEncrypted: 'enc:re_test_abcd',
      }),
    );
  });

  it('rechaza una API key sin email de destino', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(
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
    expect(companyRepository.updateLeadCaptureNotify).not.toHaveBeenCalled();
  });

  it('permite dejarlo vacío para no avisar', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(companyId, '', '', ''),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap().email).toBe('');
    expect(result.unwrap().from).toBe('');
    expect(result.unwrap().apiKeyConfigured).toBe(false);
  });

  it('no cambia la API key si llega vacía', async () => {
    const withKey = company.updateLeadCaptureNotify({
      email: 'avisos@concesionario.com',
      from: 'no-reply@concesionario.com',
      apiKeyEncrypted: 'enc:re_keep_wxyz',
    });
    companyRepository.findById.mockResolvedValue(ok(withKey));
    cipher.decrypt.mockReturnValue('re_keep_wxyz');

    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(
        companyId,
        'otro@concesionario.com',
        'no-reply@concesionario.com',
        '',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(cipher.encrypt).not.toHaveBeenCalled();
    expect(companyRepository.updateLeadCaptureNotify).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        apiKeyEncrypted: 'enc:re_keep_wxyz',
      }),
    );
    expect(result.unwrap().apiKeyLast4).toBe('wxyz');
  });

  it('rechaza un email inválido', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(companyId, 'sin-arroba'),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('no es válido');
    }
    expect(companyRepository.updateLeadCaptureNotify).not.toHaveBeenCalled();
  });

  it('rechaza una API key que no es de Resend', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
        'no-reply@concesionario.com',
        'sk_live_xxx',
      ),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('API key');
    }
  });

  it('falla si no existe la empresa', async () => {
    companyRepository.findById.mockResolvedValue(err(new TestError('no')));

    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
      ),
    );

    expect(result.isErr()).toBe(true);
  });
});
