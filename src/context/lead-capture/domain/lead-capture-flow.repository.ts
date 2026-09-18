import { Result } from 'src/context/shared/domain/result';
import { LeadCaptureFlow } from './entities/lead-capture-flow';
import { LeadCaptureError } from './errors/lead-capture.error';

export interface LeadCaptureFlowRepository {
  /** Devuelve null cuando la empresa todavía no ha configurado ningún guion. */
  findByCompanyId(
    companyId: string,
  ): Promise<Result<LeadCaptureFlow | null, LeadCaptureError>>;

  /** Guarda el guion de la empresa; solo hay uno activo por empresa. */
  save(flow: LeadCaptureFlow): Promise<Result<void, LeadCaptureError>>;
}

export const LEAD_CAPTURE_FLOW_REPOSITORY = Symbol('LeadCaptureFlowRepository');
