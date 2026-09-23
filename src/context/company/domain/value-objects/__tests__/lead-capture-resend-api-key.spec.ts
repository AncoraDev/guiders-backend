import { LeadCaptureResendApiKey } from '../lead-capture-resend-api-key';

describe('LeadCaptureResendApiKey', () => {
  it('acepta vacío para no cambiar la clave', () => {
    expect(LeadCaptureResendApiKey.fromInput('').value).toBe('');
    expect(LeadCaptureResendApiKey.fromInput(undefined).value).toBe('');
  });

  it('acepta una clave de Resend', () => {
    expect(LeadCaptureResendApiKey.fromInput(' re_test_abcd ').value).toBe(
      're_test_abcd',
    );
  });

  it('rechaza claves que no empiezan por re_', () => {
    expect(() => LeadCaptureResendApiKey.fromInput('sk_live_xxx')).toThrow(
      'La API key de Resend no es válida',
    );
  });

  it('devuelve los últimos 4 caracteres', () => {
    expect(LeadCaptureResendApiKey.last4('re_test_wxyz')).toBe('wxyz');
    expect(LeadCaptureResendApiKey.last4('')).toBeNull();
  });
});
