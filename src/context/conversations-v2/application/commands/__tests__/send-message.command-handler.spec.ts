import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import { SendMessageCommandHandler } from '../send-message.command-handler';
import { SendMessageCommand } from '../send-message.command';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { COMMERCIAL_REPOSITORY } from 'src/context/commercial/domain/commercial.repository';
import { Message } from '../../../domain/entities/message.aggregate';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('SendMessageCommandHandler', () => {
  let handler: SendMessageCommandHandler;
  let saved: Message | undefined;
  let commercials: { findById: jest.Mock };

  const chatId = Uuid.random().value;
  const senderId = Uuid.random().value;

  beforeEach(async () => {
    saved = undefined;
    commercials = {
      findById: jest.fn().mockResolvedValue(ok({ name: { value: 'ALBERTO' } })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendMessageCommandHandler,
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: { findById: jest.fn().mockResolvedValue(ok({})) },
        },
        {
          provide: MESSAGE_V2_REPOSITORY,
          useValue: {
            save: jest.fn(async (message: Message) => {
              saved = message;
              return okVoid();
            }),
          },
        },
        { provide: COMMERCIAL_REPOSITORY, useValue: commercials },
        {
          provide: EventPublisher,
          useValue: {
            mergeObjectContext: (message: Message) => {
              jest.spyOn(message, 'commit').mockImplementation(() => undefined);
              return message;
            },
          },
        },
      ],
    }).compile();

    handler = module.get(SendMessageCommandHandler);
  });

  it('guarda el nombre del perfil comercial en el mensaje', async () => {
    const dto = await handler.execute(
      new SendMessageCommand(chatId, senderId, { content: 'te paso a maria' }),
    );

    expect(dto.senderName).toBe('ALBERTO');
    expect(saved?.senderName).toBe('ALBERTO');
  });

  it('no guarda nombre si quien escribe no tiene perfil comercial', async () => {
    commercials.findById.mockResolvedValue(ok(null));

    const dto = await handler.execute(
      new SendMessageCommand(chatId, senderId, { content: 'gracias' }),
    );

    expect(dto.senderName).toBeUndefined();
    expect(saved?.senderName).toBeNull();
  });
});
