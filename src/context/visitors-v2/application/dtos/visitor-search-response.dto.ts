import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para información de sesión en búsqueda de visitantes
 */
export class SessionInfoDto {
  @ApiProperty({
    description: 'ID de la sesión',
    example: '550e8400-e29b-41d4-a716-446655440099',
  })
  id: string;

  @ApiProperty({
    description: 'Fecha de inicio de la sesión',
    example: '2024-01-15T10:30:00.000Z',
  })
  startedAt: string;

  @ApiProperty({
    description: 'Última actividad en la sesión',
    example: '2024-01-15T14:45:00.000Z',
  })
  lastActivityAt: string;

  @ApiPropertyOptional({
    description: 'Fecha de finalización de la sesión',
    example: '2024-01-15T15:00:00.000Z',
  })
  endedAt?: string;

  @ApiPropertyOptional({
    description: 'URL actual de la sesión',
    example: 'https://example.com/pricing',
  })
  currentUrl?: string;

  @ApiPropertyOptional({
    description: 'Dirección IP desde la que se inició la sesión',
    example: '192.168.1.100',
  })
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'User-Agent del navegador',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  userAgent?: string;

  @ApiProperty({
    description: 'Indica si la sesión está activa',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Duración de la sesión en milisegundos',
    example: 1800000,
  })
  duration: number;
}

/**
 * Información de paginación en la respuesta
 */
export class PaginationInfoDto {
  @ApiProperty({
    description: 'Página actual',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Resultados por página',
    example: 20,
  })
  limit: number;

  @ApiProperty({
    description: 'Total de resultados',
    example: 150,
  })
  total: number;

  @ApiProperty({
    description: 'Total de páginas',
    example: 8,
  })
  totalPages: number;

  @ApiProperty({
    description: 'Indica si hay página siguiente',
    example: true,
  })
  hasNextPage: boolean;

  @ApiProperty({
    description: 'Indica si hay página anterior',
    example: false,
  })
  hasPreviousPage: boolean;
}

/**
 * Resumen de un visitante en la lista de resultados
 */
export class VisitorSummaryDto {
  @ApiProperty({
    description: 'ID del visitante',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'ID del tenant',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tenantId: string;

  @ApiProperty({
    description: 'ID del sitio',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  siteId: string;

  @ApiProperty({
    description: 'Ciclo de vida del visitante',
    enum: ['ANON', 'ENGAGED', 'LEAD', 'CONVERTED'],
    example: 'LEAD',
  })
  lifecycle: string;

  @ApiProperty({
    description: 'Estado de conexión',
    enum: ['online', 'away', 'chatting', 'offline'],
    example: 'online',
  })
  connectionStatus: string;

  @ApiProperty({
    description: 'Ha aceptado política de privacidad',
    example: true,
  })
  hasAcceptedPrivacyPolicy: boolean;

  @ApiProperty({
    description: 'Indica si el visitante es interno (comercial/empleado)',
    example: false,
  })
  isInternal: boolean;

  @ApiPropertyOptional({
    description: 'URL actual del visitante',
    example: 'https://example.com/pricing',
  })
  currentUrl?: string;

  @ApiProperty({
    description: 'Fecha de creación',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Última actividad',
    example: '2024-01-15T14:45:00.000Z',
  })
  updatedAt: string;

  @ApiProperty({
    description: 'Número de sesiones activas',
    example: 1,
  })
  activeSessionsCount: number;

  @ApiProperty({
    description: 'Número total de sesiones',
    example: 5,
  })
  totalSessionsCount: number;

  @ApiProperty({
    description: 'Duración total de todas las sesiones en milisegundos',
    example: 3600000,
  })
  totalSessionDuration: number;

  @ApiProperty({
    description: 'Número total de chats asociados al visitante',
    example: 3,
  })
  totalChatsCount: number;

  @ApiProperty({
    description: 'IDs de chats pendientes (sin asignar) del visitante',
    type: [String],
    example: ['chat-uuid-1', 'chat-uuid-2'],
  })
  pendingChatIds: string[];

  @ApiPropertyOptional({
    description: 'Dirección IP de la última sesión del visitante',
    example: '192.168.1.100',
  })
  lastIpAddress?: string;

  @ApiPropertyOptional({
    description: 'User-Agent de la última sesión del visitante',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  })
  lastUserAgent?: string;

  @ApiPropertyOptional({
    description: 'Fingerprint único del navegador del visitante',
    example: 'fp_a1b2c3d4e5f6g7h8i9j0',
  })
  fingerprint?: string;

  @ApiProperty({
    description:
      'Indica si este visitante tiene la misma IP que quien hace la búsqueda (útil para detectar comerciales que navegaron por el sitio)',
    example: true,
  })
  isMe: boolean;

  @ApiPropertyOptional({
    description:
      'ID del comercial asignado al chat abierto más reciente del visitante (si existe)',
    example: '550e8400-e29b-41d4-a716-446655440099',
  })
  assignedCommercialId?: string;

  @ApiPropertyOptional({
    description: 'Datos del comercial asignado (nombre y avatar)',
    type: 'object',
    additionalProperties: false,
    example: {
      id: '550e8400-e29b-41d4-a716-446655440099',
      name: 'Laura García',
      avatarUrl: 'https://cdn.example.com/avatars/laura.jpg',
    },
  })
  assignedCommercial?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

/**
 * Respuesta de búsqueda de visitantes
 */
export class SearchVisitorsResponseDto {
  @ApiProperty({
    description: 'Lista de visitantes que coinciden con los filtros',
    type: [VisitorSummaryDto],
  })
  visitors: VisitorSummaryDto[];

  @ApiProperty({
    description: 'Información de paginación',
    type: PaginationInfoDto,
  })
  pagination: PaginationInfoDto;

  @ApiPropertyOptional({
    description: 'Filtros aplicados (para referencia)',
    example: { lifecycle: ['LEAD'], connectionStatus: ['online'] },
  })
  appliedFilters?: Record<string, unknown>;
}

/**
 * Estadísticas de filtrado
 */
export class FilterStatsDto {
  @ApiProperty({
    description: 'Total de visitantes sin filtros',
    example: 1000,
  })
  totalVisitors: number;

  @ApiProperty({
    description: 'Visitantes que coinciden con los filtros',
    example: 150,
  })
  matchingVisitors: number;

  @ApiProperty({
    description: 'Porcentaje de coincidencia',
    example: 15.0,
  })
  matchPercentage: number;
}
