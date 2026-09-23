import { Company } from '../../../domain/company.aggregate';
import { CompanyTypeOrmEntity } from '../entity/company-typeorm.entity';
import { CompanySiteMapper } from './company-site.mapper';
import { Site } from '../../../domain/entities/site';

// Mapper para convertir entre entidad de dominio y persistencia de Company
export class CompanyMapper {
  // Convierte de entidad de persistencia a dominio
  static toDomain(entity: CompanyTypeOrmEntity): Company {
    // Convertir sites agrupando por dominio canónico
    const sites: Array<{
      id: string;
      name: string;
      canonicalDomain: string;
      domainAliases: string[];
    }> = [];

    if (entity.sites && entity.sites.length > 0) {
      // Agrupar sites por dominio canónico
      const canonicalSites = entity.sites.filter((site) => site.isCanonical);
      const nonCanonicalSites = entity.sites.filter(
        (site) => !site.isCanonical,
      );

      if (canonicalSites.length > 0) {
        // Hay sitios canónicos - agrupar aliases correctamente
        canonicalSites.forEach((canonicalSite, index) => {
          // Los aliases son todos los sitios no-canónicos de esta empresa
          const aliases = nonCanonicalSites.map((site) => site.domain);

          sites.push({
            id: canonicalSite.id,
            name: `Sitio ${index + 1}`,
            canonicalDomain: canonicalSite.domain,
            domainAliases: aliases,
          });
        });
      } else if (nonCanonicalSites.length > 0) {
        // No hay sitios canónicos - usar el primer no-canónico como canónico
        const firstNonCanonical = nonCanonicalSites[0];
        const aliases = nonCanonicalSites.slice(1).map((site) => site.domain);

        sites.push({
          id: firstNonCanonical.id,
          name: 'Sitio 1',
          canonicalDomain: firstNonCanonical.domain,
          domainAliases: aliases,
        });
      }
    }

    return Company.fromPrimitives({
      id: entity.id,
      companyName: entity.companyName,
      sites: sites,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      cannedReplies: entity.cannedReplies ?? [],
      contactFormLegal: entity.contactFormLegal ?? {},
      widgetConfig: entity.widgetConfig ?? {},
      leadCaptureNotifyEmail: entity.leadCaptureNotifyEmail ?? '',
      leadCaptureResendFrom: entity.leadCaptureResendFrom ?? '',
      leadCaptureResendApiKeyEncrypted: entity.leadCaptureResendApiKey ?? '',
    });
  }

  // Convierte de entidad de dominio a persistencia
  static toPersistence(company: Company): CompanyTypeOrmEntity {
    const primitives = company.toPrimitives();
    const entity = new CompanyTypeOrmEntity();
    entity.id = primitives.id;
    entity.companyName = primitives.companyName;

    // Crear las entidades de sites para la nueva relación
    const siteEntities = primitives.sites.flatMap((site) =>
      CompanySiteMapper.toPersistence(Site.fromPrimitives(site), primitives.id),
    );
    entity.sites = siteEntities;

    entity.createdAt = new Date(primitives.createdAt);
    entity.updatedAt = new Date(primitives.updatedAt);
    entity.cannedReplies = primitives.cannedReplies ?? [];
    entity.contactFormLegal = primitives.contactFormLegal ?? {};
    entity.widgetConfig = primitives.widgetConfig ?? {};
    entity.leadCaptureNotifyEmail = primitives.leadCaptureNotifyEmail ?? '';
    entity.leadCaptureResendFrom = primitives.leadCaptureResendFrom ?? '';
    entity.leadCaptureResendApiKey =
      primitives.leadCaptureResendApiKeyEncrypted ?? '';
    return entity;
  }
}
