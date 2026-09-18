// Entidad de dominio Company siguiendo DDD y CQRS
import { AggregateRoot } from '@nestjs/cqrs';
import { CompanyName } from './value-objects/company-name';
import { CompanySites } from './value-objects/company-sites';
import { CompanyCreatedEvent } from './events/company-created.event';
import { Uuid } from '../../shared/domain/value-objects/uuid';
import { SitePrimitives } from './entities/site';
import { CompanyCannedReplies } from './value-objects/company-canned-replies';
import { CannedReplyPrimitives } from '../../shared/domain/canned-reply';
import {
  CompanyContactFormLegal,
  ContactFormLegalPrimitives,
} from './value-objects/company-contact-form-legal';

// Entidad principal del contexto Company
export class Company extends AggregateRoot {
  // Propiedades encapsuladas
  private readonly id: Uuid;
  private readonly companyName: CompanyName;
  private readonly sites: CompanySites;
  private readonly createdAt: Date;
  private readonly updatedAt: Date;
  private readonly cannedReplies: CompanyCannedReplies;
  private readonly contactFormLegal: CompanyContactFormLegal;

  // Constructor privado para forzar el uso de los métodos de fábrica
  private constructor(props: {
    id: Uuid;
    companyName: CompanyName;
    sites: CompanySites;
    createdAt: Date;
    updatedAt: Date;
    cannedReplies?: CompanyCannedReplies;
    contactFormLegal?: CompanyContactFormLegal;
  }) {
    super();
    this.id = props.id;
    this.companyName = props.companyName;
    this.sites = props.sites;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.cannedReplies = props.cannedReplies ?? CompanyCannedReplies.empty();
    this.contactFormLegal =
      props.contactFormLegal ?? CompanyContactFormLegal.empty();
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
    cannedReplies?: CannedReplyPrimitives[];
    contactFormLegal?: ContactFormLegalPrimitives | Record<string, unknown>;
  }): Company {
    return new Company({
      id: new Uuid(primitives.id),
      companyName: new CompanyName(primitives.companyName),
      sites: CompanySites.fromPrimitives(primitives.sites),
      createdAt: new Date(primitives.createdAt),
      updatedAt: new Date(primitives.updatedAt),
      cannedReplies: CompanyCannedReplies.fromInput(
        primitives.cannedReplies ?? [],
      ),
      contactFormLegal: CompanyContactFormLegal.fromPersistence(
        primitives.contactFormLegal,
      ),
    });
  }

  // Convierte la entidad a un objeto plano serializable
  public toPrimitives(): {
    id: string;
    companyName: string;
    sites: SitePrimitives[];
    createdAt: string;
    updatedAt: string;
    cannedReplies: CannedReplyPrimitives[];
    contactFormLegal: ContactFormLegalPrimitives;
  } {
    return {
      id: this.id.getValue(),
      companyName: this.companyName.getValue(),
      sites: this.sites.toPrimitives(),
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      cannedReplies: this.cannedReplies.getValue(),
      contactFormLegal: this.contactFormLegal.getValue(),
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

  public getCannedReplies(): CannedReplyPrimitives[] {
    return this.cannedReplies.getValue();
  }

  public getContactFormLegal(): ContactFormLegalPrimitives {
    return this.contactFormLegal.getValue();
  }

  public updateDetails(companyName: CompanyName, sites: CompanySites): Company {
    return new Company({
      id: this.id,
      companyName,
      sites,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      cannedReplies: this.cannedReplies,
      contactFormLegal: this.contactFormLegal,
    });
  }

  public updateCannedReplies(items: CannedReplyPrimitives[]): Company {
    return new Company({
      id: this.id,
      companyName: this.companyName,
      sites: this.sites,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      cannedReplies: CompanyCannedReplies.fromInput(items),
      contactFormLegal: this.contactFormLegal,
    });
  }

  public updateContactFormLegal(
    legal: ContactFormLegalPrimitives,
  ): Company {
    return new Company({
      id: this.id,
      companyName: this.companyName,
      sites: this.sites,
      createdAt: this.createdAt,
      updatedAt: new Date(),
      cannedReplies: this.cannedReplies,
      contactFormLegal: CompanyContactFormLegal.fromInput(legal),
    });
  }
}
