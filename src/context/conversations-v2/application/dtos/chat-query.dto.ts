import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsArray,
  IsString,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** Parsea query params que llegan como JSON string (p. ej. filters={...}). */
function parseJsonQueryParam({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * DTO para filtros de búsqueda de chats
 */
export class ChatFiltersDto {
  @ApiProperty({
    description: 'Estados de chat a filtrar',
    enum: [
      'PENDING',
      'ASSIGNED',
      'ACTIVE',
      'CLOSED',
      'TRANSFERRED',
      'ABANDONED',
    ],
    isArray: true,
    required: false,
    example: ['PENDING', 'ASSIGNED'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(
    ['PENDING', 'ASSIGNED', 'ACTIVE', 'CLOSED', 'TRANSFERRED', 'ABANDONED'],
    { each: true },
  )
  status?: string[];

  @ApiProperty({
    description: 'Prioridades de chat a filtrar',
    enum: ['LOW', 'MEDIUM', 'NORMAL', 'HIGH', 'URGENT'],
    isArray: true,
    required: false,
    example: ['HIGH', 'URGENT'],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(['LOW', 'MEDIUM', 'NORMAL', 'HIGH', 'URGENT'], { each: true })
  priority?: string[];

  @ApiProperty({
    description: 'ID del visitante para filtrar',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  visitorId?: string;

  @ApiProperty({
    description: 'ID del comercial asignado para filtrar',
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsString()
  assignedCommercialId?: string;

  @ApiProperty({
    description: 'IDs de comerciales disponibles para filtrar',
    type: [String],
    required: false,
    example: [
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  availableCommercialIds?: string[];

  @ApiProperty({
    description: 'Fecha de inicio del rango (ISO 8601)',
    required: false,
    example: '2025-07-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({
    description: 'Fecha de fin del rango (ISO 8601)',
    required: false,
    example: '2025-07-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiProperty({
    description: 'Departamento para filtrar',
    required: false,
    example: 'ventas',
  })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({
    description: 'Filtrar solo chats con mensajes no leídos',
    required: false,
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  hasUnreadMessages?: boolean;
}

/**
 * DTO para opciones de ordenamiento
 */
export class ChatSortDto {
  @ApiProperty({
    description: 'Campo por el cual ordenar',
    enum: ['createdAt', 'lastMessageDate', 'priority', 'totalMessages'],
    example: 'createdAt',
  })
  @IsEnum(['createdAt', 'lastMessageDate', 'priority', 'totalMessages'])
  field: 'createdAt' | 'lastMessageDate' | 'priority' | 'totalMessages';

  @ApiProperty({
    description: 'Dirección del ordenamiento',
    enum: ['ASC', 'DESC'],
    example: 'DESC',
  })
  @IsEnum(['ASC', 'DESC'])
  direction: 'ASC' | 'DESC';
}

/**
 * DTO para parámetros de paginación con cursor
 */
export class PaginationDto {
  @ApiProperty({
    description:
      'Cursor para paginación (basado en el último elemento obtenido)',
    required: false,
    example:
      'eyJsYXN0TWVzc2FnZUF0IjoiMjAyNS0wNy0yOFQxMDozMDowMC4wMDBaIiwiaWQiOiJjaGF0LTEyMyJ9',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({
    description: 'Número de elementos por página',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * DTO para consulta de chats con filtros, ordenamiento y paginación
 */
export class GetChatsQueryDto extends PaginationDto {
  @ApiProperty({
    description:
      'Filtros de búsqueda (objeto o JSON string en query: filters={"status":["ASSIGNED"]})',
    type: ChatFiltersDto,
    required: false,
  })
  @IsOptional()
  @Transform(parseJsonQueryParam)
  filters?: ChatFiltersDto;

  @ApiProperty({
    description:
      'Opciones de ordenamiento (objeto o JSON string: sort={"field":"createdAt","direction":"DESC"})',
    type: ChatSortDto,
    required: false,
  })
  @IsOptional()
  @Transform(parseJsonQueryParam)
  sort?: ChatSortDto;
}

/**
 * DTO para métricas comerciales
 */
export class CommercialMetricsResponseDto {
  @ApiProperty({
    description: 'Total de chats asignados',
    example: 50,
  })
  totalChats: number;

  @ApiProperty({
    description: 'Chats activos actualmente',
    example: 5,
  })
  activeChats: number;

  @ApiProperty({
    description: 'Chats cerrados',
    example: 40,
  })
  closedChats: number;

  @ApiProperty({
    description: 'Tiempo promedio de respuesta en minutos',
    example: 3.5,
  })
  averageResponseTime: number;

  @ApiProperty({
    description: 'Total de mensajes enviados',
    example: 500,
  })
  totalMessages: number;

  @ApiProperty({
    description: 'Duración promedio de chat en minutos',
    example: 25.3,
  })
  averageChatDuration: number;

  @ApiProperty({
    description: 'Tasa de resolución (0-1)',
    example: 0.92,
  })
  resolutionRate: number;
}

/**
 * DTO para estadísticas de tiempo de respuesta
 */
export class ResponseTimeStatsDto {
  @ApiProperty({
    description: 'Período de tiempo',
    example: '2025-07-28',
  })
  period: string;

  @ApiProperty({
    description: 'Tiempo promedio de respuesta en minutos',
    example: 4.2,
  })
  avgResponseTime: number;

  @ApiProperty({
    description: 'Cantidad de chats en el período',
    example: 15,
  })
  count: number;
}
