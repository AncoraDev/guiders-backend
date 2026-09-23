import { LeadCaptureResendFrom } from '../lead-capture-resend-from';

describe('LeadCaptureResendFrom', () => {
  it('acepta vacío', () => {
    expect(LeadCaptureResendFrom.fromInput('').value).toBe('');
    expect(LeadCaptureResendFrom.fromInput(undefined).value).toBe('');
  });

  it('acepta un email', () => {
    expect(LeadCaptureResendFrom.fromInput(' no-reply@concesionario.com ').value)
      .toBe('no-reply@concesionario.com');
  });

  it('acepta Nombre <email>', () => {
    expect(
      LeadCaptureResendFrom.fromInput('Guiders <no-reply@concesionario.com>')
        .value,
    ).toBe('Guiders <no-reply@concesionario.com>');
  });

  it('rechaza un remitente inválido', () => {
    expect(() => LeadCaptureResendFrom.fromInput('sin-arroba')).toThrow(
      'El remitente de Resend no es válido',
    );
  });

  it('en persistencia un valor inválido no tumba la empresa', () => {
    expect(LeadCaptureResendFrom.fromPersistence('@@@').value).toBe('');
  });
});
