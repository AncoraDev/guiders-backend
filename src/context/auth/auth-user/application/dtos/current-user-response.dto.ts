// DTO para la respuesta del usuario autenticado actual (/me)
// Ubicación: src/context/auth/auth-user/application/dtos/current-user-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CurrentUserResponseDto {
  @ApiProperty({ description: 'Identificador único del usuario' })
  id: string;

  @ApiProperty({ description: 'Correo electrónico del usuario' })
  email: string;

  @ApiProperty({ description: 'Nombre visible del usuario' })
  name: string;

  @ApiProperty({ type: [String], description: 'Roles asignados' })
  roles: string[];

  @ApiProperty({ description: 'Identificador de la compañía asociada' })
  companyId: string;

  @ApiProperty({ description: 'Indica si el usuario está activo' })
  isActive: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha de creación',
  })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha de última actualización',
  })
  updatedAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    required: false,
    nullable: true,
    description: 'Fecha de último inicio de sesión (puede ser null)',
  })
  lastLoginAt: Date | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'ID del usuario en Keycloak (puede ser null)',
  })
  keycloakId: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description: 'URL del avatar del usuario en S3 (puede ser null)',
    example:
      'https://guiders-avatars-dev.s3.eu-north-1.amazonaws.com/avatars/user-id-123456.jpg',
  })
  avatarUrl: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    description:
      'Mensaje de saludo al pulsar Saludar. Null = texto por defecto del cliente.',
    example: '¡Hola! ¿En qué puedo ayudarte?',
  })
  greetingMessage: string | null;

  @ApiProperty({
    type: 'array',
    required: false,
    description: 'Frases rápidas del comercial para el menú /',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
      },
    },
  })
  cannedReplies: { id: string; title: string; body: string }[];
}
