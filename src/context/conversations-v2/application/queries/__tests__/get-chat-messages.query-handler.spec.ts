import { Test, TestingModule } from '@nestjs/testing';
import { GetChatMessagesQueryHandler } from '../get-chat-messages.query-handler';
import { GetChatMessagesQuery } from '../get-chat-messages.query';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { COMMERCIAL_REPOSITORY } from 'src/context/commercial/domain/commercial.repository';
import { Message } from '../../../domain/entities/message.aggregate';
import { ok } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('GetChatMessagesQueryHandler', () => {
  let handler: GetChatMessagesQueryHandler;
  let messages: { findByChatId: jest.Mock };
  let commercials: { findById: jest.Mock };

  const chatId = Uuid.random().value;
  const adminId = Uuid.random().value;
  const albertoId = Uuid.random().value;

  beforeEach(async () => {
    messages = { findByChatId: jest.fn() };
    commercials = {
      findById: jest.fn(async (id: { value: string }) => {
        if (id.value === albertoId) return ok({ name: { value: 'ALBERTO' } });
        return ok(null);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetChatMessagesQueryHandler,
        { provide: MESSAGE_V2_REPOSITORY, useValue: messages },
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: {
            findById: jest
              .fn()
              .mockResolvedValue(
                ok({ visitorId: { getValue: () => Uuid.random().value } }),
              ),
          },
        },
        { provide: COMMERCIAL_REPOSITORY, useValue: commercials },
      ],
    }).compile();

    handler = module.get(GetChatMessagesQueryHandler);
  });

  it('usa el nombre guardado y, si falta, el del perfil comercial', async () => {
    const stored = Message.createTextMessage({
      chatId,
      senderId: adminId,
      content: 'te paso a maria',
      senderName: 'Admin User',
    });
    const legacy = Message.createTextMessage({
      chatId,
      senderId: albertoId,
      content: 'hola',
    });
    const system = Message.createSystemMessage({
      chatId,
      action: 'transferred',
      content: 'Transferido de Admin User a MARIA',
      isInternal: false,
    });

    messages.findByChatId.mockResolvedValue(
      ok({ messages: [stored, legacy, system], total: 3, hasMore: false }),
    );

    const result = await handler.execute(
      new GetChatMessagesQuery({
        chatId,
        userId: Uuid.random().value,
        userRoles: ['commercial'],
      }),
    );

    const bySender = new Map(
      result.messages.map((message) => [message.senderId, message.senderName]),
    );
    expect(bySender.get(adminId)).toBe('Admin User');
    expect(bySender.get(albertoId)).toBe('ALBERTO');
    expect(bySender.get('system')).toBeUndefined();
    expect(commercials.findById).toHaveBeenCalledTimes(1);
  });
});
