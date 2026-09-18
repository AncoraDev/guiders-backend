import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { GetLeadCaptureFlowQuery } from './get-lead-capture-flow.query';
import {
  LEAD_CAPTURE_FLOW_REPOSITORY,
  LeadCaptureFlowRepository,
} from '../../domain/lead-capture-flow.repository';
import { LeadCaptureFlowPrimitives } from '../../domain/entities/lead-capture-flow';
import { LeadCaptureError } from '../../domain/errors/lead-capture.error';

@QueryHandler(GetLeadCaptureFlowQuery)
export class GetLeadCaptureFlowQueryHandler
  implements IQueryHandler<GetLeadCaptureFlowQuery>
{
  constructor(
    @Inject(LEAD_CAPTURE_FLOW_REPOSITORY)
    private readonly repository: LeadCaptureFlowRepository,
  ) {}

  async execute(
    query: GetLeadCaptureFlowQuery,
  ): Promise<Result<LeadCaptureFlowPrimitives | null, LeadCaptureError>> {
    const found = await this.repository.findByCompanyId(query.companyId);
    if (found.isErr()) return err(found.error);
    const flow = found.unwrap();
    return ok(flow ? flow.toPrimitives() : null);
  }
}
