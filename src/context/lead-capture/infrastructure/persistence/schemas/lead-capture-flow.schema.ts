import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LeadCaptureFlowDocument = HydratedDocument<LeadCaptureFlowSchema>;

@Schema({ _id: false })
export class LeadCaptureOptionSchema {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  label: string;

  @Prop({ type: String, default: null })
  next: string | null;
}

@Schema({ _id: false })
export class LeadCaptureStepSchema {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: ['message', 'choice', 'text'] })
  type: string;

  @Prop({ required: true })
  prompt: string;

  @Prop({ type: [LeadCaptureOptionSchema], default: undefined })
  options?: LeadCaptureOptionSchema[];

  @Prop({ type: String, required: false })
  field?: string;

  @Prop({ type: String, required: false, enum: ['email', 'phone', 'none'] })
  validation?: string;

  @Prop({ type: Boolean, required: false })
  required?: boolean;

  @Prop({ type: String, default: null })
  next?: string | null;
}

@Schema({ _id: false })
export class LeadCaptureIntroSchema {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ required: true })
  ctaLabel: string;
}

@Schema({
  collection: 'lead_capture_flows',
  timestamps: true,
})
export class LeadCaptureFlowSchema {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, index: true, unique: true })
  companyId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ type: Boolean, default: false })
  enabled: boolean;

  @Prop({ type: LeadCaptureIntroSchema, required: true })
  intro: LeadCaptureIntroSchema;

  @Prop({ required: true })
  startStepId: string;

  @Prop({ type: [LeadCaptureStepSchema], default: [] })
  steps: LeadCaptureStepSchema[];

  @Prop({ required: true })
  updatedBy: string;

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const LeadCaptureFlowSchemaDefinition = SchemaFactory.createForClass(
  LeadCaptureFlowSchema,
);
