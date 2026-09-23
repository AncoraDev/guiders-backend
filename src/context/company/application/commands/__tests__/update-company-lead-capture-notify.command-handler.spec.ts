import { Test, TestingModule } from '@nestjs/testing';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { err, ok } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { COMPANY_REPOSITORY } from '../../../domain/company.repository';
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
    updateLeadCaptureNotifyEmail: jest.Mock;
  };

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
      updateLeadCaptureNotifyEmail: jest.fn().mockResolvedValue(ok(undefined)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCompanyLeadCaptureNotifyCommandHandler,
        { provide: COMPANY_REPOSITORY, useValue: companyRepository },
      ],
    }).compile();

    handler = module.get(UpdateCompanyLeadCaptureNotifyCommandHandler);
  });

  it('guarda el email de avisos', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(
        companyId,
        'avisos@concesionario.com',
      ),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toBe('avisos@concesionario.com');
    expect(companyRepository.updateLeadCaptureNotifyEmail).toHaveBeenCalled();
  });

  it('permite dejarlo vacío para no avisar', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(companyId, ''),
    );

    expect(result.isOk()).toBe(true);
    expect(result.unwrap()).toBe('');
  });

  it('rechaza un email inválido', async () => {
    const result = await handler.execute(
      new UpdateCompanyLeadCaptureNotifyCommand(companyId, 'sin-arroba'),
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('no es válido');
    }
    expect(
      companyRepository.updateLeadCaptureNotifyEmail,
    ).not.toHaveBeenCalled();
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
