import { VisitorV2 } from '../../../domain/visitor-v2.aggregate';
import { VisitorV2MongoEntity } from '../entity/visitor-v2-mongo.entity';
import { VisitorLifecycleUtils } from '../../../domain/value-objects/visitor-lifecycle';
import { ConnectionStatus } from '../../../domain/value-objects/visitor-connection';
import {
  isVisitorBlockReason,
  VisitorBlockRecord,
  VisitorUnblockRecord,
} from '../../../domain/value-objects/visitor-block';

/**
 * Mapper para convertir entre el agregado de dominio VisitorV2
 * y la entidad de persistencia MongoDB
 */
export class VisitorV2Mapper {
  /**
   * Convierte de entidad de dominio a entidad de persistencia
   */
  static toPersistence(visitor: VisitorV2): Partial<VisitorV2MongoEntity> {
    const primitives = visitor.toPrimitives();

    return {
      id: primitives.id,
      tenantId: primitives.tenantId,
      siteId: primitives.siteId,
      fingerprint: primitives.fingerprint,
      lifecycle: primitives.lifecycle,
      connectionStatus: primitives.connectionStatus,
      hasAcceptedPrivacyPolicy: primitives.hasAcceptedPrivacyPolicy,
      privacyPolicyAcceptedAt: primitives.privacyPolicyAcceptedAt
        ? new Date(primitives.privacyPolicyAcceptedAt)
        : null,
      consentVersion: primitives.consentVersion,
      currentUrl: primitives.currentUrl || null,
      isInternal: primitives.isInternal,
      block: primitives.block
        ? {
            blockedAt: new Date(primitives.block.blockedAt),
            blockedBy: primitives.block.blockedBy,
            blockedByName: primitives.block.blockedByName,
            reason: primitives.block.reason,
            note: primitives.block.note,
          }
        : null,
      lastUnblock: primitives.lastUnblock
        ? {
            unblockedAt: new Date(primitives.lastUnblock.unblockedAt),
            unblockedBy: primitives.lastUnblock.unblockedBy,
            unblockedByName: primitives.lastUnblock.unblockedByName,
          }
        : null,
      createdAt: new Date(primitives.createdAt),
      updatedAt: new Date(primitives.updatedAt),
      sessions: primitives.sessions.map((session) => ({
        id: session.id,
        startedAt: new Date(session.startedAt),
        lastActivityAt: new Date(session.lastActivityAt),
        endedAt: session.endedAt ? new Date(session.endedAt) : undefined,
        currentUrl: session.currentUrl,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })),
    };
  }

  /**
   * Convierte de entidad de persistencia a entidad de dominio
   */
  static fromPersistence(entity: VisitorV2MongoEntity): VisitorV2 {
    return VisitorV2.fromPrimitives({
      id: entity.id,
      tenantId: entity.tenantId,
      siteId: entity.siteId,
      fingerprint: entity.fingerprint,
      lifecycle: VisitorLifecycleUtils.fromValue(entity.lifecycle),
      connectionStatus:
        (entity.connectionStatus as ConnectionStatus) ||
        ConnectionStatus.OFFLINE,
      hasAcceptedPrivacyPolicy: entity.hasAcceptedPrivacyPolicy,
      privacyPolicyAcceptedAt: entity.privacyPolicyAcceptedAt
        ? entity.privacyPolicyAcceptedAt.toISOString()
        : null,
      consentVersion: entity.consentVersion,
      currentUrl: entity.currentUrl || undefined,
      isInternal: entity.isInternal || false,
      block: VisitorV2Mapper.toBlock(entity.block),
      lastUnblock: VisitorV2Mapper.toLastUnblock(entity.lastUnblock),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      sessions: entity.sessions.map((session) => ({
        id: session.id,
        startedAt: session.startedAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        endedAt: session.endedAt ? session.endedAt.toISOString() : undefined,
        currentUrl: session.currentUrl,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })),
    });
  }

  private static toBlock(
    block: VisitorV2MongoEntity['block'],
  ): VisitorBlockRecord | null {
    if (!block?.blockedAt || !isVisitorBlockReason(block.reason)) {
      return null;
    }
    const blockedAt =
      block.blockedAt instanceof Date
        ? block.blockedAt
        : new Date(block.blockedAt);
    return {
      blockedAt: blockedAt.toISOString(),
      blockedBy: block.blockedBy,
      blockedByName: block.blockedByName,
      reason: block.reason,
      ...(block.note ? { note: block.note } : {}),
    };
  }

  private static toLastUnblock(
    record: VisitorV2MongoEntity['lastUnblock'],
  ): VisitorUnblockRecord | null {
    if (!record?.unblockedAt) {
      return null;
    }
    const unblockedAt =
      record.unblockedAt instanceof Date
        ? record.unblockedAt
        : new Date(record.unblockedAt);
    return {
      unblockedAt: unblockedAt.toISOString(),
      unblockedBy: record.unblockedBy,
      unblockedByName: record.unblockedByName,
    };
  }
}
