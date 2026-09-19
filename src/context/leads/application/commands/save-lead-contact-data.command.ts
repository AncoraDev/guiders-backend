/**
 * Command para guardar o actualizar datos de contacto de un lead
 */
export class SaveLeadContactDataCommand {
  constructor(
    public readonly input: {
      visitorId: string;
      companyId: string;
      alias?: string;
      nombre?: string;
      apellidos?: string;
      email?: string;
      telefono?: string;
      dni?: string;
      poblacion?: string;
      acceptedPrivacyPolicy?: boolean;
      acceptedMarketing?: boolean;
      additionalData?: Record<string, unknown>;
      extractedFromChatId?: string;
      attributeCapture?: boolean;
      capturedBy?: string;
      capturedByName?: string;
    },
  ) {}
}
