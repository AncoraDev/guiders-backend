export interface CompanyLeadCaptureNotifySettings {
  email: string;
  from: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string | null;
  /** Clave en claro, solo para el envío interno. El GET HTTP no la expone. */
  apiKey: string | null;
}
