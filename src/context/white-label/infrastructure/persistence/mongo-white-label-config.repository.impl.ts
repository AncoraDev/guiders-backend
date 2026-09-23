/**
 * Implementación MongoDB del repositorio de configuración White Label
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Provider } from '@nestjs/common';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  IWhiteLabelConfigRepository,
  WHITE_LABEL_CONFIG_REPOSITORY,
} from '../../domain/white-label-config.repository';
import { WhiteLabelConfig } from '../../domain/entities/white-label-config';
import {
  WhiteLabelConfigSchema,
  WhiteLabelConfigDocument,
} from '../schemas/white-label-config.schema';
import {
  WhiteLabelConfigNotFoundError,
  WhiteLabelError,
} from '../../domain/errors/white-label.error';

@Injectable()
export class MongoWhiteLabelConfigRepositoryImpl
  implements IWhiteLabelConfigRepository
{
  private readonly logger = new Logger(
    MongoWhiteLabelConfigRepositoryImpl.name,
  );

  constructor(
    @InjectModel(WhiteLabelConfigSchema.name)
    private readonly model: Model<WhiteLabelConfigDocument>,
  ) {}

  async save(config: WhiteLabelConfig): Promise<Result<void, DomainError>> {
    try {
      const primitives = config.toPrimitives();

      await this.model.findOneAndUpdate(
        { companyId: primitives.companyId },
        {
          $set: {
            colors: primitives.colors,
            branding: primitives.branding,
            typography: primitives.typography,
            theme: primitives.theme,
            embedEnabled: primitives.embedEnabled,
            embedAllowedOrigins: primitives.embedAllowedOrigins,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
            embedEnabled: false,
            embedAllowedOrigins: [],
          },
        },
        { upsert: true, new: true },
      );

      this.logger.debug(
        `Configuración White Label guardada para empresa ${config.companyId}`,
      );
      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error al guardar configuración White Label: ${errorMessage}`,
      );
      return err(
        new WhiteLabelError(`Error al guardar configuración: ${errorMessage}`),
      );
    }
  }

  async findByCompanyId(
    companyId: string,
  ): Promise<Result<WhiteLabelConfig, DomainError>> {
    try {
      const doc = await this.model.findOne({ companyId }).lean().exec();

      if (!doc) {
        return err(new WhiteLabelConfigNotFoundError(companyId));
      }

      const config = WhiteLabelConfig.fromPrimitives({
        id: doc._id.toString(),
        companyId: doc.companyId,
        colors: {
          primary: doc.colors?.primary || '#007bff',
          secondary: doc.colors?.secondary || '#6c757d',
          tertiary: doc.colors?.tertiary || '#17a2b8',
          background: doc.colors?.background || '#ffffff',
          surface: doc.colors?.surface || '#f8f9fa',
          text: doc.colors?.text || '#212529',
          textMuted: doc.colors?.textMuted || '#6c757d',
        },
        branding: {
          logoUrl: doc.branding?.logoUrl || null,
          faviconUrl: doc.branding?.faviconUrl || null,
          brandName: doc.branding?.brandName || '',
        },
        typography: {
          fontFamily: doc.typography?.fontFamily || 'Inter',
          customFontName: doc.typography?.customFontName || null,
          customFontFiles: doc.typography?.customFontFiles || [],
        },
        theme: (doc.theme as 'light' | 'dark' | 'system') || 'light',
        embedEnabled: doc.embedEnabled === true,
        embedAllowedOrigins: Array.isArray(doc.embedAllowedOrigins)
          ? doc.embedAllowedOrigins
          : [],
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      });

      return ok(config);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error al buscar configuración White Label: ${errorMessage}`,
      );
      return err(
        new WhiteLabelError(`Error al buscar configuración: ${errorMessage}`),
      );
    }
  }

  async delete(companyId: string): Promise<Result<void, DomainError>> {
    try {
      const result = await this.model.deleteOne({ companyId }).exec();

      if (result.deletedCount === 0) {
        return err(new WhiteLabelConfigNotFoundError(companyId));
      }

      this.logger.debug(
        `Configuración White Label eliminada para empresa ${companyId}`,
      );
      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(
        `Error al eliminar configuración White Label: ${errorMessage}`,
      );
      return err(
        new WhiteLabelError(`Error al eliminar configuración: ${errorMessage}`),
      );
    }
  }

  async exists(companyId: string): Promise<Result<boolean, DomainError>> {
    try {
      const count = await this.model.countDocuments({ companyId }).exec();
      return ok(count > 0);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error al verificar existencia: ${errorMessage}`);
      return err(
        new WhiteLabelError(`Error al verificar existencia: ${errorMessage}`),
      );
    }
  }
}

/**
 * Provider para inyección de dependencias
 */
export const MongoWhiteLabelConfigRepositoryProvider: Provider = {
  provide: WHITE_LABEL_CONFIG_REPOSITORY,
  useClass: MongoWhiteLabelConfigRepositoryImpl,
};
