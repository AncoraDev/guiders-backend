import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { SaveLeadCaptureSessionCommand } from './save-lead-capture-session.command';
import {
  LEAD_CAPTURE_SESSION_REPOSITORY,
  LeadCaptureSessionRepository,
} from '../../domain/lead-capture-session.repository';
import { LeadCaptureSession } from '../../domain/entities/lead-capture-session';
import { LeadCaptureError } from '../../domain/errors/lead-capture.error';

/**
 * Guarda el avance del asistente. Es idempotente y no emite eventos: se llama
 * en cada paso del guion, así que tiene que ser barato y silencioso.
 */
@CommandHandler(SaveLeadCaptureSessionCommand)
export class SaveLeadCaptureSessionCommandHandler
  implements ICommandHandler<SaveLeadCaptureSessionCommand>
{
  constructor(
    @Inject(LEAD_CAPTURE_SESSION_REPOSITORY)
    private readonly repository: LeadCaptureSessionRepository,
  ) {}

  async execute(
    command: SaveLeadCaptureSessionCommand,
  ): Promise<Result<void, LeadCaptureError>> {
    const { input } = command;

    const existing = await this.repository.findByVisitorId(input.visitorId);
    if (existing.isErr()) return err(existing.error);
    const current = existing.unwrap();

    // Una captación ya enviada no se reabre: el lead está guardado y volver
    // atrás dejaría al visitante repitiendo el guion.
    if (current?.isCompleted) return okVoid();

    const progress = {
      chatId: input.chatId,
      flowId: input.flowId,
      phase: input.phase,
      stepId: input.stepId,
      answers: input.answers,
      trail: input.trail,
    };

    const sessionResult = current
      ? current.applyProgress(progress)
      : LeadCaptureSession.start({
          id: Uuid.random().value,
          visitorId: input.visitorId,
          companyId: input.companyId,
          ...progress,
        });
    if (sessionResult.isErr()) return err(sessionResult.error);

    const saved = await this.repository.save(sessionResult.unwrap());
    if (saved.isErr()) return err(saved.error);
    return okVoid();
  }
}
