import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsEnum,
} from 'class-validator';

/**
 * DTO para conectar un comercial
 */
export class ConnectCommercialDto {
  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Nombre del comercial',
    example: 'Juan Pérez',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Metadatos adicionales',
    example: { browser: 'Chrome', version: '120.0' },
    required: false,
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para enviar heartbeat de actividad
 */
export class CommercialHeartbeatDto {
  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Timestamp de la última actividad',
    example: '2024-01-15T10:30:00.000Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  lastActivity?: string;

  @ApiProperty({
    description: 'Metadatos adicionales de la actividad',
    example: { action: 'message_sent', chatId: 'chat-123' },
    required: false,
  })
  @IsOptional()
  metadata?: Record<string, any>;
}

/**
 * DTO para desconectar un comercial
 */
export class DisconnectCommercialDto {
  @ApiProperty({
    description: 'Motivo de desconexión (para auditoría de sesiones)',
    enum: ['manual', 'logout', 'browser_close', 'unknown'],
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: 'manual' | 'logout' | 'browser_close' | 'unknown';

  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @IsString()
  @IsNotEmpty()
  id: string;
}

/**
 * DTO para consultar disponibilidad de comerciales (endpoint público)
 * Usa el patrón de validación domain + apiKey.
 * La respuesta estará acotada al tenant propietario del dominio proporcionado.
 */
export class CheckCommercialAvailabilityDto {
  @ApiProperty({
    description:
      'Dominio del sitio web desde donde se consulta. ' +
      'Determina el tenant cuya disponibilidad se consulta. ' +
      'El prefijo www. se normaliza automáticamente.',
    example: 'landing.mytech.com',
  })
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty({
    description:
      'API Key del sitio para validación. Debe corresponder al dominio proporcionado.',
    example: 'ak_live_1234567890abcdef',
  })
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

/**
 * Estados válidos para el comercial
 */
export enum CommercialStatusEnum {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
  AWAY = 'away',
}

/**
 * DTO para cambiar el estado de conexión de un comercial manualmente
 */
export class ChangeCommercialStatusDto {
  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Nuevo estado de conexión del comercial',
    enum: CommercialStatusEnum,
    example: 'busy',
  })
  @IsEnum(CommercialStatusEnum, {
    message: 'El estado debe ser: online, offline, busy o away',
  })
  @IsNotEmpty()
  status: CommercialStatusEnum;
}

/**
 * DTO para registrar un fingerprint de navegador a un comercial
 */
export class RegisterFingerprintDto {
  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  @IsString()
  @IsNotEmpty()
  commercialId: string;

  @ApiProperty({
    description: 'Fingerprint único del navegador',
    example: 'fp_a1b2c3d4e5f6g7h8i9j0',
  })
  @IsString()
  @IsNotEmpty()
  fingerprint: string;
}
