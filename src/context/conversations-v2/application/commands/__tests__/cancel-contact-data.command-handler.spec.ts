import { BadRequestException } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { CancelContactDataCommand } from '../cancel-contact-data.command';
import { CancelContactDataCommandHandler } from '../cancel-contact-data.command-handler';

describe('CancelContactDataCommandHandler', () => {
  let handler: CancelContactDataCommandHandler;
  let messageRepository: { findByType: jest.Mock; save: jest.Mock };
  let commit: jest.Mock;

  const chatId = Uuid.random().value;
  const visitorId = Uuid.random().value;
  const requestId = Uuid.random().value;

  beforeEach(async () => {
    messageRepository = {
      findByType: jest.fn().mockResolvedValue(
        ok([
          {
            systemData: {
              action: 'contact_request',
              status: 'pending',
              requestId,
            },
          },
        ]),
      ),
      save: jest.fn().mockResolvedValue(okVoid()),
    };
    commit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CancelContactDataCommandHandler,
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue(
              ok({
                visitorId: { value: visitorId, getValue: () => visitorId },
              }),
            ),
          },
        },
        { provide: MESSAGE_V2_REPOSITORY, useValue: messageRepository },
        {
          provide: EventPublisher,
          useValue: {
            mergeObjectContext: jest.fn((aggregate: { commit: () => void }) => {
              aggregate.commit = commit;
              return aggregate;
            }),
          },
        },
      ],
    }).compile();

    handler = module.get(CancelContactDataCommandHandler);
  });

  it('cancela la solicitud pendiente', async () => {
    const result = await handler.execute(
      new CancelContactDataCommand(chatId, visitorId),
    );

    expect(result.systemData?.action).toBe('contact_cancellation');
    expect(result.systemData?.status).toBe('cancelled');
    expect(result.systemData?.requestId).toBe(requestId);
    expect(commit).toHaveBeenCalled();
  });

  it('rechaza si no hay solicitud pendiente', async () => {
    messageRepository.findByType.mockResolvedValue(ok([]));

    await expect(
      handler.execute(new CancelContactDataCommand(chatId, visitorId)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
