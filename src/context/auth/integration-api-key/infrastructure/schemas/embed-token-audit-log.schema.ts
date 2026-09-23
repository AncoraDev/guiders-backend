/**
 * MongoDB schema para embed_token_audit_log (Story 2.2, Task 2.1).
 *
 * Cada documento es un evento de autenticación (success o failure)
 * persistido por los `PersistEmbedToken*EventHandler`. La collection
 * tiene TTL de 12 meses (NFR-S7 GDPR) vía `expireAfterSeconds: 31536000`
 * en el campo `timestamp`.
 *
 * PII sanitization:
 * - `ipAddressHash` (NO raw IP) — SHA-256 prefix 16 chars
 * - `userAgent` max 500 chars
 * - `failureDetail` max 500 chars, tokens removidos
 *
 * Indexes:
 * - `id` (unique)
 * - `companyId` (multi-tenant filter)
 * - `userId` (sparse, optional)
 * - `endpoint` (debug)
 * - `result` (success/failure filter)
 * - `timestamp` (TTL + chronological sort)
 * - `companyId + timestamp` (compound for "events for tenant X in time range")
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'embed_token_audit_log',
  timestamps: true,
  toJSON: {
    transform: (_doc, ret) => {
      ret.id = ret._id?.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
})
export class EmbedTokenAuditLogSchema {
  @Prop({ type: String, required: true, unique: true, index: true })
  id: string;

  @Prop({ type: String, required: true, index: true })
  companyId: string;

  @Prop({ type: String, required: false, index: true, sparse: true })
  userId?: string;

  @Prop({ type: String, required: true })
  origin: string;

  @Prop({ type: Date, required: true })
  timestamp: Date;

  @Prop({ type: String, required: true })
  ipAddressHash: string;

  @Prop({ type: String, required: true, default: '' })
  userAgent: string;

  @Prop({ type: String, required: true, index: true })
  endpoint: string;

  @Prop({
    type: String,
    required: true,
    enum: ['success', 'failure'],
    index: true,
  })
  result: string;

  @Prop({ type: String, required: false, index: true, sparse: true })
  failureReason?: string;

  @Prop({ type: String, required: false, default: '' })
  failureDetail?: string;

  // TD-1 fix: `createdAt` y `updatedAt` NO se declaran manualmente.
  // Mongoose los crea automáticamente vía `timestamps: true` arriba.
  // El handler NO los setea (antes sobreescribía el tiempo de Mongoose
  // con su propio `new Date()`, causando drift entre timestamps y
  // otros eventos cercanos).
}

export type EmbedTokenAuditLogDocument =
  HydratedDocument<EmbedTokenAuditLogSchema>;
export const EmbedTokenAuditLogSchemaDefinition = SchemaFactory.createForClass(
  EmbedTokenAuditLogSchema,
);

// Índice TTL: auto-delete después de 12 meses (31536000 segundos)
// Story 2.2 AC3: NFR-S7 GDPR retention
EmbedTokenAuditLogSchemaDefinition.index(
  { timestamp: 1 },
  { expireAfterSeconds: 31536000 },
);

// Compound index para query principal: "eventos de tenant X en rango de tiempo"
EmbedTokenAuditLogSchemaDefinition.index({ companyId: 1, timestamp: -1 });
