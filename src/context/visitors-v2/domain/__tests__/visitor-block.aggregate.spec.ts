import { VisitorV2 } from '../visitor-v2.aggregate';
import { VisitorId } from '../value-objects/visitor-id';
import { TenantId } from '../value-objects/tenant-id';
import { SiteId } from '../value-objects/site-id';
import { VisitorFingerprint } from '../value-objects/visitor-fingerprint';
import { VisitorLifecycleVO } from '../value-objects/visitor-lifecycle';
import { VisitorBlockedEvent } from '../events/visitor-blocked.event';
import { VisitorUnblockedEvent } from '../events/visitor-unblocked.event';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

const buildVisitor = () =>
  VisitorV2.create({
    id: new VisitorId(Uuid.random().value),
    tenantId: new TenantId(Uuid.random().value),
    siteId: new SiteId(Uuid.random().value),
    fingerprint: new VisitorFingerprint('fp_test'),
    lifecycle: VisitorLifecycleVO.anon(),
  });

describe('VisitorV2 bloqueo', () => {
  it('guarda el motivo y quién bloqueó, sin cambiar el ciclo de vida', () => {
    const visitor = buildVisitor();
    const actorId = Uuid.random().value;
    visitor.blockVisitor({
      blockedBy: actorId,
      blockedByName: 'María',
      reason: 'spam',
    });

    expect(visitor.isBlocked()).toBe(true);
    expect(visitor.getLifecycle().getValue()).toBe('anon');
    expect(visitor.getBlock()).toEqual(
      expect.objectContaining({
        blockedBy: actorId,
        blockedByName: 'María',
        reason: 'spam',
      }),
    );
    expect(
      visitor.getUncommittedEvents().some((event) => event instanceof VisitorBlockedEvent),
    ).toBe(true);
  });

  it('exige nota cuando el motivo es otro', () => {
    const visitor = buildVisitor();
    expect(() =>
      visitor.blockVisitor({
        blockedBy: Uuid.random().value,
        blockedByName: 'María',
        reason: 'other',
      }),
    ).toThrow('El motivo «Otro» necesita una nota');
  });

  it('al desbloquear limpia el bloqueo y guarda quién lo levantó', () => {
    const visitor = buildVisitor();
    visitor.blockVisitor({
      blockedBy: Uuid.random().value,
      blockedByName: 'María',
      reason: 'test',
      note: 'prueba',
    });
    const actorId = Uuid.random().value;
    visitor.unblockVisitor({
      unblockedBy: actorId,
      unblockedByName: 'Admin',
    });

    const primitives = visitor.toPrimitives();
    expect(primitives.block).toBeNull();
    expect(primitives.lastUnblock).toEqual(
      expect.objectContaining({
        unblockedBy: actorId,
        unblockedByName: 'Admin',
      }),
    );
    expect(
      visitor
        .getUncommittedEvents()
        .some((event) => event instanceof VisitorUnblockedEvent),
    ).toBe(true);
  });
});
