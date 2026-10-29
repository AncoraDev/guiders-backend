import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVisitorChatHistoryQuery } from './get-visitor-chat-history.query';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../domain/chat.repository';
import { VisitorId } from '../../domain/value-objects/visitor-id';

export interface VisitorChatHistoryItem {
  id: string;
  status: string;
  updatedAt: string;
}

@QueryHandler(GetVisitorChatHistoryQuery)
export class GetVisitorChatHistoryQueryHandler
  implements
    IQueryHandler<
      GetVisitorChatHistoryQuery,
      { chats: VisitorChatHistoryItem[] }
    >
{
  constructor(
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chats: IChatRepository,
  ) {}

  async execute(
    query: GetVisitorChatHistoryQuery,
  ): Promise<{ chats: VisitorChatHistoryItem[] }> {
    const found = await this.chats.findByVisitorId(VisitorId.create(query.visitorId));
    if (found.isErr()) {
      return { chats: [] };
    }
    const chats = found
      .unwrap()
      .filter((chat) => chat.companyId === query.companyId)
      .slice(0, 10)
      .map((chat) => {
        const primitives = chat.toPrimitives();
        return {
          id: primitives.id,
          status: primitives.status,
          updatedAt: primitives.updatedAt.toISOString(),
        };
      });
    return { chats };
  }
}
