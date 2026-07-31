import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SearchProvider,
  SearchParams,
  SearchResult,
  SearchScope,
} from 'src/context/shared/domain/search';
import { LeadContactDataSchema } from '../persistence/schemas/lead-contact-data.schema';

/**
 * Provider de búsqueda para el contexto leads.
 * Busca leads por nombre, apellidos, email o teléfono usando $text.
 * Scope: LEADS — disponible para admin, supervisor y commercial.
 */
@Injectable()
export class LeadSearchProvider implements SearchProvider {
  readonly scope: SearchScope[] = [SearchScope.LEADS];

  private readonly logger = new Logger(LeadSearchProvider.name);

  constructor(
    @InjectModel(LeadContactDataSchema.name)
    private readonly leadModel: Model<LeadContactDataSchema>,
  ) {}

  async search(params: SearchParams): Promise<SearchResult[]> {
    try {
      const limit = params.limit ?? 5;

      const docs = await this.leadModel
        .find({
          companyId: params.companyId,
          $text: { $search: params.query },
        })
        .select(
          'id alias nombre apellidos email telefono visitorId extractedAt',
        )
        .limit(limit)
        .lean()
        .exec();

      return docs.map((doc) => {
        const personName = [doc.nombre, doc.apellidos]
          .filter(Boolean)
          .join(' ');
        const fullName =
          doc.alias?.trim() || personName || 'Lead sin nombre';
        return SearchResult.create({
          id: doc.id,
          scope: SearchScope.LEADS,
          title: fullName,
          subtitle: doc.email ?? doc.telefono ?? 'Sin contacto',
          url: `/leads/${doc.visitorId}`,
          metadata: {
            email: doc.email,
            telefono: doc.telefono,
            visitorId: doc.visitorId,
          },
        });
      });
    } catch (err) {
      this.logger.warn(
        `Error en LeadSearchProvider: ${(err as Error)?.message}`,
      );
      return [];
    }
  }
}
