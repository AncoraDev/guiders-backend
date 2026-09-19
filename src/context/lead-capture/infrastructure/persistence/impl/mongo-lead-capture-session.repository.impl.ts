import { Injectable, Logger, Provider } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Result, err, ok } from 'src/context/shared/domain/result';
import {
  LEAD_CAPTURE_SESSION_REPOSITORY,
  LeadCaptureSessionRepository,
} from '../../../domain/lead-capture-session.repository';
import {
  LeadCaptureSession,
  LeadCaptureSessionPhase,
  LeadCaptureSessionStatus,
} from '../../../domain/entities/lead-capture-session';
import {
  LeadCaptureError,
  LeadCaptureSessionPersistenceError,
} from '../../../domain/errors/lead-capture.error';
import {
  LeadCaptureSessionDocument,
  LeadCaptureSessionSchema,
} from '../schemas/lead-capture-session.schema';

@Injectable()
export class MongoLeadCaptureSessionRepositoryImpl
  implements LeadCaptureSessionRepository
{
  private readonly logger = new Logger(
    MongoLeadCaptureSessionRepositoryImpl.name,
  );

  constructor(
    @InjectModel(LeadCaptureSessionSchema.name)
    private readonly model: Model<LeadCaptureSessionDocument>,
  ) {}

  async findByVisitorId(
    visitorId: string,
  ): Promise<Result<LeadCaptureSession | null, LeadCaptureError>> {
    try {
      // lean() pierde los tipos del esquema, de ahí el cast explícito.
      const doc = (await this.model
        .findOne({ visitorId })
        .lean()
        .exec()) as LeadCaptureSessionSchema | null;
      if (!doc) return ok(null);

      return ok(
        LeadCaptureSession.fromPrimitives({
          id: doc.id,
          visitorId: doc.visitorId,
          companyId: doc.companyId,
          chatId: doc.chatId ?? null,
          flowId: doc.flowId,
          status: doc.status as LeadCaptureSessionStatus,
          phase: doc.phase as LeadCaptureSessionPhase,
          stepId: doc.stepId ?? null,
          answers: (doc.answers ?? []).map((answer) => ({
            stepId: answer.stepId,
            prompt: answer.prompt,
            answer: answer.answer,
            field: answer.field,
          })),
          trail: doc.trail ?? [],
          startedAt: doc.startedAt,
          updatedAt: doc.updatedAt,
          completedAt: doc.completedAt ?? null,
        }),
      );
    } catch (error) {
      const message = this.describe(error);
      this.logger.error(`Error al buscar la captación a medias: ${message}`);
      return err(new LeadCaptureSessionPersistenceError(message));
    }
  }

  async save(
    session: LeadCaptureSession,
  ): Promise<Result<void, LeadCaptureError>> {
    const primitives = session.toPrimitives();
    try {
      await this.model
        .findOneAndUpdate(
          { visitorId: primitives.visitorId },
          {
            $set: {
              id: primitives.id,
              companyId: primitives.companyId,
              chatId: primitives.chatId,
              flowId: primitives.flowId,
              status: primitives.status,
              phase: primitives.phase,
              stepId: primitives.stepId,
              answers: primitives.answers,
              trail: primitives.trail,
              completedAt: primitives.completedAt,
            },
            $setOnInsert: { startedAt: primitives.startedAt },
          },
          { upsert: true, new: true },
        )
        .exec();
      return ok(undefined);
    } catch (error) {
      const message = this.describe(error);
      this.logger.error(`Error al guardar la captación a medias: ${message}`);
      return err(new LeadCaptureSessionPersistenceError(message));
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido';
  }
}

export const MongoLeadCaptureSessionRepositoryProvider: Provider = {
  provide: LEAD_CAPTURE_SESSION_REPOSITORY,
  useClass: MongoLeadCaptureSessionRepositoryImpl,
};
