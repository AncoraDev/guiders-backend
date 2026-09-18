import { Inject, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ResolveLeadCaptureFlowQuery } from './resolve-lead-capture-flow.query';
import {
  LEAD_CAPTURE_FLOW_REPOSITORY,
  LeadCaptureFlowRepository,
} from '../../domain/lead-capture-flow.repository';
import { LeadCaptureFlowPrimitives } from '../../domain/entities/lead-capture-flow';

@QueryHandler(ResolveLeadCaptureFlowQuery)
export class ResolveLeadCaptureFlowQueryHandler
  implements IQueryHandler<ResolveLeadCaptureFlowQuery>
{
  private readonly logger = new Logger(ResolveLeadCaptureFlowQueryHandler.name);

  constructor(
    @Inject(LEAD_CAPTURE_FLOW_REPOSITORY)
    private readonly repository: LeadCaptureFlowRepository,
  ) {}

  /**
   * Devuelve null cuando no hay guion o está desactivado: el widget se
   * comporta entonces como hasta ahora, sin asistente.
   */
  async execute(
    query: ResolveLeadCaptureFlowQuery,
  ): Promise<LeadCaptureFlowPrimitives | null> {
    const found = await this.repository.findByCompanyId(query.companyId);
    if (found.isErr()) {
      this.logger.error(
        `No se pudo resolver el guion de captación de ${query.companyId}: ${found.error.message}`,
      );
      return null;
    }
    const flow = found.unwrap();
    if (!flow || !flow.enabled) return null;
    return flow.toPrimitives();
  }
}
