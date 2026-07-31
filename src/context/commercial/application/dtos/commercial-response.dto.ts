import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la respuesta del estado de conexión de un comercial
 */
export class CommercialConnectionStatusResponseDto {
  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  commercialId: string;

  @ApiProperty({
    description: 'Estado de conexión del comercial',
    example: 'CONNECTED',
    enum: ['CONNECTED', 'DISCONNECTED'],
  })
  connectionStatus: string;

  @ApiProperty({
    description: 'Última actividad registrada',
    example: '2024-01-15T10:30:00.000Z',
  })
  lastActivity: Date;

  @ApiProperty({
    description: 'Indica si el comercial está actualmente activo',
    example: true,
  })
  isActive: boolean;
}

/**
 * DTO para información resumida de un comercial
 */
export class CommercialSummaryDto {
  @ApiProperty({
    description: 'ID del comercial',
    example: 'e7f8a9b0-1234-5678-9abc-def012345678',
  })
  id: string;

  @ApiProperty({
    description: 'Nombre del comercial',
    example: 'Juan Pérez',
  })
  name: string;

  @ApiProperty({
    description: 'Estado de conexión del comercial',
    example: 'CONNECTED',
    enum: ['CONNECTED', 'DISCONNECTED'],
  })
  connectionStatus: string;

  @ApiProperty({
    description: 'Última actividad registrada',
    example: '2024-01-15T10:30:00.000Z',
  })
  lastActivity: Date;

  @ApiProperty({
    description: 'Indica si el comercial está actualmente activo',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'URL del avatar del comercial',
    example: 'https://cdn.example.com/avatars/user.jpg',
    required: false,
    nullable: true,
  })
  avatarUrl?: string | null;
}

/**
 * DTO para la respuesta de comerciales online
 */
export class OnlineCommercialsResponseDto {
  @ApiProperty({
    description: 'Lista de comerciales online',
    type: [CommercialSummaryDto],
  })
  commercials: CommercialSummaryDto[];

  @ApiProperty({
    description: 'Número total de comerciales online',
    example: 5,
  })
  count: number;

  @ApiProperty({
    description: 'Timestamp de cuando se generó la respuesta',
    example: '2024-01-15T10:30:00.000Z',
  })
  timestamp: string;
}

/**
 * DTO de respuesta para operaciones de conexión/desconexión
 */
export class CommercialOperationResponseDto {
  @ApiProperty({
    description: 'Indica si la operación fue exitosa',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Mensaje descriptivo de la operación',
    example: 'Comercial conectado exitosamente',
  })
  message: string;

  @ApiProperty({
    description: 'Datos del comercial después de la operación',
    type: CommercialSummaryDto,
    required: false,
  })
  commercial?: CommercialSummaryDto;
}

/**
 * DTO para la respuesta de disponibilidad de comerciales (endpoint público)
 * No expone información sensible de comerciales
 */
export class CommercialAvailabilityResponseDto {
  @ApiProperty({
    description:
      'Indica si hay al menos un comercial online y disponible para atender ' +
      'en el tenant propietario del dominio consultado',
    example: true,
  })
  available: boolean;

  @ApiProperty({
    description:
      'Número de comerciales online en el tenant propietario del dominio consultado. ' +
      'Este valor está acotado al tenant: no incluye comerciales de otras empresas.',
    example: 3,
  })
  onlineCount: number;

  @ApiProperty({
    description: 'Timestamp ISO 8601 de cuando se generó la respuesta',
    example: '2025-01-15T10:30:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description:
      'UUID del sitio consultado, resuelto a partir del dominio proporcionado',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  siteId: string;

  @ApiProperty({
    description:
      'UUID de la empresa (companyId / tenantId). Usar para unirse a la room WS tenant:{tenantId}',
    example: '550e8400-e29b-41d4-a716-446655440001',
    required: false,
  })
  tenantId?: string;
}
