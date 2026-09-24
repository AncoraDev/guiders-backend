import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { err, ok, okVoid } from 'src/context/shared/domain/result';
import { Company } from '../../../domain/company.aggregate';
import { CompanyName } from '../../../domain/value-objects/company-name';
import { CompanySites } from '../../../domain/value-objects/company-sites';
import { Site } from '../../../domain/entities/site';
import { SiteId } from '../../../domain/value-objects/site-id';
import { SiteName } from '../../../domain/value-objects/site-name';
import { CanonicalDomain } from '../../../domain/value-objects/canonical-domain';
import { DomainAliases } from '../../../domain/value-objects/domain-aliases';
import { CompanyNotFoundError } from '../../../domain/errors/company.error';
import { CompanySitesUpdatedEvent } from '../../../domain/events/company-sites-updated.event';
import { COMPANY_REPOSITORY } from '../../../domain/company.repository';
import { UpdateCompanyCommand } from '../update-company.command';
import { UpdateCompanyCommandHandler } from '../update-company-command.handler';

describe('UpdateCompanyCommandHandler', () => {
  let handler: UpdateCompanyCommandHandler;
  let companies: { findById: jest.Mock; findByDomain: jest.Mock; update: jest.Mock };
  let commit: jest.Mock;
  let published: Company;

  beforeEach(async () => {
    commit = jest.fn();
    companies = {
      findById: jest.fn(),
      findByDomain: jest.fn().mockResolvedValue(err(new CompanyNotFoundError())),
      update: jest.fn().mockResolvedValue(okVoid()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateCompanyCommandHandler,
        { provide: COMPANY_REPOSITORY, useValue: companies },
        {
          provide: EventPublisher,
          useValue: {
            mergeObjectContext: jest.fn((company: Company) => {
              published = company;
              company.commit = commit;
              return company;
            }),
          },
        },
      ],
    }).compile();

    handler = module.get(UpdateCompanyCommandHandler);
  });

  it('publica los sitios guardados para crear las claves de widget', async () => {
    const companyId = Uuid.random().value;
    const siteId = Uuid.random().value;
    const existing = Company.create({
      id: new Uuid(companyId),
      companyName: new CompanyName('Rmotion'),
      sites: CompanySites.fromSiteArray([
        Site.create({
          id: new SiteId(siteId),
          name: new SiteName('Web'),
          canonicalDomain: new CanonicalDomain('rmotion.example'),
          domainAliases: DomainAliases.fromPrimitives([]),
        }),
      ]),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    companies.findById.mockResolvedValue(ok(existing));

    const result = await handler.execute(
      new UpdateCompanyCommand(companyId, 'Rmotion', [
        {
          id: siteId,
          name: 'Web',
          canonicalDomain: 'localhost',
          domainAliases: ['127.0.0.1'],
        },
      ]),
    );

    expect(result.isOk()).toBe(true);
    expect(companies.update).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
    const events = published.getUncommittedEvents();
    const sitesEvent = events.find(
      (event) => event instanceof CompanySitesUpdatedEvent,
    );
    expect(sitesEvent).toBeInstanceOf(CompanySitesUpdatedEvent);
    expect(sitesEvent?.attributes.sites[0].canonicalDomain).toBe('localhost');
    expect(sitesEvent?.attributes.sites[0].domainAliases).toEqual(['127.0.0.1']);
  });

  it('no publica si no se puede guardar', async () => {
    const companyId = Uuid.random().value;
    const existing = Company.create({
      id: new Uuid(companyId),
      companyName: new CompanyName('Rmotion'),
      sites: CompanySites.fromSiteArray([
        Site.create({
          id: SiteId.random(),
          name: new SiteName('Web'),
          canonicalDomain: new CanonicalDomain('rmotion.example'),
          domainAliases: DomainAliases.fromPrimitives([]),
        }),
      ]),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    companies.findById.mockResolvedValue(ok(existing));
    companies.update.mockResolvedValue(err(new CompanyNotFoundError()));

    const result = await handler.execute(
      new UpdateCompanyCommand(companyId, 'Rmotion', [
        {
          name: 'Web',
          canonicalDomain: 'localhost',
          domainAliases: [],
        },
      ]),
    );

    expect(result.isErr()).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });
});
