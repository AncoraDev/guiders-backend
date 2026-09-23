const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo al que avisar cuando un visitante termina el asistente. Vacío = no avisar. */
export class LeadCaptureNotifyEmail {
  private constructor(public readonly value: string) {}

  public static empty(): LeadCaptureNotifyEmail {
    return new LeadCaptureNotifyEmail('');
  }

  public static fromInput(raw: unknown): LeadCaptureNotifyEmail {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed) {
      return LeadCaptureNotifyEmail.empty();
    }
    if (trimmed.length > 255 || !EMAIL_RE.test(trimmed)) {
      throw new Error('El email de avisos de captación no es válido');
    }
    return new LeadCaptureNotifyEmail(trimmed);
  }

  public static fromPersistence(raw: unknown): LeadCaptureNotifyEmail {
    try {
      return LeadCaptureNotifyEmail.fromInput(raw);
    } catch {
      return LeadCaptureNotifyEmail.empty();
    }
  }
}
