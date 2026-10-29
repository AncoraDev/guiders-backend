import { Test, TestingModule } from '@nestjs/testing';
import { GetAbsentAssigneeChatsQueryHandler } from '../get-absent-assignee-chats.query-handler';
import { GetAbsentAssigneeChatsQuery } from '../get-absent-assignee-chats.query';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { COMMERCIAL_CONNECTION_DOMAIN_SERVICE } from 'src/context/commercial/domain/commercial-connection.domain-service';
import { COMMERCIAL_REPOSITORY } from 'src/context/commercial/domain/commercial.repository';
import { VISITOR_V2_REPOSITORY } from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { Chat } from '../../../domain/entities/chat.aggregate';
import { ok } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('GetAbsentAssigneeChatsQueryHandler', () => {
  let handler: GetAbsentAssigneeChatsQueryHandler;
  let chats: { match: jest.Mock };
  let connections: { isCommercialOnline: jest.Mock };

  const companyId = Uuid.random().value;
  const requesterId = Uuid.random().value;
  const assigneeId = Uuid.random().value;
  const visitorId = Uuid.random().value;

  beforeEach(async () => {
    chats = { match: jest.fn().mockResolvedValue(ok([])) };
    connections = {
      isCommercialOnline: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAbsentAssigneeChatsQueryHandler,
        { provide: CHAT_V2_REPOSITORY, useValue: chats },
        {
          provide: COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
          useValue: connections,
        },
        {
          provide: VISITOR_V2_REPOSITORY,
          useValue: { findBlockedIds: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: COMMERCIAL_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue(
              ok({ name: { value: 'María' } }),
            ),
          },
        },
      ],
    }).compile();

    handler = module.get(GetAbsentAssigneeChatsQueryHandler);
  });

  it('no lista nada si quien pregunta no está conectado', async () => {
    connections.isCommercialOnline.mockResolvedValue(false);

    const result = await handler.execute(
      new GetAbsentAssigneeChatsQuery(companyId, requesterId),
    );

    expect(result.unwrap()).toEqual([]);
    expect(chats.match).not.toHaveBeenCalled();
  });

  it('incluye el chat si el asignado está ausente y no es quien pregunta', async () => {
    const assigned = Chat.createPendingChat({
      visitorId,
      companyId,
      visitorInfo: { name: 'Ana' },
      availableCommercialIds: [assigneeId],
    }).assignCommercial(assigneeId);
    chats.match.mockResolvedValue(ok([assigned]));
    connections.isCommercialOnline.mockImplementation(
      async (id: { value: string }) => id.value === requesterId,
    );

    const result = await handler.execute(
      new GetAbsentAssigneeChatsQuery(companyId, requesterId),
    );

    const rows = result.unwrap();
    expect(rows).toHaveLength(1);
    expect(rows[0].assignedCommercialId).toBe(assigneeId);
    expect(rows[0].assignedCommercialName).toBe('María');
    expect(rows[0].visitorId).toBe(visitorId);
  });

  it('excluye el chat si el asignado está conectado', async () => {
    const assigned = Chat.createPendingChat({
      visitorId,
      companyId,
      visitorInfo: { name: 'Ana' },
      availableCommercialIds: [assigneeId],
    }).assignCommercial(assigneeId);
    chats.match.mockResolvedValue(ok([assigned]));
    connections.isCommercialOnline.mockResolvedValue(true);

    const result = await handler.execute(
      new GetAbsentAssigneeChatsQuery(companyId, requesterId),
    );

    expect(result.unwrap()).toEqual([]);
  });
});
