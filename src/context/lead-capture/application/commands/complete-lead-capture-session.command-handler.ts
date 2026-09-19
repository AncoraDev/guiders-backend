import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result, err, okVoid } from 'src/context/shared/domain/result';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { CompleteLeadCaptureSessionCommand } from './complete-lead-capture-session.command';
import {
  LEAD_CAPTURE_SESSION_REPOSITORY,
  LeadCaptureSessionRepository,
} from '../../domain/lead-capture-session.repository';
import { LeadCaptureSession } from '../../domain/entities/lead-capture-session';
import { LeadCaptureError } from '../../domain/errors/lead-capture.error';

@CommandHandler(CompleteLeadCaptureSessionCommand)
export class CompleteLeadCaptureSessionCommandHandler
  implements ICommandHandler<CompleteLeadCaptureSessionCommand>
{
  constructor(
    @Inject(LEAD_CAPTURE_SESSION_REPOSITORY)
    private readonly repository: LeadCaptureSessionRepository,
  ) {}

  async execute(
    command: CompleteLeadCaptureSessionCommand,
  ): Promise<Result<void, LeadCaptureError>> {
    const existing = await this.repository.findByVisitorId(command.visitorId);
    if (existing.isErr()) return err(existing.error);
    const current = existing.unwrap();

    if (current?.isCompleted) return okVoid();

    if (current) {
      const saved = await this.repository.save(
        current.complete(command.chatId),
      );
      if (saved.isErr()) return err(saved.error);
      return okVoid();
    }

    // Sin progreso previo se deja constancia igual: el guion pudo completarse
    // de un tirón sin que llegara ningún avance intermedio.
    const started = LeadCaptureSession.start({
      id: Uuid.random().value,
      visitorId: command.visitorId,
      companyId: command.companyId,
      chatId: command.chatId ?? null,
      phase: 'done',
      stepId: null,
      answers: [],
      trail: [],
    });
    if (started.isErr()) return err(started.error);

    const saved = await this.repository.save(started.unwrap());
    if (saved.isErr()) return err(saved.error);
    return okVoid();
  }
}
