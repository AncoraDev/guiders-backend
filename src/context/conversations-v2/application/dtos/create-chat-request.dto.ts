import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

/**
 * DTO para información del visitante al crear un chat
 */
export class CreateChatVisitorInfoDto {
  @ApiProperty({
    description:
      'ID del visitante (requerido para comerciales/admins, ignorado para visitantes)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsString()
  visitorId?: string;

  @ApiProperty({
    description: 'Nombre del visitante',
    example: 'Juan Pérez',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Email del visitante',
    example: 'juan.perez@example.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    description: 'Teléfono del visitante',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Ubicación del visitante',
    example: 'Madrid, España',
    required: false,
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({
    description: 'Datos adicionales del visitante',
    example: { company: 'Acme Corp', ipAddress: '192.168.1.1' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  additionalData?: Record<string, any>;
}

/**
 * DTO para metadatos del chat al crearlo
 */
export class CreateChatMetadataDto {
  @ApiProperty({
    description: 'Departamento responsable del chat',
    example: 'ventas',
    required: false,
  })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({
    description: 'Fuente de origen del chat',
    example: 'website',
    required: false,
  })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiProperty({
    description: 'URL inicial del visitante',
    example: 'https://example.com/productos',
    required: false,
  })
  @IsOptional()
  @IsString()
  initialUrl?: string;

  @ApiProperty({
    description: 'User Agent del navegador',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({
    description: 'URL de referencia',
    example: 'https://google.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  referrer?: string;

  @ApiProperty({
    description: 'Tags del chat',
    example: { utm_source: 'google', campaign: 'summer2024' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  tags?: Record<string, any>;

  @ApiProperty({
    description: 'Campos personalizados',
    example: { priority_level: 'high', product_interest: 'premium' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}

/**
 * DTO principal para la request de crear chat
 */
export class CreateChatRequestDto {
  @ApiProperty({
    description:
      'Información del visitante (opcional, se puede inferir del token)',
    type: CreateChatVisitorInfoDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  visitorInfo?: CreateChatVisitorInfoDto;

  @ApiProperty({
    description: 'Metadatos del chat (opcional)',
    type: CreateChatMetadataDto,
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: CreateChatMetadataDto;
}
