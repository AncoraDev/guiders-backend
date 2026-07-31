import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Result, ok, err, okVoid } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { ILeadContactDataRepository } from '../../../domain/lead-contact-data.repository';
import { LeadContactDataPrimitives } from '../../../domain/services/crm-sync.service';
import {
  LeadContactDataSchema,
  LeadContactDataDocument,
} from '../schemas/lead-contact-data.schema';
import { LeadsPersistenceError } from '../../../domain/errors/leads.error';

@Injectable()
export class MongoLeadContactDataRepositoryImpl
  implements ILeadContactDataRepository
{
  private readonly logger = new Logger(MongoLeadContactDataRepositoryImpl.name);

  constructor(
    @InjectModel(LeadContactDataSchema.name)
    private readonly model: Model<LeadContactDataDocument>,
  ) {}

  async save(
    data: LeadContactDataPrimitives,
  ): Promise<Result<void, DomainError>> {
    try {
      await this.model.create(this.toSchema(data));
      this.logger.log(
        `Datos de contacto guardados para visitor ${data.visitorId}`,
      );
      return okVoid();
    } catch (error) {
      this.logger.error(
        `Error guardando datos de contacto: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async findByVisitorId(
    visitorId: string,
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives | null, DomainError>> {
    try {
      const doc = await this.model.findOne({ visitorId, companyId }).lean();
      if (!doc) {
        return ok(null);
      }
      return ok(this.toPrimitives(doc));
    } catch (error) {
      this.logger.error(
        `Error buscando datos de contacto: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async update(
    data: LeadContactDataPrimitives,
  ): Promise<Result<void, DomainError>> {
    try {
      const result = await this.model.findOneAndUpdate(
        { visitorId: data.visitorId, companyId: data.companyId },
        { $set: this.toSchema(data) },
        { new: true },
      );

      if (!result) {
        return err(
          new LeadsPersistenceError(
            `No se encontro registro para visitor ${data.visitorId}`,
          ),
        );
      }

      this.logger.log(
        `Datos de contacto actualizados para visitor ${data.visitorId}`,
      );
      return okVoid();
    } catch (error) {
      this.logger.error(
        `Error actualizando datos de contacto: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async delete(
    visitorId: string,
    companyId: string,
  ): Promise<Result<void, DomainError>> {
    try {
      await this.model.deleteOne({ visitorId, companyId });
      this.logger.log(`Datos de contacto eliminados para visitor ${visitorId}`);
      return okVoid();
    } catch (error) {
      this.logger.error(
        `Error eliminando datos de contacto: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async findByEmail(
    email: string,
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives | null, DomainError>> {
    try {
      const doc = await this.model.findOne({ email, companyId }).lean();
      if (!doc) {
        return ok(null);
      }
      return ok(this.toPrimitives(doc));
    } catch (error) {
      this.logger.error(
        `Error buscando por email: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async exists(
    visitorId: string,
    companyId: string,
  ): Promise<Result<boolean, DomainError>> {
    try {
      const count = await this.model.countDocuments({ visitorId, companyId });
      return ok(count > 0);
    } catch (error) {
      this.logger.error(
        `Error verificando existencia: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async findByChatId(
    chatId: string,
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives[], DomainError>> {
    try {
      const docs = await this.model
        .find({ extractedFromChatId: chatId, companyId })
        .lean();
      return ok(docs.map((doc) => this.toPrimitives(doc)));
    } catch (error) {
      this.logger.error(
        `Error buscando por chatId: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async findById(
    id: string,
  ): Promise<Result<LeadContactDataPrimitives | null, DomainError>> {
    try {
      const doc = await this.model.findOne({ id }).lean();
      if (!doc) {
        return ok(null);
      }
      return ok(this.toPrimitives(doc));
    } catch (error) {
      this.logger.error(`Error buscando por id: ${error.message}`, error.stack);
      return err(new LeadsPersistenceError(error.message));
    }
  }

  async findByCompanyId(
    companyId: string,
  ): Promise<Result<LeadContactDataPrimitives[], DomainError>> {
    try {
      const docs = await this.model
        .find({ companyId })
        .sort({ extractedAt: -1 })
        .lean();
      return ok(docs.map((doc) => this.toPrimitives(doc)));
    } catch (error) {
      this.logger.error(
        `Error buscando por companyId: ${error.message}`,
        error.stack,
      );
      return err(new LeadsPersistenceError(error.message));
    }
  }

  private toSchema(data: LeadContactDataPrimitives): Record<string, unknown> {
    return {
      id: data.id,
      visitorId: data.visitorId,
      companyId: data.companyId,
      alias: data.alias,
      nombre: data.nombre,
      apellidos: data.apellidos,
      email: data.email,
      telefono: data.telefono,
      dni: data.dni,
      poblacion: data.poblacion,
      additionalData: data.additionalData,
      extractedFromChatId: data.extractedFromChatId,
      extractedAt: data.extractedAt,
    };
  }

  private toPrimitives(doc: any): LeadContactDataPrimitives {
    return {
      id: doc.id,
      visitorId: doc.visitorId,
      companyId: doc.companyId,
      alias: doc.alias,
      nombre: doc.nombre,
      apellidos: doc.apellidos,
      email: doc.email,
      telefono: doc.telefono,
      dni: doc.dni,
      poblacion: doc.poblacion,
      additionalData: doc.additionalData,
      extractedFromChatId: doc.extractedFromChatId,
      extractedAt: doc.extractedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
