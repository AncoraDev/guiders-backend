import { Injectable, Logger, Provider } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Result, err, ok } from 'src/context/shared/domain/result';
import {
  LEAD_CAPTURE_FLOW_REPOSITORY,
  LeadCaptureFlowRepository,
} from '../../../domain/lead-capture-flow.repository';
import {
  LeadCaptureFlow,
  LeadCaptureStepPrimitives,
  LeadCaptureStepType,
  LeadCaptureValidation,
} from '../../../domain/entities/lead-capture-flow';
import {
  LeadCaptureError,
  LeadCaptureFlowPersistenceError,
} from '../../../domain/errors/lead-capture.error';
import {
  LeadCaptureFlowDocument,
  LeadCaptureFlowSchema,
  LeadCaptureStepSchema,
} from '../schemas/lead-capture-flow.schema';

@Injectable()
export class MongoLeadCaptureFlowRepositoryImpl
  implements LeadCaptureFlowRepository
{
  private readonly logger = new Logger(MongoLeadCaptureFlowRepositoryImpl.name);

  constructor(
    @InjectModel(LeadCaptureFlowSchema.name)
    private readonly model: Model<LeadCaptureFlowDocument>,
  ) {}

  async findByCompanyId(
    companyId: string,
  ): Promise<Result<LeadCaptureFlow | null, LeadCaptureError>> {
    try {
      // lean() pierde los tipos del esquema, de ahí el cast explícito.
      const doc = (await this.model
        .findOne({ companyId })
        .lean()
        .exec()) as LeadCaptureFlowSchema | null;
      if (!doc) return ok(null);

      return ok(
        LeadCaptureFlow.fromPrimitives({
          id: doc.id,
          companyId: doc.companyId,
          name: doc.name,
          enabled: doc.enabled,
          intro: {
            title: doc.intro?.title ?? '',
            body: doc.intro?.body ?? '',
            ctaLabel: doc.intro?.ctaLabel ?? '',
          },
          startStepId: doc.startStepId,
          steps: (doc.steps ?? []).map((step) => this.toStepPrimitives(step)),
          updatedAt: doc.updatedAt,
          updatedBy: doc.updatedBy,
        }),
      );
    } catch (error) {
      const message = this.describe(error);
      this.logger.error(`Error al buscar el guion de captación: ${message}`);
      return err(new LeadCaptureFlowPersistenceError(message));
    }
  }

  async save(flow: LeadCaptureFlow): Promise<Result<void, LeadCaptureError>> {
    const primitives = flow.toPrimitives();
    try {
      await this.model
        .findOneAndUpdate(
          { companyId: primitives.companyId },
          {
            $set: {
              id: primitives.id,
              name: primitives.name,
              enabled: primitives.enabled,
              intro: primitives.intro,
              startStepId: primitives.startStepId,
              steps: primitives.steps,
              updatedBy: primitives.updatedBy,
              updatedAt: primitives.updatedAt,
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true, new: true },
        )
        .exec();
      return ok(undefined);
    } catch (error) {
      const message = this.describe(error);
      this.logger.error(`Error al guardar el guion de captación: ${message}`);
      return err(new LeadCaptureFlowPersistenceError(message));
    }
  }

  private toStepPrimitives(
    step: LeadCaptureStepSchema,
  ): LeadCaptureStepPrimitives {
    return {
      id: step.id,
      type: step.type as LeadCaptureStepType,
      prompt: step.prompt,
      options: step.options?.map((option) => ({
        id: option.id,
        label: option.label,
        next: option.next ?? null,
      })),
      field: step.field,
      validation: step.validation as LeadCaptureValidation | undefined,
      required: step.required,
      next: step.next ?? null,
    };
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'Error desconocido';
  }
}

export const MongoLeadCaptureFlowRepositoryProvider: Provider = {
  provide: LEAD_CAPTURE_FLOW_REPOSITORY,
  useClass: MongoLeadCaptureFlowRepositoryImpl,
};
