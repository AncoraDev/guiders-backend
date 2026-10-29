/**
 * Motivos de bloqueo de un visitante. El ciclo de vida no cambia.
 */
export const VISITOR_BLOCK_REASONS = [
  'spam',
  'abuse',
  'competitor',
  'test',
  'other',
] as const;

export type VisitorBlockReason = (typeof VISITOR_BLOCK_REASONS)[number];

export interface VisitorBlockRecord {
  blockedAt: string;
  blockedBy: string;
  blockedByName: string;
  reason: VisitorBlockReason;
  note?: string;
}

export interface VisitorUnblockRecord {
  unblockedAt: string;
  unblockedBy: string;
  unblockedByName: string;
}

export function isVisitorBlockReason(value: string): value is VisitorBlockReason {
  return (VISITOR_BLOCK_REASONS as readonly string[]).includes(value);
}

export function visitorBlockReasonLabel(reason: string): string {
  switch (reason) {
    case 'spam':
      return 'Spam';
    case 'abuse':
      return 'Abuso';
    case 'competitor':
      return 'Competencia';
    case 'test':
      return 'Prueba';
    case 'other':
      return 'Otro';
    default:
      return reason;
  }
}
