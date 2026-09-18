import { BadRequestException } from '@nestjs/common';
import { CommandBus, EventPublisher } from '@nestjs/cqrs';
import { Test, TestingModule } from '@nestjs/testing';
import { getCurrentConsentVersion } from 'src/context/consent/domain/config/consent-version.config';
import { ConsentVersion } from 'src/context/consent/domain/value-objects/consent-version';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { SubmitContactDataCommand } from '../submit-contact-data.command';
import { SubmitContactDataCommandHandler } from '../submit-contact-data.command-handler';

describe('SubmitContactDataCommandHandler', () => {
  let handler: SubmitContactDataCommandHandler;
  let messageRepository: { findByType: jest.Mock; save: jest.Mock };
  let commandBus: { execute: jest.Mock };
  let commit: jest.Mock;

  const chatId = Uuid.random().value;
  const visitorId = Uuid.random().value;
  const companyId = Uuid.random().value;
  const requestId = Uuid.random().value;

  const validData = {
    nombre: 'Ana',
    email: 'ana@test.com',
    telefono: '+34600111222',
    poblacion: 'Madrid',
    acceptedPrivacyPolicy: true,
    acceptedMarketing: true,
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
              legal: {
                privacyPolicyUrl: 'https://concesionario.test/privacidad',
                privacyCheckboxLabel:
                  'He leído y acepto la política de privacidad',
                marketingCheckboxLabel: 'Acepto recibir comunicaciones',
              },
            },
          },
        ]),
      ),
      save: jest.fn().mockResolvedValue(okVoid()),
    };
    commandBus = {
      execute: jest.fn().mockResolvedValue(ok(Uuid.random().value)),
    };
    commit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmitContactDataCommandHandler,
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue(
              ok({
                visitorId: { value: visitorId, getValue: () => visitorId },
                companyId,
              }),
            ),
          },
        },
        { provide: MESSAGE_V2_REPOSITORY, useValue: messageRepository },
        { provide: CommandBus, useValue: commandBus },
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

    handler = module.get(SubmitContactDataCommandHandler);
  });

  it('no permite enviar si el visitante ya canceló esa solicitud', async () => {
    messageRepository.findByType.mockResolvedValue(
      ok([
        {
          systemData: {
            action: 'contact_request',
            status: 'pending',
            requestId,
          },
        },
        {
          systemData: {
            action: 'contact_cancellation',
            status: 'cancelled',
            requestId,
          },
        },
      ]),
    );

    await expect(
      handler.execute(
        new SubmitContactDataCommand(chatId, visitorId, validData),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige población', async () => {
    await expect(
      handler.execute(
        new SubmitContactDataCommand(chatId, visitorId, {
          ...validData,
          poblacion: '  ',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exige el check de privacidad', async () => {
    await expect(
      handler.execute(
        new SubmitContactDataCommand(chatId, visitorId, {
          ...validData,
          acceptedPrivacyPolicy: false,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('guarda los datos y registra privacy_policy y marketing', async () => {
    const result = await handler.execute(
      new SubmitContactDataCommand(
        chatId,
        visitorId,
        validData,
        '1.1.1.1',
        'jest',
      ),
    );

    expect(result.systemData?.data?.poblacion).toBe('Madrid');
    expect(result.systemData?.acceptedPrivacyPolicy).toBe(true);
    expect(result.systemData?.acceptedMarketing).toBe(true);
    expect(commandBus.execute).toHaveBeenCalledTimes(2);
    expect(commandBus.execute.mock.calls[0][0].consentType).toBe(
      'privacy_policy',
    );
    expect(commandBus.execute.mock.calls[1][0].consentType).toBe('marketing');
    expect(commit).toHaveBeenCalled();
  });

  it('registra el consentimiento con la versión vigente de la política', async () => {
    await handler.execute(
      new SubmitContactDataCommand(
        chatId,
        visitorId,
        validData,
        '127.0.0.1',
        'jest',
      ),
    );

    const version: string = commandBus.execute.mock.calls[0][0].version;
    expect(version).toBe(getCurrentConsentVersion());
    expect(() => ConsentVersion.fromString(version)).not.toThrow();
    expect(commandBus.execute.mock.calls[0][0].metadata).toMatchObject({
      source: 'contact_form',
      chatId,
    });
  });

  it('no registra marketing si el check opcional está desmarcado', async () => {
    await handler.execute(
      new SubmitContactDataCommand(chatId, visitorId, {
        ...validData,
        acceptedMarketing: false,
      }),
    );

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(commandBus.execute.mock.calls[0][0].consentType).toBe(
      'privacy_policy',
    );
  });
});
