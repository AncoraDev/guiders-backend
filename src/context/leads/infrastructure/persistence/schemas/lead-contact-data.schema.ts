import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
  collection: 'lead_contact_data',
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
export class LeadContactDataSchema {
  @Prop({ type: String, required: true, unique: true, index: true })
  id: string;

  @Prop({ type: String, required: true, index: true })
  visitorId: string;

  @Prop({ type: String, required: true, index: true })
  companyId: string;

  @Prop({ type: String, required: false })
  alias?: string;

  @Prop({ type: String, required: false })
  nombre?: string;

  @Prop({ type: String, required: false })
  apellidos?: string;

  @Prop({ type: String, required: false, index: true, sparse: true })
  email?: string;

  @Prop({ type: String, required: false })
  telefono?: string;

  @Prop({ type: String, required: false })
  dni?: string;

  @Prop({ type: String, required: false })
  poblacion?: string;

  @Prop({ type: Object, required: false, default: {} })
  additionalData?: Record<string, unknown>;

  @Prop({ type: String, required: false, index: true, sparse: true })
  extractedFromChatId?: string;

  @Prop({ type: Date, required: false, default: Date.now })
  extractedAt?: Date;
}

export type LeadContactDataDocument = HydratedDocument<LeadContactDataSchema>;
export const LeadContactDataSchemaDefinition = SchemaFactory.createForClass(
  LeadContactDataSchema,
);

// Indice compuesto para busqueda por visitor y company
LeadContactDataSchemaDefinition.index(
  { visitorId: 1, companyId: 1 },
  { unique: true },
);

// Indice para busqueda por email y company
LeadContactDataSchemaDefinition.index(
  { email: 1, companyId: 1 },
  { sparse: true },
);

// Índice de texto para búsqueda global (alias, nombre, apellidos, email, teléfono)
LeadContactDataSchemaDefinition.index(
  {
    alias: 'text',
    nombre: 'text',
    apellidos: 'text',
    email: 'text',
    telefono: 'text',
  },
  {
    weights: {
      alias: 12,
      nombre: 10,
      apellidos: 8,
      email: 6,
      telefono: 3,
    },
    name: 'lead_search_text_idx',
  },
);
