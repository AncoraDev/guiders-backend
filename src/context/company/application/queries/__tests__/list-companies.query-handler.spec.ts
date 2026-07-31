import { Test, TestingModule } from '@nestjs/testing';
import { ListCompaniesQueryHandler } from '../list-companies.query-handler';
import { ListCompaniesQuery } from '../list-companies.query';
import { COMPANY_REPOSITORY } from '../../../domain/company.repository';
import { ok, err } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Company } from '../../../domain/company.aggregate';
import { DomainError } from 'src/context/shared/domain/domain.error';

class RepoError extends DomainError {
  constructor() {
    super('repo fail');
  }
}

describe('ListCompaniesQueryHandler', () => {
  let handler: ListCompaniesQueryHandler;
  let findAll: jest.Mock;

  beforeEach(async () => {
    findAll = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListCompaniesQueryHandler,
        { provide: COMPANY_REPOSITORY, useValue: { findAll } },
      ],
    }).compile();
    handler = module.get(ListCompaniesQueryHandler);
  });

  it('debe listar companies ordenadas por nombre', async () => {
    const now = new Date();
    const makeCompany = (name: string, domain: string) =>
      Company.fromPrimitives({
        id: Uuid.random().value,
        companyName: name,
        sites: [
          {
            id: Uuid.random().value,
            name: 'Sitio',
            canonicalDomain: domain,
            domainAliases: [],
          },
        ],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

    findAll.mockResolvedValue(
      ok([makeCompany('Zebra SA', 'zebra.test'), makeCompany('Acme', 'acme.test')]),
    );

    const list = await handler.execute(new ListCompaniesQuery());
    expect(list).toHaveLength(2);
    expect(list[0].companyName).toBe('Acme');
    expect(list[1].companyName).toBe('Zebra SA');
    expect(list[0].domains).toContain('acme.test');
  });

  it('debe devolver array vacío si el repositorio falla', async () => {
    findAll.mockResolvedValue(err(new RepoError()));
    const list = await handler.execute(new ListCompaniesQuery());
    expect(list).toEqual([]);
  });
});
