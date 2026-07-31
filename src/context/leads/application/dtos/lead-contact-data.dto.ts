import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsObject,
  MaxLength,
} from 'class-validator';
import { LeadContactDataPrimitives } from '../../domain/services/crm-sync.service';

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
    description: 'Datos adicionales en formato libre',
    example: { preferencia: 'email', horario: 'manana' },
  })
  @IsObject()
  @IsOptional()
  additionalData?: Record<string, unknown>;
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
    dto.additionalData = data.additionalData;
    dto.extractedFromChatId = data.extractedFromChatId;
    dto.extractedAt =
      data.extractedAt?.toISOString() ?? new Date().toISOString();
    dto.createdAt = data.createdAt?.toISOString() ?? new Date().toISOString();
    dto.updatedAt = data.updatedAt?.toISOString() ?? new Date().toISOString();
    return dto;
  }
}
