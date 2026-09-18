import { Test, TestingModule } from '@nestjs/testing';
import { err, ok } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { LeadCaptureFlow } from '../../../domain/entities/lead-capture-flow';
import { LeadCaptureError } from '../../../domain/errors/lead-capture.error';
import { LEAD_CAPTURE_FLOW_REPOSITORY } from '../../../domain/lead-capture-flow.repository';
import { ResolveLeadCaptureFlowQuery } from '../resolve-lead-capture-flow.query';
import { ResolveLeadCaptureFlowQueryHandler } from '../resolve-lead-capture-flow.query-handler';

describe('ResolveLeadCaptureFlowQueryHandler', () => {
  let handler: ResolveLeadCaptureFlowQueryHandler;
  let repository: { findByCompanyId: jest.Mock };

  const companyId = Uuid.random().value;

  const flowWith = (enabled: boolean): LeadCaptureFlow =>
    LeadCaptureFlow.fromPrimitives({
      id: Uuid.random().value,
      companyId,
      name: 'Captación sin agentes',
      enabled,
      intro: { title: 'Hola', body: 'Unas preguntas', ctaLabel: 'Empezar' },
      startStepId: 'interes',
      steps: [
        {
          id: 'interes',
          type: 'choice',
          prompt: '¿Qué te interesa?',
          options: [{ id: 'nuevo', label: 'Coche nuevo', next: null }],
        },
      ],
      updatedAt: new Date(),
      updatedBy: Uuid.random().value,
    });

  beforeEach(async () => {
    repository = { findByCompanyId: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResolveLeadCaptureFlowQueryHandler,
        { provide: LEAD_CAPTURE_FLOW_REPOSITORY, useValue: repository },
      ],
    }).compile();

    handler = module.get(ResolveLeadCaptureFlowQueryHandler);
  });

  it('devuelve el guion cuando la empresa lo tiene activo', async () => {
    repository.findByCompanyId.mockResolvedValue(ok(flowWith(true)));

    const flow = await handler.execute(
      new ResolveLeadCaptureFlowQuery(companyId),
    );

    expect(flow?.startStepId).toBe('interes');
    expect(flow?.steps).toHaveLength(1);
  });

  it('devuelve null si el guion está desactivado', async () => {
    repository.findByCompanyId.mockResolvedValue(ok(flowWith(false)));

    await expect(
      handler.execute(new ResolveLeadCaptureFlowQuery(companyId)),
    ).resolves.toBeNull();
  });

  it('devuelve null si la empresa no tiene guion', async () => {
    repository.findByCompanyId.mockResolvedValue(ok(null));

    await expect(
      handler.execute(new ResolveLeadCaptureFlowQuery(companyId)),
    ).resolves.toBeNull();
  });

  it('devuelve null si falla la consulta, para no romper el chat', async () => {
    repository.findByCompanyId.mockResolvedValue(
      err(new LeadCaptureError('Mongo no responde')),
    );

    await expect(
      handler.execute(new ResolveLeadCaptureFlowQuery(companyId)),
    ).resolves.toBeNull();
  });
});
