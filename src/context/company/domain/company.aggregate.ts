// Entidad de dominio Company siguiendo DDD y CQRS
import { AggregateRoot } from '@nestjs/cqrs';
import { CompanyName } from './value-objects/company-name';
import { CompanySites } from './value-objects/company-sites';
import { CompanyCreatedEvent } from './events/company-created.event';
import { Uuid } from '../../shared/domain/value-objects/uuid';
import { SitePrimitives } from './entities/site';

// Entidad principal del contexto Company
export class Company extends AggregateRoot {
  // Propiedades encapsuladas
  private readonly id: Uuid;
  private readonly companyName: CompanyName;
  private readonly sites: CompanySites;
  private readonly createdAt: Date;
  private readonly updatedAt: Date;

  // Constructor privado para forzar el uso de los métodos de fábrica
  private constructor(props: {
    id: Uuid;
    companyName: CompanyName;
    sites: CompanySites;
    createdAt: Date;
    updatedAt: Date;
  }) {
    super();
    this.id = props.id;
    this.companyName = props.companyName;
    this.sites = props.sites;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  // Método de fábrica para crear una nueva empresa (desde value objects)
  public static create(props: {
    id: Uuid;
    companyName: CompanyName;
    sites: CompanySites;
    createdAt: Date;
    updatedAt: Date;
  }): Company {
    const company = new Company(props);
    // Aplica el evento de dominio de creación
    company.apply(
      new CompanyCreatedEvent({
        id: props.id.getValue(),
        companyName: props.companyName.getValue(),
        sites: props.sites.toPrimitives(),
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
      }),
    );
    return company;
  }

  // Método de fábrica para reconstruir desde datos primitivos
  public static fromPrimitives(primitives: {
    id: string;
    companyName: string;
    sites: SitePrimitives[];
    createdAt: string;
    updatedAt: string;
  }): Company {
    return new Company({
      id: new Uuid(primitives.id),
      companyName: new CompanyName(primitives.companyName),
      sites: CompanySites.fromPrimitives(primitives.sites),
      createdAt: new Date(primitives.createdAt),
      updatedAt: new Date(primitives.updatedAt),
    });
  }

  // Convierte la entidad a un objeto plano serializable
  public toPrimitives(): {
    id: string;
    companyName: string;
    sites: SitePrimitives[];
    createdAt: string;
    updatedAt: string;
  } {
    return {
      id: this.id.getValue(),
      companyName: this.companyName.getValue(),
      sites: this.sites.toPrimitives(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }

  // Getters solo de lectura para exponer valores si es necesario
  public getId(): Uuid {
    return this.id;
  }
  public getCompanyName(): CompanyName {
    return this.companyName;
  }
  public getSites(): CompanySites {
    return this.sites;
  }
  public getCreatedAt(): Date {
    return this.createdAt;
  }
  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  public updateDetails(companyName: CompanyName, sites: CompanySites): Company {
    return new Company({
      id: this.id,
      companyName,
      sites,
      createdAt: this.createdAt,
      updatedAt: new Date(),
    });
  }
}
