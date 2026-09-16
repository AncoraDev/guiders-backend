import { Company } from '../company.aggregate';
import { CompanyName } from '../value-objects/company-name';
import { CompanySites } from '../value-objects/company-sites';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Site } from '../entities/site';
import { SiteId } from '../value-objects/site-id';
import { SiteName } from '../value-objects/site-name';
import { CanonicalDomain } from '../value-objects/canonical-domain';
import { DomainAliases } from '../value-objects/domain-aliases';
import { CompanyCreatedEvent } from '../events/company-created.event';

describe('Company', () => {
  let validId: Uuid;
  let validName: CompanyName;
  let validSites: CompanySites;
  let validCreatedAt: Date;
  let validUpdatedAt: Date;

  beforeEach(() => {
    validId = Uuid.random();
    validName = new CompanyName('Empresa Test');

    const site1 = Site.create({
      id: new SiteId('550e8400-e29b-41d4-a716-446655440001'),
      name: new SiteName('Sitio Principal'),
      canonicalDomain: new CanonicalDomain('example.com'),
      domainAliases: DomainAliases.fromPrimitives(['www.example.com']),
    });

    const site2 = Site.create({
      id: new SiteId('550e8400-e29b-41d4-a716-446655440002'),
      name: new SiteName('Blog'),
      canonicalDomain: new CanonicalDomain('test.org'),
      domainAliases: DomainAliases.fromPrimitives([]),
    });

    validSites = CompanySites.fromSiteArray([site1, site2]);
    validCreatedAt = new Date('2023-01-01T00:00:00.000Z');
    validUpdatedAt = new Date('2023-01-01T00:00:00.000Z');
  });

  describe('create', () => {
    it('debe crear empresa con parámetros válidos', () => {
      const company = Company.create({
        id: validId,
        companyName: validName,
        sites: validSites,
        createdAt: validCreatedAt,
        updatedAt: validUpdatedAt,
      });

      expect(company.getId()).toBe(validId);
      expect(company.getCompanyName()).toBe(validName);
      expect(company.getSites()).toBe(validSites);
      expect(company.getCreatedAt()).toBe(validCreatedAt);
      expect(company.getUpdatedAt()).toBe(validUpdatedAt);
    });

    it('debe emitir CompanyCreatedEvent al crear empresa', () => {
      const company = Company.create({
        id: validId,
        companyName: validName,
        sites: validSites,
        createdAt: validCreatedAt,
        updatedAt: validUpdatedAt,
      });

      const events = company.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(CompanyCreatedEvent);
    });
  });

  describe('updateDetails', () => {
    it('debe actualizar nombre y sitios sin emitir evento de creación', () => {
      const company = Company.fromPrimitives({
        id: validId.getValue(),
        companyName: validName.getValue(),
        sites: validSites.toPrimitives(),
        createdAt: validCreatedAt.toISOString(),
        updatedAt: validUpdatedAt.toISOString(),
      });

      const nextName = new CompanyName('Empresa Actualizada');
      const updated = company.updateDetails(nextName, validSites);

      expect(updated.getCompanyName().getValue()).toBe('Empresa Actualizada');
      expect(updated.getId().getValue()).toBe(validId.getValue());
      expect(updated.getCreatedAt().toISOString()).toBe(
        validCreatedAt.toISOString(),
      );
      expect(updated.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(
        validUpdatedAt.getTime(),
      );
      expect(updated.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
