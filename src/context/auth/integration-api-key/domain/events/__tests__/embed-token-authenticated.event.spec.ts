/**
 * Tests del evento de dominio EmbedTokenAuthenticatedEvent (Story 2.2, Task 1.1).
 *
 * Estrategia: tests del event class puro. Valida jerarquía con DomainEvent,
 * EVENT_NAME, auto-generación de id/timestamp, y preservación de attributes.
 *
 * Estos tests deben fallar (RED) hasta que Task 1.1 implemente
 * `../embed-token-authenticated.event.ts`.
 */

import { DomainEvent } from 'src/context/shared/domain/domain-event';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { EmbedTokenAuthenticatedEvent } from '../embed-token-authenticated.event';

describe('EmbedTokenAuthenticatedEvent - Story 2.2 (unit)', () => {
  it('debe ser instancia de DomainEvent', () => {
    const attributes = {
      companyId: Uuid.random().value,
      userId: Uuid.random().value,
      origin: 'https://app.integrator.com',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      endpoint: '/embed/authenticate-session',
    };
    const event = new EmbedTokenAuthenticatedEvent(attributes);

    expect(event).toBeInstanceOf(DomainEvent);
    expect(event).toBeInstanceOf(EmbedTokenAuthenticatedEvent);
  });

  it('debe tener static EVENT_NAME = "EmbedTokenAuthenticatedEvent"', () => {
    expect(EmbedTokenAuthenticatedEvent.EVENT_NAME).toBe(
      'EmbedTokenAuthenticatedEvent',
    );
  });

  it('debe tener id, timestamp, attributes auto-generados', () => {
    const attributes = {
      companyId: Uuid.random().value,
      userId: Uuid.random().value,
      origin: 'https://app.integrator.com',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      endpoint: '/v2/integration/embed/start',
    };
    const event = new EmbedTokenAuthenticatedEvent(attributes);

    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.attributes).toEqual(attributes);
  });

  it('debe preservar todos los attributes en event.attributes', () => {
    const attributes = {
      companyId: Uuid.random().value,
      userId: Uuid.random().value,
      origin: 'https://app.leadcars.es',
      timestamp: '2026-06-15T12:00:00.000Z',
      ipAddress: '10.0.0.1',
      userAgent: 'curl/7.68.0',
      endpoint: '/v2/integration/embed/refresh',
    };
    const event = new EmbedTokenAuthenticatedEvent(attributes);

    expect(event.attributes.companyId).toBe(attributes.companyId);
    expect(event.attributes.userId).toBe(attributes.userId);
    expect(event.attributes.origin).toBe(attributes.origin);
    expect(event.attributes.timestamp).toBe(attributes.timestamp);
    expect(event.attributes.ipAddress).toBe(attributes.ipAddress);
    expect(event.attributes.userAgent).toBe(attributes.userAgent);
    expect(event.attributes.endpoint).toBe(attributes.endpoint);
  });

  it('debe generar ids únicos en instancias diferentes', () => {
    const attributes = {
      companyId: Uuid.random().value,
      userId: Uuid.random().value,
      origin: 'https://app.integrator.com',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      endpoint: '/embed/authenticate-session',
    };
    const event1 = new EmbedTokenAuthenticatedEvent(attributes);
    const event2 = new EmbedTokenAuthenticatedEvent(attributes);

    expect(event1.id).not.toEqual(event2.id);
  });
});
