import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { CommandBus, EventPublisher, QueryBus } from '@nestjs/cqrs';
import { EMAIL_SENDER_SERVICE } from 'src/context/shared/domain/email/email-sender.service';
import { Test, TestingModule } from '@nestjs/testing';
import { getCurrentConsentVersion } from 'src/context/consent/domain/config/consent-version.config';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { err, ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompleteLeadCaptureSessionCommand } from 'src/context/lead-capture/application/commands/complete-lead-capture-session.command';
import { RecordConsentCommand } from 'src/context/consent/application/commands/record-consent.command';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { MESSAGE_V2_REPOSITORY } from '../../../domain/message.repository';
import { SubmitLeadCaptureCommand } from '../submit-lead-capture.command';
import { SubmitLeadCaptureCommandHandler } from '../submit-lead-capture.command-handler';

class TestError extends DomainError {}

describe('SubmitLeadCaptureCommandHandler', () => {
  let handler: SubmitLeadCaptureCommandHandler;
  let messageRepository: { save: jest.Mock };
  let chatRepository: { findById: jest.Mock };
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };
  let emailSender: { sendEmail: jest.Mock };
  let commit: jest.Mock;

  const chatId = Uuid.random().value;
  const visitorId = Uuid.random().value;
  const companyId = Uuid.random().value;
  const flowId = Uuid.random().value;

  const validData = {
    flowId,
    nombre: 'Ana',
    email: 'ana@test.com',
    telefono: '+34600111222',
    comentarios: 'Quiero una cita esta semana',
    poblacion: 'Madrid',
    acceptedPrivacyPolicy: true,
    acceptedMarketing: false,
    answers: [
      {
        stepId: 'interes',
        prompt: '¿Qué te interesa?',
        answer: 'Coche nuevo',
      },
      {
        stepId: 'modelo',
        prompt: '¿Qué modelo buscas?',
        answer: 'Ibiza',
        field: 'interes',
      },
    ],
  };

  beforeEach(async () => {
    chatRepository = {
      findById: jest.fn().mockResolvedValue(
        ok({
          visitorId: { value: visitorId },
          companyId,
        }),
      ),
    };
    messageRepository = { save: jest.fn().mockResolvedValue(okVoid()) };
    commandBus = {
      execute: jest.fn().mockResolvedValue(ok(Uuid.random().value)),
    };
    queryBus = { execute: jest.fn().mockResolvedValue(null) };
    emailSender = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    commit = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmitLeadCaptureCommandHandler,
        { provide: CHAT_V2_REPOSITORY, useValue: chatRepository },
        { provide: MESSAGE_V2_REPOSITORY, useValue: messageRepository },
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
        { provide: EMAIL_SENDER_SERVICE, useValue: emailSender },
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

    handler = module.get(SubmitLeadCaptureCommandHandler);
  });

  /** Los comandos se buscan por tipo: el orden de despacho no es el contrato. */
  const dispatchedCommands = (): unknown[] =>
    (commandBus.execute.mock.calls as unknown[][]).map((call) => call[0]);

  const consentCommands = (): RecordConsentCommand[] =>
    dispatchedCommands().filter(
      (cmd): cmd is RecordConsentCommand => cmd instanceof RecordConsentCommand,
    );

  it('guarda el lead, deja el resumen en el hilo y publica los eventos', async () => {
    const result = await handler.execute(
      new SubmitLeadCaptureCommand(
        chatId,
        visitorId,
        validData,
        '1.1.1.1',
        'jest',
      ),
    );

    expect(result.systemData?.action).toBe('lead_capture_submission');
    expect(result.systemData?.capturedWithoutAgent).toBe(true);
    expect(result.systemData?.answers).toHaveLength(2);
    expect(result.systemData?.data?.email).toBe('ana@test.com');
    expect(result.systemData?.data?.comentarios).toBe(
      'Quiero una cita esta semana',
    );
    expect(messageRepository.save).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalled();

    const leadCommand = commandBus.execute.mock.calls[0][0];
    expect(leadCommand.input.companyId).toBe(companyId);
    expect(leadCommand.input.nombre).toBe('Ana');
    expect(leadCommand.input.additionalData.comentario).toBe(
      'Quiero una cita esta semana',
    );
    expect(leadCommand.input.extractedFromChatId).toBe(chatId);
  });

  it('guarda el lead antes de escribir en el hilo', async () => {
    const order: string[] = [];
    commandBus.execute.mockImplementation(() => {
      order.push('lead');
      return Promise.resolve(ok(Uuid.random().value));
    });
    messageRepository.save.mockImplementation(() => {
      order.push('mensaje');
      return Promise.resolve(okVoid());
    });

    await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, validData),
    );

    expect(order[0]).toBe('lead');
    expect(order[1]).toBe('mensaje');
  });

  it('manda las respuestas libres a additionalData junto al recorrido', async () => {
    await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, validData),
    );

    const additionalData = commandBus.execute.mock.calls[0][0].input
      .additionalData as Record<string, unknown>;
    expect(additionalData['interes']).toBe('Ibiza');
    expect(additionalData['leadCapture']).toMatchObject({
      flowId,
      capturedWithoutAgent: true,
    });
  });

  it('registra privacy_policy con la versión vigente y marca el origen', async () => {
    await handler.execute(
      new SubmitLeadCaptureCommand(
        chatId,
        visitorId,
        validData,
        '1.1.1.1',
        'jest',
      ),
    );

    const consents = consentCommands();
    expect(consents).toHaveLength(1);
    expect(consents[0].consentType).toBe('privacy_policy');
    expect(consents[0].version).toBe(getCurrentConsentVersion());
    expect(consents[0].metadata).toMatchObject({
      source: 'lead_capture',
      chatId,
    });
  });

  it('registra marketing solo si el visitante lo acepta', async () => {
    await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, {
        ...validData,
        acceptedMarketing: true,
      }),
    );

    expect(consentCommands().map((cmd) => cmd.consentType)).toEqual([
      'privacy_policy',
      'marketing',
    ]);
  });

  it('cierra la captación del visitante para que no se le vuelva a ofrecer', async () => {
    await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, validData),
    );

    const close = dispatchedCommands().find(
      (cmd): cmd is CompleteLeadCaptureSessionCommand =>
        cmd instanceof CompleteLeadCaptureSessionCommand,
    );

    expect(close).toBeDefined();
    expect(close?.visitorId).toBe(visitorId);
    expect(close?.chatId).toBe(chatId);
    expect(close?.companyId).toBe(companyId);
  });

  it('avisa por email si la empresa tiene Resend y correo de captación', async () => {
    queryBus.execute.mockResolvedValue({
      email: 'avisos@concesionario.com',
      from: 'Guiders <no-reply@concesionario.com>',
      apiKeyConfigured: true,
      apiKeyLast4: 'abcd',
      apiKey: 're_test_abcd',
    });

    await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, validData),
    );

    expect(emailSender.sendEmail).toHaveBeenCalledTimes(1);
    expect(emailSender.sendEmail.mock.calls[0][0]).toMatchObject({
      to: 'avisos@concesionario.com',
      from: 'Guiders <no-reply@concesionario.com>',
      apiKey: 're_test_abcd',
    });
    expect(emailSender.sendEmail.mock.calls[0][0].html).toContain(
      'Quiero una cita esta semana',
    );
  });

  it('no avisa si falta el correo, el remitente o la API key', async () => {
    queryBus.execute.mockResolvedValue({
      email: 'avisos@concesionario.com',
      from: '',
      apiKeyConfigured: false,
      apiKeyLast4: null,
      apiKey: null,
    });

    await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, validData),
    );

    expect(emailSender.sendEmail).not.toHaveBeenCalled();
  });

  it('completa la captación aunque falle el email', async () => {
    queryBus.execute.mockResolvedValue({
      email: 'avisos@concesionario.com',
      from: 'no-reply@concesionario.com',
      apiKeyConfigured: true,
      apiKeyLast4: 'abcd',
      apiKey: 're_test_abcd',
    });
    emailSender.sendEmail.mockRejectedValue(new Error('Resend cayó'));

    const result = await handler.execute(
      new SubmitLeadCaptureCommand(chatId, visitorId, validData),
    );

    expect(result.systemData?.action).toBe('lead_capture_submission');
    expect(messageRepository.save).toHaveBeenCalled();
  });

  it('exige el check de privacidad', async () => {
    await expect(
      handler.execute(
        new SubmitLeadCaptureCommand(chatId, visitorId, {
          ...validData,
          acceptedPrivacyPolicy: false,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('exige nombre, email, teléfono y comentarios', async () => {
    await expect(
      handler.execute(
        new SubmitLeadCaptureCommand(chatId, visitorId, {
          ...validData,
          comentarios: '  ',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      handler.execute(
        new SubmitLeadCaptureCommand(chatId, visitorId, {
          ...validData,
          email: '',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      handler.execute(
        new SubmitLeadCaptureCommand(chatId, visitorId, {
          ...validData,
          telefono: '  ',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza si el chat es de otro visitante', async () => {
    chatRepository.findById.mockResolvedValue(
      ok({ visitorId: { value: Uuid.random().value }, companyId }),
    );

    await expect(
      handler.execute(
        new SubmitLeadCaptureCommand(chatId, visitorId, validData),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no escribe en el hilo si no se pudo guardar el lead', async () => {
    commandBus.execute.mockResolvedValueOnce(err(new TestError('Mongo cayó')));

    await expect(
      handler.execute(
        new SubmitLeadCaptureCommand(chatId, visitorId, validData),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(messageRepository.save).not.toHaveBeenCalled();
  });
});
