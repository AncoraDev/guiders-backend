import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { detectTokenKind } from 'src/context/shared/infrastructure/guards/jwt-cookie-auth.guard';
import {
  BFF_SESSION_SERVICE,
  IBffSessionService,
} from '../../domain/services/bff-session.service';
import { BffSessionData } from '../../domain/value-objects/bff-session-data';
import { ResolveEmbedSessionQuery } from './resolve-embed-session.query';

@QueryHandler(ResolveEmbedSessionQuery)
export class ResolveEmbedSessionQueryHandler
  implements IQueryHandler<ResolveEmbedSessionQuery, BffSessionData | null>
{
  constructor(
    @Inject(BFF_SESSION_SERVICE)
    private readonly sessions: IBffSessionService,
  ) {}

  async execute(
    query: ResolveEmbedSessionQuery,
  ): Promise<BffSessionData | null> {
    if (detectTokenKind(query.sessionId) !== 'opaque') return null;
    const result = await this.sessions.getSession(query.sessionId);
    if (result.isErr()) return null;
    return result.unwrap();
  }
}
