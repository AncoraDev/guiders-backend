/**
 * DTOs para POST /v2/integration/embed/refresh
 *
 * El token NO viene en el body — viene en `Authorization: Bearer <token>`.
 * El campo `userId` es OPCIONAL y solo se usa para validación defensiva
 * (AC#3: mismatch → 403 EMBED_TOKEN_USER_MISMATCH).
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class RefreshEmbedTokenDto {
  @ApiProperty({
    description:
      'Opcional. Si se proporciona, debe coincidir con el userId del token. Si no coincide → 403 EMBED_TOKEN_USER_MISMATCH.',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
    required: false,
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;
}

export class RefreshEmbedTokenResponseDto {
  @ApiProperty({
    description: 'Nuevo token opaco (256-bit base64url, 43 chars).',
    example: 'dQw4w9WgXcQ',
  })
  token: string;

  @ApiProperty({
    description:
      'Fecha ISO 8601 en que expira el nuevo token (8h desde refresh)',
    example: '2026-06-12T22:32:00.000Z',
  })
  expiresAt: string;
}
