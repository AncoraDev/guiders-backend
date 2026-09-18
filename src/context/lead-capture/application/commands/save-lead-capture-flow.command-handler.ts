import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { SaveLeadCaptureFlowCommand } from './save-lead-capture-flow.command';
import {
  LEAD_CAPTURE_FLOW_REPOSITORY,
  LeadCaptureFlowRepository,
} from '../../domain/lead-capture-flow.repository';
import { LeadCaptureFlow } from '../../domain/entities/lead-capture-flow';
import { LeadCaptureError } from '../../domain/errors/lead-capture.error';

@CommandHandler(SaveLeadCaptureFlowCommand)
export class SaveLeadCaptureFlowCommandHandler
  implements ICommandHandler<SaveLeadCaptureFlowCommand>
{
  constructor(
    @Inject(LEAD_CAPTURE_FLOW_REPOSITORY)
    private readonly repository: LeadCaptureFlowRepository,
  ) {}

  async execute(
    command: SaveLeadCaptureFlowCommand,
  ): Promise<Result<void, LeadCaptureError>> {
    const { input } = command;

    // Hay un guion por empresa, así que se reutiliza su id si ya existe.
    const existing = await this.repository.findByCompanyId(input.companyId);
    if (existing.isErr()) return err(existing.error);
    const current = existing.unwrap();

    const flowResult = LeadCaptureFlow.create({
      id: current ? current.toPrimitives().id : Uuid.random().value,
      companyId: input.companyId,
      name: input.name,
      enabled: input.enabled,
      intro: input.intro,
      startStepId: input.startStepId,
      steps: input.steps,
      updatedAt: new Date(),
      updatedBy: input.updatedBy,
    });
    if (flowResult.isErr()) return err(flowResult.error);

    const saved = await this.repository.save(flowResult.unwrap());
    if (saved.isErr()) return err(saved.error);
    return okVoid();
  }
}
