import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { ok, err, Result } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  CommercialConnectionSessionRepository,
  CommercialConnectionSessionPrimitives,
  ConnectionSessionEndReason,
  ConnectionSessionSearchParams,
  ConnectionSessionSearchResult,
} from '../../../domain/commercial-connection-session.repository';
import { CommercialConnectionSessionSchema } from '../schemas/commercial-connection-session.schema';

class SessionPersistenceError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

@Injectable()
export class MongoCommercialConnectionSessionRepositoryImpl
  implements CommercialConnectionSessionRepository
{
  private readonly logger = new Logger(
    MongoCommercialConnectionSessionRepositoryImpl.name,
  );

  constructor(
    @InjectModel('CommercialConnectionSession')
    private readonly model: Model<CommercialConnectionSessionSchema>,
  ) {}

  async openSession(params: {
    commercialId: string;
    companyId: string;
    startedAt?: Date;
    commercialDisplayName?: string | null;
  }): Promise<Result<CommercialConnectionSessionPrimitives, DomainError>> {
    try {
      const existing = await this.model
        .findOne({
          commercialId: params.commercialId,
          endedAt: null,
        })
        .exec();

      if (existing) {
        // Actualizar display name si llega uno nuevo y la sesión abierta no lo tenía
        if (
          params.commercialDisplayName &&
          !existing.commercialDisplayName
        ) {
          existing.commercialDisplayName = params.commercialDisplayName;
          await existing.save();
        }
        return ok(
          this.toPrimitives(
            existing.toObject() as unknown as Record<string, unknown>,
          ),
        );
      }

      const startedAt = params.startedAt ?? new Date();
      const doc = await this.model.create({
        id: randomUUID(),
        commercialId: params.commercialId,
        companyId: params.companyId,
        commercialDisplayName: params.commercialDisplayName ?? null,
        startedAt,
        endedAt: null,
        durationMs: null,
        endReason: null,
      });

      return ok(
        this.toPrimitives(
          doc.toObject() as unknown as Record<string, unknown>,
        ),
      );
    } catch (error) {
      this.logger.error('Error abriendo sesión de conexión', error);
      return err(new SessionPersistenceError('No se pudo abrir la sesión'));
    }
  }

  async closeOpenSession(params: {
    commercialId: string;
    endedAt?: Date;
    endReason?: ConnectionSessionEndReason;
  }): Promise<
    Result<CommercialConnectionSessionPrimitives | null, DomainError>
  > {
    try {
      const open = await this.model
        .findOne({
          commercialId: params.commercialId,
          endedAt: null,
        })
        .exec();

      if (!open) {
        return ok(null);
      }

      const endedAt = params.endedAt ?? new Date();
      const durationMs = Math.max(
        0,
        endedAt.getTime() - new Date(open.startedAt).getTime(),
      );

      open.endedAt = endedAt;
      open.durationMs = durationMs;
      open.endReason = params.endReason ?? 'unknown';
      await open.save();

      return ok(
        this.toPrimitives(
          open.toObject() as unknown as Record<string, unknown>,
        ),
      );
    } catch (error) {
      this.logger.error('Error cerrando sesión de conexión', error);
      return err(new SessionPersistenceError('No se pudo cerrar la sesión'));
    }
  }

  async search(
    params: ConnectionSessionSearchParams,
  ): Promise<Result<ConnectionSessionSearchResult, DomainError>> {
    try {
      const page = Math.max(1, params.page || 1);
      const limit = Math.min(Math.max(1, params.limit || 20), 100);
      const skip = (page - 1) * limit;

      const filter: FilterQuery<CommercialConnectionSessionSchema> = {
        companyId: params.companyId,
      };

      if (params.commercialId) {
        filter.commercialId = params.commercialId;
      }

      if (params.from || params.to) {
        filter.startedAt = {};
        if (params.from) {
          filter.startedAt.$gte = params.from;
        }
        if (params.to) {
          filter.startedAt.$lte = params.to;
        }
      }

      if (params.endReason) {
        filter.endReason = params.endReason;
      }

      if (params.status === 'open') {
        filter.endedAt = null;
      } else if (params.status === 'closed') {
        filter.endedAt = { $ne: null };
      }

      const [rows, total] = await Promise.all([
        this.model
          .find(filter)
          .sort({ startedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        this.model.countDocuments(filter).exec(),
      ]);

      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      return ok({
        sessions: rows.map((r) =>
          this.toPrimitives(r as unknown as Record<string, unknown>),
        ),
        total,
        page,
        limit,
        totalPages,
      });
    } catch (error) {
      this.logger.error('Error buscando sesiones de conexión', error);
      return err(new SessionPersistenceError('No se pudieron listar sesiones'));
    }
  }

  async listByCommercial(
    commercialId: string,
    limit = 50,
  ): Promise<Result<CommercialConnectionSessionPrimitives[], DomainError>> {
    try {
      const rows = await this.model
        .find({ commercialId })
        .sort({ startedAt: -1 })
        .limit(limit)
        .lean()
        .exec();
      return ok(
        rows.map((r) =>
          this.toPrimitives(r as unknown as Record<string, unknown>),
        ),
      );
    } catch (error) {
      this.logger.error('Error listando sesiones por comercial', error);
      return err(new SessionPersistenceError('No se pudieron listar sesiones'));
    }
  }

  async listByCompany(
    companyId: string,
    limit = 100,
  ): Promise<Result<CommercialConnectionSessionPrimitives[], DomainError>> {
    try {
      const rows = await this.model
        .find({ companyId })
        .sort({ startedAt: -1 })
        .limit(limit)
        .lean()
        .exec();
      return ok(
        rows.map((r) =>
          this.toPrimitives(r as unknown as Record<string, unknown>),
        ),
      );
    } catch (error) {
      this.logger.error('Error listando sesiones por company', error);
      return err(new SessionPersistenceError('No se pudieron listar sesiones'));
    }
  }

  private toPrimitives(
    doc: Record<string, unknown>,
  ): CommercialConnectionSessionPrimitives {
    return {
      id: String(doc['id']),
      commercialId: String(doc['commercialId']),
      companyId: String(doc['companyId']),
      commercialDisplayName:
        typeof doc['commercialDisplayName'] === 'string'
          ? doc['commercialDisplayName']
          : null,
      startedAt: new Date(doc['startedAt'] as string | Date),
      endedAt: doc['endedAt']
        ? new Date(doc['endedAt'] as string | Date)
        : null,
      durationMs:
        typeof doc['durationMs'] === 'number' ? doc['durationMs'] : null,
      endReason: (doc['endReason'] as ConnectionSessionEndReason) ?? null,
    };
  }
}
