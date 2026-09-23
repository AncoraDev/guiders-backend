/**
 * Schema MongoDB para configuración White Label
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Tipo de documento de White Label Config
 */
export type WhiteLabelConfigDocument = HydratedDocument<WhiteLabelConfigSchema>;

/**
 * Sub-schema para colores
 */
@Schema({ _id: false })
export class WhiteLabelColorsSchema {
  @Prop({ default: '#007bff' })
  primary: string;

  @Prop({ default: '#6c757d' })
  secondary: string;

  @Prop({ default: '#17a2b8' })
  tertiary: string;

  @Prop({ default: '#ffffff' })
  background: string;

  @Prop({ default: '#f8f9fa' })
  surface: string;

  @Prop({ default: '#212529' })
  text: string;

  @Prop({ default: '#6c757d' })
  textMuted: string;
}

/**
 * Sub-schema para branding
 */
@Schema({ _id: false })
export class WhiteLabelBrandingSchema {
  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({ type: String, default: null })
  faviconUrl: string | null;

  @Prop({ required: true })
  brandName: string;
}

/**
 * Sub-schema para archivo de fuente
 */
@Schema({ _id: false })
export class WhiteLabelFontFileSchema {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  url: string;
}

/**
 * Sub-schema para tipografía
 */
@Schema({ _id: false })
export class WhiteLabelTypographySchema {
  @Prop({ default: 'Inter' })
  fontFamily: string;

  @Prop({ type: String, default: null })
  customFontName: string | null;

  @Prop({ type: [WhiteLabelFontFileSchema], default: [] })
  customFontFiles: WhiteLabelFontFileSchema[];
}

/**
 * Schema principal de White Label Config
 */
@Schema({
  collection: 'white_label_configs',
  timestamps: true,
})
export class WhiteLabelConfigSchema {
  @Prop({ required: true, index: true, unique: true })
  companyId: string;

  @Prop({ type: WhiteLabelColorsSchema, default: () => ({}) })
  colors: WhiteLabelColorsSchema;

  @Prop({ type: WhiteLabelBrandingSchema, required: true })
  branding: WhiteLabelBrandingSchema;

  @Prop({ type: WhiteLabelTypographySchema, default: () => ({}) })
  typography: WhiteLabelTypographySchema;

  @Prop({ type: String, default: 'light', enum: ['light', 'dark', 'system'] })
  theme: string;

  @Prop({ type: Boolean, default: false })
  embedEnabled: boolean;

  @Prop({ type: [String], default: () => [] })
  embedAllowedOrigins: string[];

  @Prop({ type: Date })
  createdAt: Date;

  @Prop({ type: Date })
  updatedAt: Date;
}

export const WhiteLabelConfigSchemaDefinition = SchemaFactory.createForClass(
  WhiteLabelConfigSchema,
);

// Índice para búsquedas por companyId
WhiteLabelConfigSchemaDefinition.index({ companyId: 1 });
