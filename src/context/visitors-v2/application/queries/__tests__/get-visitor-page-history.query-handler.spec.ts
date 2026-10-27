import { GetVisitorPageHistoryQueryHandler } from '../get-visitor-page-history.query-handler';
import { GetVisitorPageHistoryQuery } from '../get-visitor-page-history.query';
import { VisitorV2Repository } from '../../../domain/visitor-v2.repository';
import { TrackingEventRepository } from 'src/context/tracking-v2/domain/tracking-event.repository';
import { TrackingEvent } from 'src/context/tracking-v2/domain/tracking-event.aggregate';
import {
  EventMetadata,
  EventOccurredAt,
  EventType,
  SessionId,
  SiteId,
  TenantId,
  TrackingEventId,
  VisitorId,
} from 'src/context/tracking-v2/domain/value-objects';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { ok } from 'src/context/shared/domain/result';

describe('GetVisitorPageHistoryQueryHandler', () => {
  const visitorId = Uuid.random().value;

  function pageView(
    metadata: Record<string, unknown>,
    occurredAt = '2026-10-08T10:00:00.000Z',
  ): TrackingEvent {
    return TrackingEvent.create({
      id: TrackingEventId.random(),
      visitorId: new VisitorId(visitorId),
      sessionId: new SessionId(Uuid.random().value),
      tenantId: new TenantId(Uuid.random().value),
      siteId: new SiteId(Uuid.random().value),
      eventType: EventType.pageView(),
      metadata: new EventMetadata(metadata),
      occurredAt: EventOccurredAt.fromISOString(occurredAt),
    });
  }

  function handlerWith(events: TrackingEvent[]): GetVisitorPageHistoryQueryHandler {
    const visitors = {
      findById: jest.fn().mockResolvedValue(ok({})),
    } as unknown as jest.Mocked<VisitorV2Repository>;
    const tracking = {
      findByVisitorId: jest.fn().mockResolvedValue(
        ok({ events, totalCount: events.length, hasMore: false }),
      ),
    } as unknown as jest.Mocked<TrackingEventRepository>;
    return new GetVisitorPageHistoryQueryHandler(visitors, tracking);
  }

  it('devuelve la URL, el referrer y el user agent de cada PAGE_VIEW', async () => {
    const handler = handlerWith([
      pageView({
        url: 'https://autopractik.es/?utm=home',
        page: {
          url: 'https://autopractik.es/?utm=home',
          path: '/',
          referrer: 'https://www.google.com/',
        },
        device: { userAgent: 'Mozilla/5.0 TestBot' },
      }),
    ]);

    const result = await handler.execute(
      new GetVisitorPageHistoryQuery(visitorId, 50),
    );

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].url).toBe('https://autopractik.es/?utm=home');
    expect(result.pages[0].referrer).toBe('https://www.google.com/');
    expect(result.pages[0].userAgent).toBe('Mozilla/5.0 TestBot');
  });

  it('conserva el referrer vacío como entrada directa y omite el user agent ausente', async () => {
    const handler = handlerWith([
      pageView({
        url: 'https://autopractik.es/',
        page: { referrer: '' },
      }),
    ]);

    const result = await handler.execute(
      new GetVisitorPageHistoryQuery(visitorId, 50),
    );

    expect(result.pages[0].referrer).toBe('');
    expect(result.pages[0].userAgent).toBeUndefined();
  });

  it('junta las cargas seguidas de la misma URL y se queda con la hora más reciente', async () => {
    const handler = handlerWith([
      pageView(
        { url: 'http://127.0.0.1:8083/' },
        '2026-10-27T16:06:00.000Z',
      ),
      pageView(
        { url: 'http://127.0.0.1:8083' },
        '2026-10-27T16:05:00.000Z',
      ),
      pageView(
        { url: 'http://127.0.0.1:8083/coches' },
        '2026-10-27T16:00:00.000Z',
      ),
    ]);

    const result = await handler.execute(
      new GetVisitorPageHistoryQuery(visitorId, 50),
    );

    expect(result.total).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].url).toBe('http://127.0.0.1:8083/');
    expect(result.pages[0].occurredAt).toBe('2026-10-27T16:06:00.000Z');
    expect(result.pages[0].index).toBe(2);
    expect(result.pages[1].url).toBe('http://127.0.0.1:8083/coches');
    expect(result.pages[1].index).toBe(1);
  });

  it('conserva dos visitas a la misma URL si entre medias hubo otra página', async () => {
    const handler = handlerWith([
      pageView({ url: 'http://127.0.0.1:8083/' }, '2026-10-27T16:10:00.000Z'),
      pageView(
        { url: 'http://127.0.0.1:8083/coches' },
        '2026-10-27T16:08:00.000Z',
      ),
      pageView({ url: 'http://127.0.0.1:8083/' }, '2026-10-27T16:00:00.000Z'),
    ]);

    const result = await handler.execute(
      new GetVisitorPageHistoryQuery(visitorId, 50),
    );

    expect(result.pages.map((page) => page.url)).toEqual([
      'http://127.0.0.1:8083/',
      'http://127.0.0.1:8083/coches',
      'http://127.0.0.1:8083/',
    ]);
  });
});
