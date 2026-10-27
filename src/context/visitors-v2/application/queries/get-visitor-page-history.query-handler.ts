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
    const pages: VisitorPageHistoryItemDto[] = events.map((event) => {
      const metadata = event.getMetadata().getValue() as Record<
        string,
        unknown
      >;
      const pageMeta =
        metadata['page'] && typeof metadata['page'] === 'object'
          ? (metadata['page'] as Record<string, unknown>)
          : undefined;

      const url = String(
        metadata['url'] ?? pageMeta?.['url'] ?? pageMeta?.['path'] ?? '',
      ).trim();

      let path: string | undefined =
        typeof pageMeta?.['path'] === 'string' ? pageMeta['path'] : undefined;

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
      const referrer = GetVisitorPageHistoryQueryHandler.readOptionalString(
        pageMeta?.['referrer'] ?? metadata['referrer'],
      );
      const device = GetVisitorPageHistoryQueryHandler.asRecord(
        metadata['device'],
      );
      const userAgent = GetVisitorPageHistoryQueryHandler.readOptionalString(
        device?.['userAgent'] ?? metadata['userAgent'] ?? metadata['ua'],
      );

      return {
        url: url || path || '/',
        path: path || '/',
        title,
        occurredAt: event.getOccurredAt().toISOString(),
        index: 0,
        ...(referrer !== undefined ? { referrer } : {}),
        ...(userAgent ? { userAgent } : {}),
      };
    });

    const collapsed =
      GetVisitorPageHistoryQueryHandler.collapseConsecutivePages(pages);
    const fetchedAll = events.length >= totalCount;
    const visibleTotal = fetchedAll
      ? collapsed.length
      : Math.max(collapsed.length, totalCount - (pages.length - collapsed.length));
    const reindexed = collapsed.map((page, i) => ({
      ...page,
      index: visibleTotal - i,
    }));

    return {
      visitorId: query.visitorId,
      total: visibleTotal,
      pages: reindexed,
    };
  }

  /**
   * Varias cargas seguidas de la misma URL son una sola visita.
   * Se conserva la más reciente (la lista ya llega de más nueva a más antigua).
   */
  private static collapseConsecutivePages(
    pages: VisitorPageHistoryItemDto[],
  ): VisitorPageHistoryItemDto[] {
    const collapsed: VisitorPageHistoryItemDto[] = [];
    for (const page of pages) {
      const previous = collapsed[collapsed.length - 1];
      if (
        previous &&
        GetVisitorPageHistoryQueryHandler.pageKey(previous.url) ===
          GetVisitorPageHistoryQueryHandler.pageKey(page.url)
      ) {
        continue;
      }
      collapsed.push(page);
    }
    return collapsed;
  }

  private static pageKey(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) return '/';
    try {
      const parsed = new URL(trimmed);
      const path =
        parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/+$/, '') || '/';
      return `${parsed.protocol}//${parsed.host.toLowerCase()}${path}${parsed.search}`;
    } catch {
      return trimmed.replace(/\/+$/, '').toLowerCase() || '/';
    }
  }

  /** Cadena presente en el evento. Vacía = referrer explícito (entrada directa). */
  private static readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    return value.trim();
  }

  private static asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    return value as Record<string, unknown>;
  }
}
