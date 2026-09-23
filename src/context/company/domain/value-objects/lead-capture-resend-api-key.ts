/** API key de Resend del cliente (`re_…`). Vacío = no configurada / no cambiar. */
export class LeadCaptureResendApiKey {
  private constructor(public readonly value: string) {}

  public static empty(): LeadCaptureResendApiKey {
    return new LeadCaptureResendApiKey('');
  }

  public static fromInput(raw: unknown): LeadCaptureResendApiKey {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) {
      return LeadCaptureResendApiKey.empty();
    }
    if (
      !trimmed.startsWith('re_') ||
      trimmed.length < 8 ||
      trimmed.length > 256
    ) {
      throw new Error('La API key de Resend no es válida');
    }
    return new LeadCaptureResendApiKey(trimmed);
  }

  public static last4(plain: string): string | null {
    if (!plain || plain.length < 4) {
      return null;
    }
    return plain.slice(-4);
  }
}
