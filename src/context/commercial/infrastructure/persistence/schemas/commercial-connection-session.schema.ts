import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ConnectionSessionEndReason } from '../../../domain/commercial-connection-session.repository';

/**
 * Sesiones de conexión manual de comerciales (start/end + duración).
 */
@Schema({
  collection: 'commercial_connection_sessions',
  timestamps: true,
  versionKey: false,
})
export class CommercialConnectionSessionSchema extends Document {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true, index: true })
  commercialId: string;

  @Prop({ required: true, index: true })
  companyId: string;

  @Prop({ required: false, type: String, default: null })
  commercialDisplayName?: string | null;

  @Prop({ required: true, index: true })
  startedAt: Date;

  @Prop({ required: false, type: Date, default: null })
  endedAt?: Date | null;

  @Prop({ required: false, type: Number, default: null })
  durationMs?: number | null;

  @Prop({
    required: false,
    type: String,
    enum: [
      'manual',
      'logout',
      'browser_close',
      'connection_lost',
      'unknown',
      null,
    ],
    default: null,
  })
  endReason?: ConnectionSessionEndReason | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CommercialConnectionSessionSchemaDefinition =
  SchemaFactory.createForClass(CommercialConnectionSessionSchema);

CommercialConnectionSessionSchemaDefinition.index({
  commercialId: 1,
  endedAt: 1,
});
// Un comercial solo puede tener una sesión abierta; el índice evita duplicados
// si llegan dos peticiones de conexión a la vez.
CommercialConnectionSessionSchemaDefinition.index(
  { commercialId: 1 },
  {
    unique: true,
    partialFilterExpression: { endedAt: null },
    name: 'unique_open_session_per_commercial',
  },
);
CommercialConnectionSessionSchemaDefinition.index({
  companyId: 1,
  startedAt: -1,
});
