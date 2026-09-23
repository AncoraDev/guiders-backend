import { LeadCaptureNotifyEmail } from '../lead-capture-notify-email';

describe('LeadCaptureNotifyEmail', () => {
  it('acepta vacío para no enviar avisos', () => {
    expect(LeadCaptureNotifyEmail.fromInput('').value).toBe('');
    expect(LeadCaptureNotifyEmail.fromInput('   ').value).toBe('');
    expect(LeadCaptureNotifyEmail.fromInput(undefined).value).toBe('');
  });

  it('acepta un email válido', () => {
    expect(LeadCaptureNotifyEmail.fromInput(' avisos@concesionario.com ').value)
      .toBe('avisos@concesionario.com');
  });

  it('rechaza un email inválido', () => {
    expect(() => LeadCaptureNotifyEmail.fromInput('no-es-email')).toThrow(
      'El email de avisos de captación no es válido',
    );
  });

  it('en persistencia un valor inválido no tumba la empresa', () => {
    expect(LeadCaptureNotifyEmail.fromPersistence('@@@').value).toBe('');
  });
});
