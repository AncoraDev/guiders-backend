import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsString,
  IsOptional,
  IsEmail,
  IsObject,
  IsIn,
  MaxLength,
} from 'class-validator';
import { LeadContactDataPrimitives } from '../../domain/services/crm-sync.service';
import {
  LEAD_FOLLOW_UP_STATUSES,
  LeadFollowUpStatus,
} from '../../domain/lead-follow-up';

/**
 * DTO para guardar datos de contacto de un lead
 */
export class SaveLeadContactDataDto {
  @ApiPropertyOptional({
    description: 'Alias interno para identificar al contacto en la consola',
    example: 'Cliente VIP - Seat León',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  alias?: string;

  @ApiPropertyOptional({
    description: 'Nombre del contacto',
    example: 'Juan',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Apellidos del contacto',
    example: 'Garcia Lopez',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  apellidos?: string;

  @ApiPropertyOptional({
    description: 'Email del contacto',
    example: 'juan.garcia@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Telefono del contacto',
    example: '+34612345678',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  telefono?: string;

  @ApiPropertyOptional({
    description: 'DNI/NIF del contacto',
    example: '12345678A',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  dni?: string;

  @ApiPropertyOptional({
    description: 'Poblacion/ciudad del contacto',
    example: 'Madrid',
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  poblacion?: string;

  @ApiPropertyOptional({
    description: 'El visitante aceptó la política de privacidad',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  acceptedPrivacyPolicy?: boolean;

  @ApiPropertyOptional({
    description: 'El visitante aceptó recibir comunicaciones comerciales',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  acceptedMarketing?: boolean;

  @ApiPropertyOptional({
    description: 'Datos adicionales en formato libre',
    example: { preferencia: 'email', horario: 'manana' },
  })
  @IsObject()
  @IsOptional()
  additionalData?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Chat del que se extrajeron los datos',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  extractedFromChatId?: string;
}

export class ListLeadContactDataQueryDto {
  @ApiPropertyOptional({
    description: 'Origen de la captación',
    enum: ['assistant', 'manual'],
  })
  @IsOptional()
  @IsIn(['assistant', 'manual'])
  source?: 'assistant' | 'manual';

  @ApiPropertyOptional({
    description: 'Estado de seguimiento de la cola',
    enum: LEAD_FOLLOW_UP_STATUSES,
  })
  @IsOptional()
  @IsIn(LEAD_FOLLOW_UP_STATUSES)
  status?: LeadFollowUpStatus;
}

export class UpdateLeadFollowUpDto {
  @ApiProperty({
    description: 'Nuevo estado de seguimiento',
    enum: LEAD_FOLLOW_UP_STATUSES,
  })
  @IsIn(LEAD_FOLLOW_UP_STATUSES)
  status: LeadFollowUpStatus;
}

/**
 * DTO de respuesta con datos de contacto del lead
 */
export class LeadContactDataResponseDto {
  @ApiProperty({ description: 'ID unico del registro' })
  id: string;

  @ApiProperty({ description: 'ID del visitor asociado' })
  visitorId: string;

  @ApiProperty({ description: 'ID de la empresa' })
  companyId: string;

  @ApiPropertyOptional({
    description: 'Alias interno para identificar al contacto',
  })
  alias?: string;

  @ApiPropertyOptional({ description: 'Nombre del contacto' })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Apellidos del contacto' })
  apellidos?: string;

  @ApiPropertyOptional({ description: 'Email del contacto' })
  email?: string;

  @ApiPropertyOptional({ description: 'Telefono del contacto' })
  telefono?: string;

  @ApiPropertyOptional({ description: 'DNI/NIF del contacto' })
  dni?: string;

  @ApiPropertyOptional({ description: 'Poblacion del contacto' })
  poblacion?: string;

  @ApiPropertyOptional({
    description: 'El visitante aceptó la política de privacidad',
  })
  acceptedPrivacyPolicy?: boolean;

  @ApiPropertyOptional({
    description: 'El visitante aceptó recibir comunicaciones comerciales',
  })
  acceptedMarketing?: boolean;

  @ApiPropertyOptional({
    description: 'Fecha en la que el visitante aceptó las políticas',
  })
  consentAcceptedAt?: string;

  @ApiPropertyOptional({ description: 'Datos adicionales' })
  additionalData?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'ID del chat de donde se extrajeron los datos',
  })
  extractedFromChatId?: string;

  @ApiProperty({ description: 'Fecha de extraccion de datos' })
  extractedAt: string;

  @ApiProperty({ description: 'Fecha de creacion' })
  createdAt: string;

  @ApiPropertyOptional({
    description: 'Estado de seguimiento del comercial',
    enum: LEAD_FOLLOW_UP_STATUSES,
  })
  followUpStatus?: LeadFollowUpStatus;

  @ApiPropertyOptional({
    description: 'Momento en que se actualizó el seguimiento',
  })
  followUpAt?: string;

  @ApiPropertyOptional({
    description: 'Comercial que actualizó el seguimiento',
  })
  followUpBy?: string;

  @ApiProperty({ description: 'Fecha de ultima actualizacion' })
  updatedAt: string;

  static fromPrimitives(
    data: LeadContactDataPrimitives,
  ): LeadContactDataResponseDto {
    const dto = new LeadContactDataResponseDto();
    dto.id = data.id;
    dto.visitorId = data.visitorId;
    dto.companyId = data.companyId;
    dto.alias = data.alias;
    dto.nombre = data.nombre;
    dto.apellidos = data.apellidos;
    dto.email = data.email;
    dto.telefono = data.telefono;
    dto.dni = data.dni;
    dto.poblacion = data.poblacion;
    dto.acceptedPrivacyPolicy = data.acceptedPrivacyPolicy;
    dto.acceptedMarketing = data.acceptedMarketing;
    dto.consentAcceptedAt = data.consentAcceptedAt?.toISOString();
    dto.additionalData = data.additionalData;
    dto.extractedFromChatId = data.extractedFromChatId;
    dto.followUpStatus = data.followUpStatus;
    dto.followUpAt = data.followUpAt?.toISOString();
    dto.followUpBy = data.followUpBy;
    dto.extractedAt =
      data.extractedAt?.toISOString() ?? new Date().toISOString();
    dto.createdAt = data.createdAt?.toISOString() ?? new Date().toISOString();
    dto.updatedAt = data.updatedAt?.toISOString() ?? new Date().toISOString();
    return dto;
  }
}
