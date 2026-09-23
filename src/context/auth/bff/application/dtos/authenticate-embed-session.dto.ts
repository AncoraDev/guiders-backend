/**
 * DTOs para POST /embed/authenticate-session (Story 2.1)
 *
 * El body es OPCIONAL — el `userId`/`companyId` se leen del embed
 * token validado en Redis. Si el body los trae, deben coincidir
 * (defense-in-depth, igual que Story 1.4).
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AuthenticateEmbedSessionDto {
  @ApiProperty({
    description:
      'Opcional. ID del usuario (UUID v4). Si se envía, debe coincidir con el del embed token (defense-in-depth).',
    format: 'uuid',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiProperty({
    description:
      'Opcional. ID de la empresa (UUID v4). Si se envía, debe coincidir con el del embed token (defense-in-depth).',
    format: 'uuid',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID('4')
  companyId?: string;
}

export class EmbedAuthenticateSessionResponseDto {
  @ApiProperty({
    description: 'Siempre `true` si la sesión se estableció correctamente',
    example: true,
  })
  sessionEstablished: boolean;

  @ApiProperty({
    description:
      'Fecha ISO 8601 en que expira la sesión (8h desde creación, alineada con el TTL de Redis)',
    example: '2026-06-12T22:32:00.000Z',
  })
  expiresAt: string;
}
