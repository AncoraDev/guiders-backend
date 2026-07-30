import { ApiProperty } from '@nestjs/swagger';

export class VisitorPageHistoryItemDto {
  @ApiProperty({ description: 'URL completa o path visitado' })
  url: string;

  @ApiProperty({ description: 'Path relativo si se pudo extraer', required: false })
  path?: string;

  @ApiProperty({ description: 'Título de la página si está disponible', required: false })
  title?: string;

  @ApiProperty({ description: 'Momento de la visita (ISO)', type: String })
  occurredAt: string;

  @ApiProperty({
    description: 'Índice cronológico (N = más reciente, 1 = más antigua en el lote)',
  })
  index: number;
}

export class GetVisitorPageHistoryResponseDto {
  @ApiProperty({ description: 'ID del visitante' })
  visitorId: string;

  @ApiProperty({ description: 'Total de PAGE_VIEW encontrados (sin paginar)' })
  total: number;

  @ApiProperty({
    description: 'Historial de páginas, más reciente primero',
    type: [VisitorPageHistoryItemDto],
  })
  pages: VisitorPageHistoryItemDto[];
}
