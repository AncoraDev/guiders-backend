import {
  LeadCaptureSessionAnswerPrimitives,
  LeadCaptureSessionPhase,
} from '../../domain/entities/lead-capture-session';

export interface SaveLeadCaptureSessionInput {
  visitorId: string;
  /** Solo si el token del visitante la trae; es metadato, no clave. */
  companyId?: string;
  chatId: string | null;
  flowId?: string;
  phase: LeadCaptureSessionPhase;
  stepId: string | null;
  answers: LeadCaptureSessionAnswerPrimitives[];
  trail: string[];
}

export class SaveLeadCaptureSessionCommand {
  constructor(public readonly input: SaveLeadCaptureSessionInput) {}
}
