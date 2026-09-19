import { isCapturedWithoutAgent } from './lead-follow-up';

export interface CommercialCaptureFields {
  capturedBy?: string;
  capturedByName?: string;
  capturedAt?: Date;
}

/**
 * Atribuye el lead al comercial solo en la confirmación de la solicitud.
 * No pisa una atribución previa ni los leads del asistente.
 */
export function resolveCommercialCapture(params: {
  existing?: CommercialCaptureFields & {
    additionalData?: Record<string, unknown>;
  };
  additionalData?: Record<string, unknown>;
  attributeCapture?: boolean;
  commercialId?: string;
  commercialName?: string;
}): CommercialCaptureFields {
  if (params.existing?.capturedBy) {
    return {
      capturedBy: params.existing.capturedBy,
      capturedByName: params.existing.capturedByName,
      capturedAt: params.existing.capturedAt,
    };
  }

  if (!params.attributeCapture || !params.commercialId?.trim()) {
    return {};
  }

  const additionalData =
    params.additionalData ?? params.existing?.additionalData;
  if (isCapturedWithoutAgent(additionalData)) {
    return {};
  }

  const name = params.commercialName?.trim();
  return {
    capturedBy: params.commercialId.trim(),
    capturedByName: name || undefined,
    capturedAt: new Date(),
  };
}
