import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result, err, ok } from 'src/context/shared/domain/result';
import { GetLeadCaptureSessionQuery } from './get-lead-capture-session.query';
import {
  LEAD_CAPTURE_SESSION_REPOSITORY,
  LeadCaptureSessionRepository,
} from '../../domain/lead-capture-session.repository';
import { LeadCaptureSessionPrimitives } from '../../domain/entities/lead-capture-session';
import { LeadCaptureError } from '../../domain/errors/lead-capture.error';

@QueryHandler(GetLeadCaptureSessionQuery)
export class GetLeadCaptureSessionQueryHandler
  implements IQueryHandler<GetLeadCaptureSessionQuery>
{
  constructor(
    @Inject(LEAD_CAPTURE_SESSION_REPOSITORY)
    private readonly repository: LeadCaptureSessionRepository,
  ) {}

  async execute(
    query: GetLeadCaptureSessionQuery,
  ): Promise<Result<LeadCaptureSessionPrimitives | null, LeadCaptureError>> {
    const found = await this.repository.findByVisitorId(query.visitorId);
    if (found.isErr()) return err(found.error);
    const session = found.unwrap();
    return ok(session ? session.toPrimitives() : null);
  }
}
