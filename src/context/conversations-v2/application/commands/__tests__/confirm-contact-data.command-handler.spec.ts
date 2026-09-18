import { BadRequestException } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { ConfirmContactDataCommand } from '../confirm-contact-data.command';
import { ConfirmContactDataCommandHandler } from '../confirm-contact-data.command-handler';

describe('ConfirmContactDataCommandHandler', () => {
  let handler: ConfirmContactDataCommandHandler;
  let messageRepository: { findByType: jest.Mock; save: jest.Mock };
  let commit: jest.Mock;

  const chatId = Uuid.random().value;
  const commercialId = Uuid.random().value;
  const visitorId = Uuid.random().value;
  const requestId = Uuid.random().value;

  const submissionMessage = {
    systemData: {
      action: 'contact_submission',
      status: 'submitted',
      requestId,
      data: {
        nombre: 'Ana',
        email: 'ana@example.com',
        telefono: '600111222',
        poblacion: 'Barcelona',
      },
    },
  };

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
          submissionMessage,
        ]),
      ),
      save: jest.fn().mockResolvedValue(okVoid()),
    };
    commit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfirmContactDataCommandHandler,
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

    handler = module.get(ConfirmContactDataCommandHandler);
  });

  it('confirma los datos enviados por el visitante', async () => {
    const result = await handler.execute(
      new ConfirmContactDataCommand(chatId, commercialId, requestId),
    );

    expect(result.systemData?.action).toBe('contact_confirmation');
    expect(result.systemData?.status).toBe('confirmed');
    expect(result.systemData?.requestId).toBe(requestId);
    expect(result.systemData?.data?.nombre).toBe('Ana');
    expect(commit).toHaveBeenCalled();
  });

  it('rechaza si el visitante todavía no ha enviado los datos', async () => {
    messageRepository.findByType.mockResolvedValue(
      ok([
        {
          systemData: {
            action: 'contact_request',
            status: 'pending',
            requestId,
          },
        },
      ]),
    );

    await expect(
      handler.execute(
        new ConfirmContactDataCommand(chatId, commercialId, requestId),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza una confirmación duplicada', async () => {
    messageRepository.findByType.mockResolvedValue(
      ok([
        submissionMessage,
        {
          systemData: {
            action: 'contact_confirmation',
            status: 'confirmed',
            requestId,
          },
        },
      ]),
    );

    await expect(
      handler.execute(
        new ConfirmContactDataCommand(chatId, commercialId, requestId),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si falta el requestId', async () => {
    await expect(
      handler.execute(new ConfirmContactDataCommand(chatId, commercialId, '')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
