import { Test, TestingModule } from '@nestjs/testing';
import { err, ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { LeadCaptureSession } from '../../../domain/entities/lead-capture-session';
import { LeadCaptureError } from '../../../domain/errors/lead-capture.error';
import { LEAD_CAPTURE_SESSION_REPOSITORY } from '../../../domain/lead-capture-session.repository';
import { SaveLeadCaptureSessionCommand } from '../save-lead-capture-session.command';
import { SaveLeadCaptureSessionCommandHandler } from '../save-lead-capture-session.command-handler';

describe('SaveLeadCaptureSessionCommandHandler', () => {
  let handler: SaveLeadCaptureSessionCommandHandler;
  let repository: { findByVisitorId: jest.Mock; save: jest.Mock };

  const visitorId = Uuid.random().value;
  const companyId = Uuid.random().value;
  const chatId = Uuid.random().value;

  const validInput = {
    visitorId,
    companyId,
    chatId,
    flowId: Uuid.random().value,
    phase: 'steps' as const,
    stepId: 'presupuesto',
    answers: [
      {
        stepId: 'interes',
        prompt: '¿Qué te interesa?',
        answer: 'Coche nuevo',
      },
    ],
    trail: ['interes'],
  };

  beforeEach(async () => {
    repository = {
      findByVisitorId: jest.fn().mockResolvedValue(ok(null)),
      save: jest.fn().mockResolvedValue(okVoid()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveLeadCaptureSessionCommandHandler,
        { provide: LEAD_CAPTURE_SESSION_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(SaveLeadCaptureSessionCommandHandler);
  });

  it('crea la captación del visitante que entra por primera vez en el guion', async () => {
    const result = await handler.execute(
      new SaveLeadCaptureSessionCommand(validInput),
    );

    expect(result.isOk()).toBe(true);
    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureSession
    ).toPrimitives();
    expect(saved.visitorId).toBe(visitorId);
    expect(saved.status).toBe('in_progress');
    expect(saved.stepId).toBe('presupuesto');
    expect(saved.answers).toHaveLength(1);
  });

  it('actualiza el chat de la captación cuando el visitante vuelve con otro chat', async () => {
    const otherChatId = Uuid.random().value;
    repository.findByVisitorId.mockResolvedValue(
      ok(
        LeadCaptureSession.fromPrimitives({
          id: Uuid.random().value,
          visitorId,
          companyId,
          chatId: otherChatId,
          status: 'in_progress',
          phase: 'steps',
          stepId: 'interes',
          answers: [],
          trail: [],
          startedAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          completedAt: null,
        }),
      ),
    );

    await handler.execute(new SaveLeadCaptureSessionCommand(validInput));

    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureSession
    ).toPrimitives();
    expect(saved.chatId).toBe(chatId);
    expect(saved.startedAt).toEqual(new Date('2026-01-01'));
  });

  it('marca la captación como completada cuando el guion llega al final', async () => {
    await handler.execute(
      new SaveLeadCaptureSessionCommand({
        ...validInput,
        phase: 'done',
        stepId: null,
      }),
    );

    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureSession
    ).toPrimitives();
    expect(saved.status).toBe('completed');
    expect(saved.completedAt).not.toBeNull();
  });

  it('no reabre una captación ya enviada', async () => {
    repository.findByVisitorId.mockResolvedValue(
      ok(
        LeadCaptureSession.fromPrimitives({
          id: Uuid.random().value,
          visitorId,
          companyId,
          chatId,
          status: 'completed',
          phase: 'done',
          stepId: null,
          answers: [],
          trail: [],
          startedAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-02'),
          completedAt: new Date('2026-01-02'),
        }),
      ),
    );

    const result = await handler.execute(
      new SaveLeadCaptureSessionCommand(validInput),
    );

    expect(result.isOk()).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rechaza un progreso con más respuestas de las que admite un guion', async () => {
    const answers = Array.from({ length: 21 }, (_, index) => ({
      stepId: `paso-${index}`,
      prompt: 'Pregunta',
      answer: 'Respuesta',
    }));

    const result = await handler.execute(
      new SaveLeadCaptureSessionCommand({ ...validInput, answers }),
    );

    expect(result.isErr()).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propaga el error si falla la persistencia', async () => {
    repository.save.mockResolvedValue(
      err(new LeadCaptureError('Mongo no responde')),
    );

    const result = await handler.execute(
      new SaveLeadCaptureSessionCommand(validInput),
    );

    expect(result.isErr()).toBe(true);
  });
});
