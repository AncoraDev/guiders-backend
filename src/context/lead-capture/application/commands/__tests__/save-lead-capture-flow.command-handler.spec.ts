import { Test, TestingModule } from '@nestjs/testing';
import { err, ok, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { LeadCaptureFlow } from '../../../domain/entities/lead-capture-flow';
import { LeadCaptureError } from '../../../domain/errors/lead-capture.error';
import { LEAD_CAPTURE_FLOW_REPOSITORY } from '../../../domain/lead-capture-flow.repository';
import { SaveLeadCaptureFlowCommand } from '../save-lead-capture-flow.command';
import { SaveLeadCaptureFlowCommandHandler } from '../save-lead-capture-flow.command-handler';

describe('SaveLeadCaptureFlowCommandHandler', () => {
  let handler: SaveLeadCaptureFlowCommandHandler;
  let repository: { findByCompanyId: jest.Mock; save: jest.Mock };

  const companyId = Uuid.random().value;
  const updatedBy = Uuid.random().value;

  const validInput = {
    companyId,
    updatedBy,
    name: 'Captación sin agentes',
    enabled: true,
    intro: {
      title: 'Ahora no hay nadie conectado',
      body: 'Te hago unas preguntas rápidas',
      ctaLabel: 'Empezar',
    },
    startStepId: 'interes',
    steps: [
      {
        id: 'interes',
        type: 'choice' as const,
        prompt: '¿Qué te interesa?',
        options: [{ id: 'nuevo', label: 'Coche nuevo', next: null }],
      },
    ],
  };

  beforeEach(async () => {
    repository = {
      findByCompanyId: jest.fn().mockResolvedValue(ok(null)),
      save: jest.fn().mockResolvedValue(okVoid()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveLeadCaptureFlowCommandHandler,
        { provide: LEAD_CAPTURE_FLOW_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(SaveLeadCaptureFlowCommandHandler);
  });

  it('guarda el guion de una empresa que aún no tenía ninguno', async () => {
    const result = await handler.execute(
      new SaveLeadCaptureFlowCommand(validInput),
    );

    expect(result.isOk()).toBe(true);
    expect(repository.save).toHaveBeenCalledTimes(1);
    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureFlow
    ).toPrimitives();
    expect(saved.companyId).toBe(companyId);
    expect(saved.updatedBy).toBe(updatedBy);
    expect(saved.enabled).toBe(true);
  });

  it('reutiliza el id del guion existente en vez de crear otro', async () => {
    const existingId = Uuid.random().value;
    repository.findByCompanyId.mockResolvedValue(
      ok(
        LeadCaptureFlow.fromPrimitives({
          ...validInput,
          id: existingId,
          updatedAt: new Date('2026-01-01'),
        }),
      ),
    );

    await handler.execute(new SaveLeadCaptureFlowCommand(validInput));

    const saved = (
      repository.save.mock.calls[0][0] as LeadCaptureFlow
    ).toPrimitives();
    expect(saved.id).toBe(existingId);
  });

  it('no guarda nada si el guion no es válido', async () => {
    const result = await handler.execute(
      new SaveLeadCaptureFlowCommand({
        ...validInput,
        startStepId: 'paso-que-no-existe',
      }),
    );

    expect(result.isErr()).toBe(true);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propaga el error si falla la persistencia', async () => {
    repository.save.mockResolvedValue(
      err(new LeadCaptureError('Mongo no responde')),
    );

    const result = await handler.execute(
      new SaveLeadCaptureFlowCommand(validInput),
    );

    expect(result.isErr()).toBe(true);
  });
});
