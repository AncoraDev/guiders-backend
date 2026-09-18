import { ContactFormLegalPrimitives } from '../../domain/value-objects/company-contact-form-legal';

export class UpdateCompanyContactFormLegalCommand {
  constructor(
    public readonly companyId: string,
    public readonly legal: Partial<ContactFormLegalPrimitives>,
  ) {}
}
