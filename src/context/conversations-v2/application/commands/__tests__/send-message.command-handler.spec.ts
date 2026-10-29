import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import { SendMessageCommandHandler } from '../send-message.command-handler';
import { SendMessageCommand } from '../send-message.command';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { COMMERCIAL_REPOSITORY } from 'src/context/commercial/domain/commercial.repository';
import { COMMERCIAL_CONNECTION_DOMAIN_SERVICE } from 'src/context/commercial/domain/commercial-connection.domain-service';
import { VISITOR_V2_REPOSITORY } from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { Message } from '../../../domain/entities/message.aggregate';
import { Chat } from '../../../domain/entities/chat.aggregate';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { BadRequestException } from '@nestjs/common';

describe('SendMessageCommandHandler', () => {
  let handler: SendMessageCommandHandler;
  let saved: Message[];
  let commercials: { findById: jest.Mock };
  let chatRepository: { findById: jest.Mock; update: jest.Mock };
  let connections: { isCommercialOnline: jest.Mock };

  const chatId = Uuid.random().value;
  const senderId = Uuid.random().value;

  beforeEach(async () => {
    saved = [];
    commercials = {
      findById: jest.fn().mockResolvedValue(ok({ name: { value: 'ALBERTO' } })),
    };
    chatRepository = {
      findById: jest.fn().mockResolvedValue(ok({})),
      update: jest.fn().mockResolvedValue(okVoid()),
    };
    connections = {
      isCommercialOnline: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendMessageCommandHandler,
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: chatRepository,
        },
        {
          provide: MESSAGE_V2_REPOSITORY,
          useValue: {
            save: jest.fn(async (message: Message) => {
              saved.push(message);
              return okVoid();
            }),
          },
        },
        { provide: COMMERCIAL_REPOSITORY, useValue: commercials },
        {
          provide: VISITOR_V2_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue({ isErr: () => true }),
          },
        },
        {
          provide: COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
          useValue: connections,
        },
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
    expect(saved.at(-1)?.senderName).toBe('ALBERTO');
  });

  it('no guarda nombre si quien escribe no tiene perfil comercial', async () => {
    commercials.findById.mockResolvedValue(ok(null));

    const dto = await handler.execute(
      new SendMessageCommand(chatId, senderId, { content: 'gracias' }),
    );

    expect(dto.senderName).toBeUndefined();
    expect(saved.at(-1)?.senderName).toBeNull();
  });

  it('transfiere el chat si contesta alguien que no es el asignado ausente', async () => {
    const visitorId = Uuid.random().value;
    const assigneeId = Uuid.random().value;
    const colleagueId = Uuid.random().value;
    const assigned = Chat.createPendingChat({
      visitorId,
      companyId: Uuid.random().value,
      visitorInfo: { name: 'Ana' },
      availableCommercialIds: [assigneeId],
    }).assignCommercial(assigneeId);
    chatRepository.findById.mockResolvedValue(ok(assigned));
    commercials.findById.mockImplementation(async (id: { value: string }) =>
      ok({
        name: {
          value: id.value === assigneeId ? 'María' : 'Pedro',
        },
      }),
    );

    await handler.execute(
      new SendMessageCommand(assigned.id.getValue(), colleagueId, {
        content: 'Hola, te atiendo yo',
      }),
    );

    expect(chatRepository.update).toHaveBeenCalled();
    const updated = chatRepository.update.mock.calls[0][0] as Chat;
    expect(updated.isAssignedTo(colleagueId)).toBe(true);
    expect(saved[0].content.value).toBe('Transferido de María a Pedro');
    expect(saved[0].systemData?.action).toBe('transferred');
    expect(saved.at(-1)?.content.value).toBe('Hola, te atiendo yo');
  });

  it('no transfiere una nota interna y rechaza el envío si el asignado volvió', async () => {
    const visitorId = Uuid.random().value;
    const assigneeId = Uuid.random().value;
    const colleagueId = Uuid.random().value;
    const assigned = Chat.createPendingChat({
      visitorId,
      companyId: Uuid.random().value,
      visitorInfo: { name: 'Ana' },
      availableCommercialIds: [assigneeId],
    }).assignCommercial(assigneeId);
    chatRepository.findById.mockResolvedValue(ok(assigned));

    await handler.execute(
      new SendMessageCommand(assigned.id.getValue(), colleagueId, {
        content: 'nota',
        isInternal: true,
      }),
    );
    expect(chatRepository.update).not.toHaveBeenCalled();
    expect(saved.at(-1)?.content.value).toBe('nota');

    connections.isCommercialOnline.mockResolvedValue(true);
    await expect(
      handler.execute(
        new SendMessageCommand(assigned.id.getValue(), colleagueId, {
          content: 'llego tarde',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
