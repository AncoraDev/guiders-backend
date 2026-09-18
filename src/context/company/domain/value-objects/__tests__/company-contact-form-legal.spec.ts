import {
  CompanyContactFormLegal,
  DEFAULT_CONTACT_FORM_LEGAL,
} from '../company-contact-form-legal';

describe('CompanyContactFormLegal', () => {
  it('devuelve textos por defecto si el input está vacío', () => {
    const legal = CompanyContactFormLegal.fromInput({});
    expect(legal.getValue()).toEqual(DEFAULT_CONTACT_FORM_LEGAL);
  });

  it('rechaza una URL que no sea http(s)', () => {
    expect(() =>
      CompanyContactFormLegal.fromInput({
        privacyPolicyUrl: 'ftp://ejemplo.com/privacidad',
      }),
    ).toThrow('La URL de la política de privacidad no es válida');
  });

  it('acepta una URL https y textos personalizados', () => {
    const legal = CompanyContactFormLegal.fromInput({
      privacyPolicyUrl: 'https://ejemplo.com/privacidad',
      privacyCheckboxLabel: '  Acepto privacidad  ',
      marketingCheckboxLabel: 'Quiero ofertas',
    });
    expect(legal.getValue()).toEqual({
      privacyPolicyUrl: 'https://ejemplo.com/privacidad',
      privacyCheckboxLabel: 'Acepto privacidad',
      marketingCheckboxLabel: 'Quiero ofertas',
    });
  });

  it('rehidrata datos inválidos sin lanzar', () => {
    const legal = CompanyContactFormLegal.fromPersistence({
      privacyPolicyUrl: 'no-url',
    });
    expect(legal.getValue()).toEqual(DEFAULT_CONTACT_FORM_LEGAL);
  });
});
