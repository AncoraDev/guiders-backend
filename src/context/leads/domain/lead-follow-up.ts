/**
 * Seguimiento que hace el comercial sobre un lead captado
 * (asistente, formulario o ficha).
 */
export const LEAD_FOLLOW_UP_STATUSES = [
  'pending',
  'contacted',
  'dismissed',
] as const;

export type LeadFollowUpStatus = (typeof LEAD_FOLLOW_UP_STATUSES)[number];

export function isCapturedWithoutAgent(
  additionalData?: Record<string, unknown>,
): boolean {
  const capture = additionalData?.['leadCapture'];
  if (!capture || typeof capture !== 'object') return false;
  return (
    (capture as { capturedWithoutAgent?: unknown }).capturedWithoutAgent ===
    true
  );
}

/**
 * Status persistido. Un documento viejo sin campo entra en Por tratar.
 */
export function resolveFollowUpStatus(
  additionalData?: Record<string, unknown>,
  stored?: LeadFollowUpStatus,
): LeadFollowUpStatus {
  if (stored) return stored;
  return 'pending';
}
