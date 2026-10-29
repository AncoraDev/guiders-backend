import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsOptional,
  IsArray,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsString,
  IsUUID,
  ValidateNested,
  IsInt,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';

/**
 * Estados del ciclo de vida del visitante
 */
export enum VisitorLifecycleFilter {
  ANON = 'ANON',
  ENGAGED = 'ENGAGED',
  LEAD = 'LEAD',
  CONVERTED = 'CONVERTED',
}

/**
 * Estados de conexión del visitante
 */
export enum VisitorConnectionStatusFilter {
  ONLINE = 'online',
  AWAY = 'away',
  CHATTING = 'chatting',
  OFFLINE = 'offline',
}

/**
 * Operadores de filtrado disponibles
 */
export enum FilterOperator {
  EQUALS = 'eq',
  NOT_EQUALS = 'neq',
  GREATER_THAN = 'gt',
  GREATER_OR_EQUALS = 'gte',
  LESS_THAN = 'lt',
  LESS_OR_EQUALS = 'lte',
  IN = 'in',
  NOT_IN = 'nin',
  CONTAINS = 'contains',
  STARTS_WITH = 'startsWith',
  ENDS_WITH = 'endsWith',
}

/**
 * Lógica de combinación de filtros
 */
export enum FilterLogic {
  AND = 'AND',
  OR = 'OR',
}

/**
 * Filtro individual para búsqueda avanzada
 */
export class AdvancedFilterDto {
  @ApiProperty({
    description: 'Campo a filtrar',
    example: 'lifecycle',
  })
  @IsString()
  field: string;

  @ApiProperty({
    description: 'Operador de comparación',
    enum: FilterOperator,
    example: FilterOperator.EQUALS,
  })
  @IsEnum(FilterOperator)
  operator: FilterOperator;

  @ApiProperty({
    description: 'Valor del filtro',
    example: 'LEAD',
  })
  value: string | string[] | number | boolean;
}

/**
 * DTO para filtros básicos de visitantes
 */
export class VisitorFiltersDto {
  @ApiPropertyOptional({
    description: 'Filtrar por ciclo de vida del visitante',
    enum: VisitorLifecycleFilter,
    isArray: true,
    example: [VisitorLifecycleFilter.LEAD, VisitorLifecycleFilter.CONVERTED],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(VisitorLifecycleFilter, { each: true })
  @ArrayMaxSize(4)
  lifecycle?: VisitorLifecycleFilter[];

  @ApiPropertyOptional({
    description: 'Filtrar por estado de conexión',
    enum: VisitorConnectionStatusFilter,
    isArray: true,
    example: [
      VisitorConnectionStatusFilter.ONLINE,
      VisitorConnectionStatusFilter.CHATTING,
    ],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(VisitorConnectionStatusFilter, { each: true })
  @ArrayMaxSize(4)
  connectionStatus?: VisitorConnectionStatusFilter[];

  @ApiPropertyOptional({
    description: 'Filtrar por aceptación de política de privacidad',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string | boolean }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  hasAcceptedPrivacyPolicy?: boolean;

  @ApiPropertyOptional({
    description: 'Fecha de creación desde (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Fecha de creación hasta (ISO 8601)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    description: 'Última actividad desde (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  lastActivityFrom?: string;

  @ApiPropertyOptional({
    description: 'Última actividad hasta (ISO 8601)',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  lastActivityTo?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por IDs de sitio específicos',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMaxSize(10)
  siteIds?: string[];

  @ApiPropertyOptional({
    description: 'Filtrar por URL actual que contenga este texto',
    example: '/pricing',
  })
  @IsOptional()
  @IsString()
  currentUrlContains?: string;

  @ApiPropertyOptional({
    description: 'Filtrar solo visitantes con sesiones activas',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string | boolean }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  hasActiveSessions?: boolean;

  @ApiPropertyOptional({
    description: 'Número mínimo de sesiones totales del visitante',
    minimum: 0,
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minTotalSessionsCount?: number;

  @ApiPropertyOptional({
    description: 'Número máximo de sesiones totales del visitante',
    minimum: 0,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxTotalSessionsCount?: number;

  @ApiPropertyOptional({
    description:
      'Filtrar por dirección IP (busca en todas las sesiones del visitante)',
    example: '192.168.1.1',
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({
    description:
      'Filtrar por tipo de visitante (interno/comercial vs. externo)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string | boolean }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  isInternal?: boolean;

  @ApiPropertyOptional({
    description:
      'true = solo visitantes bloqueados; false = excluir bloqueados',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string | boolean }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  blocked?: boolean;

  @ApiPropertyOptional({
    description:
      'Filtrar por visitantes con chats pendientes (sin asignar). true = solo con chats pendientes, false = sin chats pendientes',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: string | boolean }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  hasPendingChats?: boolean;
}

/**
 * Campos disponibles para ordenamiento
 */
export enum VisitorSortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  LAST_ACTIVITY = 'lastActivity',
  LIFECYCLE = 'lifecycle',
  CONNECTION_STATUS = 'connectionStatus',
}

/**
 * Dirección de ordenamiento
 */
export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}

/**
 * DTO para ordenamiento de resultados
 */
export class VisitorSortDto {
  @ApiProperty({
    description: 'Campo por el cual ordenar',
    enum: VisitorSortField,
    default: VisitorSortField.LAST_ACTIVITY,
    example: VisitorSortField.LAST_ACTIVITY,
  })
  @IsEnum(VisitorSortField)
  field: VisitorSortField = VisitorSortField.LAST_ACTIVITY;

  @ApiProperty({
    description: 'Dirección del ordenamiento',
    enum: SortDirection,
    default: SortDirection.DESC,
    example: SortDirection.DESC,
  })
  @IsEnum(SortDirection)
  direction: SortDirection = SortDirection.DESC;
}

/**
 * DTO para paginación
 */
export class VisitorPaginationDto {
  @ApiPropertyOptional({
    description: 'Número de página (1-based)',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de resultados por página',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * DTO para búsqueda avanzada de visitantes
 */
export class SearchVisitorsDto extends VisitorPaginationDto {
  @ApiPropertyOptional({
    description: 'Filtros a aplicar',
    type: VisitorFiltersDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisitorFiltersDto)
  filters?: VisitorFiltersDto;

  @ApiPropertyOptional({
    description: 'Ordenamiento de resultados',
    type: VisitorSortDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisitorSortDto)
  sort?: VisitorSortDto;
}

/**
 * DTO para búsqueda avanzada con filtros complejos (AND/OR)
 */
export class AdvancedSearchVisitorsDto extends VisitorPaginationDto {
  @ApiProperty({
    description: 'Array de filtros avanzados',
    type: [AdvancedFilterDto],
    example: [
      { field: 'lifecycle', operator: 'eq', value: 'LEAD' },
      { field: 'lastActivity', operator: 'gte', value: '2024-01-01' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdvancedFilterDto)
  @ArrayMaxSize(10)
  filters: AdvancedFilterDto[];

  @ApiPropertyOptional({
    description: 'Lógica de combinación de filtros',
    enum: FilterLogic,
    default: FilterLogic.AND,
    example: FilterLogic.AND,
  })
  @IsOptional()
  @IsEnum(FilterLogic)
  logic?: FilterLogic = FilterLogic.AND;

  @ApiPropertyOptional({
    description: 'Ordenamiento de resultados',
    type: VisitorSortDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => VisitorSortDto)
  sort?: VisitorSortDto;
}
