import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LeadCaptureSessionDocument =
  HydratedDocument<LeadCaptureSessionSchema>;

@Schema({ _id: false })
export class LeadCaptureSessionAnswerSchema {
  @Prop({ required: true })
  stepId: string;

  @Prop({ required: true })
  prompt: string;

  @Prop({ required: true })
  answer: string;

  @Prop({ type: String, required: false })
  field?: string;
}

/**
 * Captación a medias. La clave es el visitante y no el chat: el SDK abre un
 * chat nuevo en cada visita sin conversación abierta, y el progreso tiene que
 * sobrevivir a eso.
 */
@Schema({
  collection: 'lead_capture_sessions',
  timestamps: true,
})
export class LeadCaptureSessionSchema {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, index: true, unique: true })
  visitorId: string;

  @Prop({ type: String, required: false, index: true })
  companyId?: string;

  @Prop({ type: String, default: null })
  chatId: string | null;

  @Prop({ type: String, required: false })
  flowId?: string;

  @Prop({ required: true, enum: ['in_progress', 'completed'], index: true })
  status: string;

  @Prop({ required: true, enum: ['intro', 'steps', 'final', 'done'] })
  phase: string;

  @Prop({ type: String, default: null })
  stepId: string | null;

  @Prop({ type: [LeadCaptureSessionAnswerSchema], default: [] })
  answers: LeadCaptureSessionAnswerSchema[];

  @Prop({ type: [String], default: [] })
  trail: string[];

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const LeadCaptureSessionSchemaDefinition = SchemaFactory.createForClass(
  LeadCaptureSessionSchema,
);
