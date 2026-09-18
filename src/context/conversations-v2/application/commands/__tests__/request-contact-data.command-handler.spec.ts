import { EventPublisher, QueryBus } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { RequestContactDataCommand } from '../request-contact-data.command';
import { RequestContactDataCommandHandler } from '../request-contact-data.command-handler';

describe('RequestContactDataCommandHandler', () => {
  let handler: RequestContactDataCommandHandler;
  let chatRepository: { findById: jest.Mock };
  let messageRepository: { save: jest.Mock };
  let queryBus: { execute: jest.Mock };
  let commit: jest.Mock;

  const chatId = Uuid.random().value;
  const commercialId = Uuid.random().value;
  const visitorId = Uuid.random().value;
  const companyId = Uuid.random().value;

  beforeEach(async () => {
    chatRepository = {
      findById: jest.fn().mockResolvedValue(
        ok({
          visitorId: { getValue: () => visitorId, value: visitorId },
          companyId,
        }),
      ),
    };
    messageRepository = {
      save: jest.fn().mockResolvedValue(okVoid()),
    };
    queryBus = {
      execute: jest.fn().mockResolvedValue({
        privacyPolicyUrl: 'https://concesionario.test/privacidad',
        privacyCheckboxLabel: 'He leído y acepto la política de privacidad',
        marketingCheckboxLabel: 'Acepto recibir comunicaciones',
      }),
    };
    commit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestContactDataCommandHandler,
        { provide: CHAT_V2_REPOSITORY, useValue: chatRepository },
        { provide: MESSAGE_V2_REPOSITORY, useValue: messageRepository },
        { provide: QueryBus, useValue: queryBus },
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

    handler = module.get(RequestContactDataCommandHandler);
  });

  it('persiste el preface y el snapshot legal en systemData', async () => {
    const result = await handler.execute(
      new RequestContactDataCommand(
        chatId,
        commercialId,
        '  ¿Me dejas tu teléfono?  ',
      ),
    );

    expect(result.systemData?.preface).toBe('¿Me dejas tu teléfono?');
    expect(result.content).toBe('¿Me dejas tu teléfono?');
    expect(result.systemData?.legal).toEqual({
      privacyPolicyUrl: 'https://concesionario.test/privacidad',
      privacyCheckboxLabel: 'He leído y acepto la política de privacidad',
      marketingCheckboxLabel: 'Acepto recibir comunicaciones',
    });
    expect(result.systemData?.action).toBe('contact_request');
    expect(commit).toHaveBeenCalled();
  });

  it('usa el preface por defecto si el comercial no escribió nada', async () => {
    const result = await handler.execute(
      new RequestContactDataCommand(chatId, commercialId, '   '),
    );

    expect(result.systemData?.preface).toBe(
      'Para atenderte mejor, necesitamos unos datos.',
    );
  });

  it('crea una solicitud nueva en cada ejecución', async () => {
    const first = await handler.execute(
      new RequestContactDataCommand(chatId, commercialId),
    );
    const second = await handler.execute(
      new RequestContactDataCommand(chatId, commercialId),
    );

    expect(first.systemData?.action).toBe('contact_request');
    expect(second.systemData?.action).toBe('contact_request');
    expect(first.systemData?.requestId).not.toBe(second.systemData?.requestId);
    expect(messageRepository.save).toHaveBeenCalledTimes(2);
  });
});
