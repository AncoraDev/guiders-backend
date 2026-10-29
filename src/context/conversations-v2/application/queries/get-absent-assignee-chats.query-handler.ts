import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result, ok, err } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/domain.error';
import { Criteria, Filter, Operator } from '../../../shared/domain/criteria';
import { GetAbsentAssigneeChatsQuery } from './get-absent-assignee-chats.query';
import { Chat } from '../../domain/entities/chat.aggregate';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from 'src/context/commercial/domain/commercial-connection.domain-service';
import { CommercialId } from 'src/context/commercial/domain/value-objects/commercial-id';
import { withoutBlockedVisitors } from '../visitor-block';
import {
  VISITOR_V2_REPOSITORY,
  VisitorV2Repository,
} from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { senderDisplayNames } from '../sender-display-name';
import {
  COMMERCIAL_REPOSITORY,
  CommercialRepository,
} from 'src/context/commercial/domain/commercial.repository';
import { openAssigneeId } from '../absent-assignee';

export class GetAbsentAssigneeChatsError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export interface AbsentAssigneeChatView {
  id: string;
  status: string;
  visitorId: string;
  assignedCommercialId: string;
  assignedCommercialName: string;
  companyId: string;
  visitorInfo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lastMessagePreview?: string;
  lastMessageDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SCAN_LIMIT = 200;

@QueryHandler(GetAbsentAssigneeChatsQuery)
export class GetAbsentAssigneeChatsQueryHandler
  implements
    IQueryHandler<
      GetAbsentAssigneeChatsQuery,
      Result<AbsentAssigneeChatView[], DomainError>
    >
{
  private readonly logger = new Logger(
    GetAbsentAssigneeChatsQueryHandler.name,
  );

  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly connections: CommercialConnectionDomainService,
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitors: VisitorV2Repository,
    @Inject(COMMERCIAL_REPOSITORY)
    private readonly commercials: CommercialRepository,
  ) {}

  async execute(
    query: GetAbsentAssigneeChatsQuery,
  ): Promise<Result<AbsentAssigneeChatView[], DomainError>> {
    try {
      if (!query.companyId || !query.requesterId) return ok([]);

      const requesterOnline = await this.connections.isCommercialOnline(
        new CommercialId(query.requesterId),
      );
      if (!requesterOnline) return ok([]);

      const limit = Math.min(Math.max(query.limit || 50, 1), 50);
      const found = await this.chatRepository.match(
        new Criteria<Chat>(
          [
            new Filter<Chat>('companyId', Operator.EQUALS, query.companyId),
            new Filter<Chat>('status', Operator.IN, ['ASSIGNED', 'ACTIVE']),
            new Filter<Chat>(
              'assignedCommercialId',
              Operator.IS_NOT_NULL,
              undefined,
            ),
          ],
          { field: 'updatedAt', direction: 'DESC' },
          SCAN_LIMIT,
        ),
      );
      if (found.isErr()) {
        return err(new GetAbsentAssigneeChatsError(found.error.message));
      }

      const visible = await withoutBlockedVisitors(
        this.visitors,
        found.unwrap(),
      );
      const absent: Chat[] = [];
      for (const chat of visible) {
        const assigneeId = openAssigneeId(chat);
        if (!assigneeId || assigneeId === query.requesterId) continue;
        const online = await this.connections.isCommercialOnline(
          new CommercialId(assigneeId),
        );
        if (online) continue;
        absent.push(chat);
        if (absent.length >= limit) break;
      }

      const names = await senderDisplayNames(
        this.commercials,
        absent.map((chat) => openAssigneeId(chat) as string),
      );

      return ok(
        absent.map((chat) => {
          const primitives = chat.toPrimitives();
          const assigneeId = primitives.assignedCommercialId as string;
          return {
            id: primitives.id,
            status: primitives.status,
            visitorId: primitives.visitorId,
            assignedCommercialId: assigneeId,
            assignedCommercialName: names.get(assigneeId) || 'un comercial',
            companyId: primitives.companyId,
            visitorInfo: primitives.visitorInfo as unknown as Record<
              string,
              unknown
            >,
            metadata: primitives.metadata as unknown as
              | Record<string, unknown>
              | undefined,
            lastMessagePreview: primitives.lastMessageContent,
            lastMessageDate: primitives.lastMessageDate,
            createdAt: primitives.createdAt,
            updatedAt: primitives.updatedAt,
          };
        }),
      );
    } catch (error) {
      this.logger.error(
        'Error al listar chats de comerciales ausentes',
        error instanceof Error ? error.stack : String(error),
      );
      return err(
        new GetAbsentAssigneeChatsError(
          'No se pudieron listar los chats de comerciales ausentes',
        ),
      );
    }
  }
}
