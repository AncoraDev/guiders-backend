const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Remitente verificado en Resend. Acepta `correo@x.com` o `Nombre <correo@x.com>`. */
export class LeadCaptureResendFrom {
  private constructor(public readonly value: string) {}

  public static empty(): LeadCaptureResendFrom {
    return new LeadCaptureResendFrom('');
  }

  public static fromInput(raw: unknown): LeadCaptureResendFrom {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) {
      return LeadCaptureResendFrom.empty();
    }
    if (trimmed.length > 255 || !LeadCaptureResendFrom.isValid(trimmed)) {
      throw new Error('El remitente de Resend no es válido');
    }
    return new LeadCaptureResendFrom(trimmed);
  }

  public static fromPersistence(raw: unknown): LeadCaptureResendFrom {
    try {
      return LeadCaptureResendFrom.fromInput(raw);
    } catch {
      return LeadCaptureResendFrom.empty();
    }
  }

  private static isValid(value: string): boolean {
    const angled = value.match(/^(.+)<([^>]+)>$/);
    const email = angled ? angled[2].trim() : value;
    return EMAIL_RE.test(email);
  }
}
