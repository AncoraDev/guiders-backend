export interface ContactFormLegalPrimitives {
  privacyPolicyUrl: string;
  privacyCheckboxLabel: string;
  marketingCheckboxLabel: string;
}

export const DEFAULT_CONTACT_FORM_LEGAL: ContactFormLegalPrimitives = {
  privacyPolicyUrl: '',
  privacyCheckboxLabel: 'He leído y acepto la política de privacidad',
  marketingCheckboxLabel: 'Acepto recibir comunicaciones',
};

export class CompanyContactFormLegal {
  constructor(public readonly value: ContactFormLegalPrimitives) {}

  public static empty(): CompanyContactFormLegal {
    return new CompanyContactFormLegal({ ...DEFAULT_CONTACT_FORM_LEGAL });
  }

  public static fromInput(raw: unknown): CompanyContactFormLegal {
    const source =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const url =
      typeof source.privacyPolicyUrl === 'string'
        ? source.privacyPolicyUrl.trim()
        : '';
    if (url && !/^https?:\/\/.+/i.test(url)) {
      throw new Error('La URL de la política de privacidad no es válida');
    }
    const privacyLabel =
      typeof source.privacyCheckboxLabel === 'string'
        ? source.privacyCheckboxLabel.trim()
        : '';
    const marketingLabel =
      typeof source.marketingCheckboxLabel === 'string'
        ? source.marketingCheckboxLabel.trim()
        : '';
    return new CompanyContactFormLegal({
      privacyPolicyUrl: url,
      privacyCheckboxLabel:
        privacyLabel || DEFAULT_CONTACT_FORM_LEGAL.privacyCheckboxLabel,
      marketingCheckboxLabel:
        marketingLabel || DEFAULT_CONTACT_FORM_LEGAL.marketingCheckboxLabel,
    });
  }

  public static fromPersistence(raw: unknown): CompanyContactFormLegal {
    try {
      return CompanyContactFormLegal.fromInput(raw);
    } catch {
      return CompanyContactFormLegal.empty();
    }
  }

  public getValue(): ContactFormLegalPrimitives {
    return this.value;
  }
}
