import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { GetVisitorPageHistoryQuery } from './get-visitor-page-history.query';
import {
  GetVisitorPageHistoryResponseDto,
  VisitorPageHistoryItemDto,
} from '../dtos/get-visitor-page-history-response.dto';
import {
  VISITOR_V2_REPOSITORY,
  VisitorV2Repository,
} from '../../domain/visitor-v2.repository';
import {
  TRACKING_EVENT_REPOSITORY,
  TrackingEventRepository,
} from 'src/context/tracking-v2/domain/tracking-event.repository';
import { VisitorId } from '../../domain/value-objects/visitor-id';

@QueryHandler(GetVisitorPageHistoryQuery)
export class GetVisitorPageHistoryQueryHandler
  implements
    IQueryHandler<GetVisitorPageHistoryQuery, GetVisitorPageHistoryResponseDto>
{
  constructor(
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitorRepository: VisitorV2Repository,
    @Inject(TRACKING_EVENT_REPOSITORY)
    private readonly trackingRepository: TrackingEventRepository,
  ) {}

  async execute(
    query: GetVisitorPageHistoryQuery,
  ): Promise<GetVisitorPageHistoryResponseDto> {
    const visitorId = new VisitorId(query.visitorId);

    const visitorResult = await this.visitorRepository.findById(visitorId);
    if (visitorResult.isErr()) {
      throw new NotFoundException(
        `Visitante con ID ${query.visitorId} no encontrado`,
      );
    }

    const limit = Math.min(Math.max(query.limit || 50, 1), 100);
    const eventsResult = await this.trackingRepository.findByVisitorId(
      visitorId,
      {
        eventType: 'PAGE_VIEW',
        limit,
        sortBy: 'occurredAt',
        sortOrder: 'DESC',
      },
    );

    if (eventsResult.isErr()) {
      return {
        visitorId: query.visitorId,
        total: 0,
        pages: [],
      };
    }

    const { events, totalCount } = eventsResult.unwrap();
    const total = totalCount;
    const pages: VisitorPageHistoryItemDto[] = events.map((event, i) => {
      const metadata = event.getMetadata().getValue() as Record<string, unknown>;
      const pageMeta =
        metadata['page'] && typeof metadata['page'] === 'object'
          ? (metadata['page'] as Record<string, unknown>)
          : undefined;

      const url = String(
        metadata['url'] ??
          pageMeta?.['url'] ??
          pageMeta?.['path'] ??
          '',
      ).trim();

      let path: string | undefined =
        typeof pageMeta?.['path'] === 'string'
          ? pageMeta['path']
          : undefined;

      if (!path && url) {
        try {
          path = url.startsWith('http')
            ? new URL(url).pathname
            : url.split('?')[0];
        } catch {
          path = url;
        }
      }

      const title =
        typeof metadata['title'] === 'string' ? metadata['title'] : undefined;

      return {
        url: url || path || '/',
        path: path || '/',
        title,
        occurredAt: event.getOccurredAt().toISOString(),
        // Más reciente = total, más antigua del lote = total - n + 1
        index: total - i,
      };
    });

    return {
      visitorId: query.visitorId,
      total,
      pages,
    };
  }
}
