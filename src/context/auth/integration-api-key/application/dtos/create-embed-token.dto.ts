/**
 * DTOs para POST /v2/integration/embed/start
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmbedTokenDto {
  @ApiPropertyOptional({
    description:
      'ID del usuario (de Guiders) que será autenticado en el iframe. Obligatorio si no se envía externalUserId.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Id del comercial en LeadCars. Guiders lo resuelve al UUID interno. Obligatorio si no se envía userId.',
    example: 'lc-commercial-42',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalUserId?: string;

  @ApiProperty({
    description:
      'ID de la empresa a la que pertenece el usuario. Debe coincidir con el companyId de la API Key.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID('4')
  companyId: string;
}

export class CreateEmbedTokenResponseDto {
  @ApiProperty({
    description:
      'Token opaco (256-bit base64url, 43 chars). Se envía al iframe.',
    example: 'dQw4w9WgXcQ',
  })
  token: string;

  @ApiProperty({
    description: 'Fecha ISO 8601 en que expira el token (8h desde emisión)',
    example: '2026-06-12T22:32:00.000Z',
  })
  expiresAt: string;

  @ApiProperty({
    description:
      'UUID de Guiders del usuario autenticado. LeadCars puede guardarlo para las siguientes llamadas.',
    format: 'uuid',
  })
  userId: string;
}

export class EmbedTokenForbiddenResponseDto {
  @ApiProperty({
    description: 'Código de error específico del embed',
    example: 'EMBED_DISABLED_FOR_TENANT',
    enum: [
      'EMBED_DISABLED_FOR_TENANT',
      'EMBED_USER_NOT_IN_TENANT',
      'EMBED_USER_INACTIVE',
      'EMBED_EXTERNAL_USER_MISMATCH',
      'EMBED_TENANT_MISMATCH',
    ],
  })
  code: string;

  @ApiProperty({
    description: 'Mensaje legible para el integrador',
    example: 'Embed token forbidden: EMBED_DISABLED_FOR_TENANT',
  })
  message: string;

  @ApiProperty({ description: 'Status code HTTP', example: 403 })
  statusCode: number;
}
