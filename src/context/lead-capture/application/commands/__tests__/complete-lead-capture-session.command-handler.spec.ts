import { Test, TestingModule } from '@nestjs/testing';
import { ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { LeadCaptureSession } from '../../../domain/entities/lead-capture-session';
import { LEAD_CAPTURE_SESSION_REPOSITORY } from '../../../domain/lead-capture-session.repository';
import { CompleteLeadCaptureSessionCommand } from '../complete-lead-capture-session.command';
import { CompleteLeadCaptureSessionCommandHandler } from '../complete-lead-capture-session.command-handler';

describe('CompleteLeadCaptureSessionCommandHandler', () => {
  let handler: CompleteLeadCaptureSessionCommandHandler;
  let repository: { findByVisitorId: jest.Mock; save: jest.Mock };

  const visitorId = Uuid.random().value;
  const companyId = Uuid.random().value;
  const chatId = Uuid.random().value;

  beforeEach(async () => {
    repository = {
      findByVisitorId: jest.fn().mockResolvedValue(ok(null)),
      save: jest.fn().mockResolvedValue(okVoid()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompleteLeadCaptureSessionCommandHandler,
        { provide: LEAD_CAPTURE_SESSION_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(CompleteLeadCaptureSessionCommandHandler);
  });

  it('cierra la captación a medias del visitante', async () => {
    repository.findByVisitorId.mockResolvedValue(
      ok(
        LeadCaptureSession.fromPrimitives({
          id: Uuid.random().value,
          visitorId,
          companyId,
          chatId: null,
          status: 'in_progress',
          phase: 'final',
          stepId: null,
          answers: [],
          trail: ['interes'],
          startedAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          completedAt: null,
        }),
      ),
    );

    const result = await handler.execute(
      new CompleteLeadCaptureSessionCommand(visitorId, chatId, companyId),
    );

    expect(result.isOk()).toBe(true);
    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureSession
    ).toPrimitives();
    expect(saved.status).toBe('completed');
    expect(saved.chatId).toBe(chatId);
    expect(saved.completedAt).not.toBeNull();
  });

  it('deja constancia aunque no hubiera ningún avance guardado', async () => {
    const result = await handler.execute(
      new CompleteLeadCaptureSessionCommand(visitorId, chatId, companyId),
    );

    expect(result.isOk()).toBe(true);
    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureSession
    ).toPrimitives();
    expect(saved.visitorId).toBe(visitorId);
    expect(saved.status).toBe('completed');
    expect(saved.phase).toBe('done');
  });

  it('no vuelve a escribir una captación ya cerrada', async () => {
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
      new CompleteLeadCaptureSessionCommand(visitorId, chatId, companyId),
    );

    expect(result.isOk()).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
