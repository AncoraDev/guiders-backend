import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'visitors_v2' })
export class VisitorV2MongoEntity extends Document {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  tenantId: string;

  @Prop({ required: true })
  siteId: string;

  @Prop({ required: true })
  fingerprint: string;

  @Prop({ required: true, enum: ['ANON', 'ENGAGED', 'LEAD', 'CONVERTED'] })
  lifecycle: string;

  @Prop({
    required: true,
    enum: ['online', 'away', 'chatting', 'offline'],
    default: 'offline',
  })
  connectionStatus: string;

  @Prop({ required: true, default: false })
  hasAcceptedPrivacyPolicy: boolean;

  @Prop({ type: Date, default: null })
  privacyPolicyAcceptedAt: Date | null;

  @Prop({ type: String, default: null })
  consentVersion: string | null;

  @Prop({ type: String, default: null })
  currentUrl: string | null;

  @Prop({ required: true, default: false })
  isInternal: boolean;

  @Prop({ type: Object, default: null })
  block: {
    blockedAt: Date;
    blockedBy: string;
    blockedByName: string;
    reason: string;
    note?: string;
  } | null;

  @Prop({ type: Object, default: null })
  lastUnblock: {
    unblockedAt: Date;
    unblockedBy: string;
    unblockedByName: string;
  } | null;

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ required: true })
  updatedAt: Date;

  @Prop({
    type: [
      {
        id: { type: String, required: true },
        startedAt: { type: Date, required: true },
        lastActivityAt: { type: Date, required: true },
        endedAt: { type: Date, default: null },
        currentUrl: { type: String, default: null },
        ipAddress: { type: String, default: null }, // IP desde la que se inició la sesión
        userAgent: { type: String, default: null }, // User-Agent del navegador
      },
    ],
    default: [],
  })
  sessions: Array<{
    id: string;
    startedAt: Date;
    lastActivityAt: Date;
    endedAt?: Date;
    currentUrl?: string;
    ipAddress?: string; // IP desde la que se inició la sesión
    userAgent?: string; // User-Agent del navegador
  }>;
}

export const VisitorV2MongoEntitySchema =
  SchemaFactory.createForClass(VisitorV2MongoEntity);

// Índices para optimizar consultas
VisitorV2MongoEntitySchema.index(
  { fingerprint: 1, siteId: 1 },
  { unique: true },
);
VisitorV2MongoEntitySchema.index({ tenantId: 1 });
VisitorV2MongoEntitySchema.index({ siteId: 1 });
VisitorV2MongoEntitySchema.index({ lifecycle: 1 });
VisitorV2MongoEntitySchema.index({ connectionStatus: 1 });
VisitorV2MongoEntitySchema.index({ 'sessions.id': 1 });
VisitorV2MongoEntitySchema.index({ 'sessions.endedAt': 1 });
// Índice para consultas de consentimiento
VisitorV2MongoEntitySchema.index({ hasAcceptedPrivacyPolicy: 1 });
VisitorV2MongoEntitySchema.index({ privacyPolicyAcceptedAt: 1 });

// Índice para visitantes internos
VisitorV2MongoEntitySchema.index({ isInternal: 1 });

// Índices compuestos para filtros complejos
VisitorV2MongoEntitySchema.index({
  tenantId: 1,
  lifecycle: 1,
  connectionStatus: 1,
});
VisitorV2MongoEntitySchema.index({ tenantId: 1, createdAt: -1 });
VisitorV2MongoEntitySchema.index({ tenantId: 1, updatedAt: -1 });
VisitorV2MongoEntitySchema.index({ tenantId: 1, siteId: 1, lifecycle: 1 });
// Índice compuesto para filtrar visitantes internos en queries
VisitorV2MongoEntitySchema.index({ tenantId: 1, isInternal: 1, updatedAt: -1 });
