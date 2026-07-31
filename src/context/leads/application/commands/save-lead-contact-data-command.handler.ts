import {
  CommandHandler,
  ICommandHandler,
  EventBus,
  EventPublisher,
} from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { SaveLeadContactDataCommand } from './save-lead-contact-data.command';
import {
  ILeadContactDataRepository,
  LEAD_CONTACT_DATA_REPOSITORY,
} from '../../domain/lead-contact-data.repository';
import { LeadContactDataPrimitives } from '../../domain/services/crm-sync.service';
import { LeadContactDataSavedEvent } from '../../domain/events/lead-synced.event';
import {
  VisitorV2Repository,
  VISITOR_V2_REPOSITORY,
} from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { VisitorId } from 'src/context/visitors-v2/domain/value-objects/visitor-id';

/**
 * Criterio de Lead: nombre + (email o teléfono).
 */
export function meetsLeadCriteria(
  data: Pick<LeadContactDataPrimitives, 'nombre' | 'email' | 'telefono'>,
): boolean {
  const hasNombre = !!data.nombre?.trim();
  const hasEmail = !!data.email?.trim();
  const hasTelefono = !!data.telefono?.trim();
  return hasNombre && (hasEmail || hasTelefono);
}

@CommandHandler(SaveLeadContactDataCommand)
export class SaveLeadContactDataCommandHandler
  implements ICommandHandler<SaveLeadContactDataCommand>
{
  private readonly logger = new Logger(SaveLeadContactDataCommandHandler.name);

  constructor(
    @Inject(LEAD_CONTACT_DATA_REPOSITORY)
    private readonly repository: ILeadContactDataRepository,
    private readonly eventBus: EventBus,
    @Inject(VISITOR_V2_REPOSITORY)
    private readonly visitorRepository: VisitorV2Repository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(
    command: SaveLeadContactDataCommand,
  ): Promise<Result<string, DomainError>> {
    const { input } = command;

    this.logger.log(
      `Guardando datos de contacto para visitor ${input.visitorId}`,
    );

    // Verificar si ya existen datos para este visitor
    const existingResult = await this.repository.findByVisitorId(
      input.visitorId,
      input.companyId,
    );

    if (existingResult.isErr()) {
      return err(existingResult.error);
    }

    const existing = existingResult.unwrap();

    if (existing) {
      // Actualizar datos existentes (merge parcial)
      const updatedData: LeadContactDataPrimitives = {
        ...existing,
        alias: input.alias ?? existing.alias,
        nombre: input.nombre ?? existing.nombre,
        apellidos: input.apellidos ?? existing.apellidos,
        email: input.email ?? existing.email,
        telefono: input.telefono ?? existing.telefono,
        dni: input.dni ?? existing.dni,
        poblacion: input.poblacion ?? existing.poblacion,
        additionalData: {
          ...existing.additionalData,
          ...input.additionalData,
        },
        extractedFromChatId:
          input.extractedFromChatId ?? existing.extractedFromChatId,
        extractedAt: new Date(),
      };

      const updateResult = await this.repository.update(updatedData);
      if (updateResult.isErr()) {
        return err(updateResult.error);
      }

      this.logger.log(
        `Datos de contacto actualizados para visitor ${input.visitorId}`,
      );

      await this.promoteVisitorToLeadIfEligible(updatedData);

      return ok(existing.id);
    }

    // Crear nuevos datos
    const newData = this.buildNewLeadContactData(input);
    const saveResult = await this.repository.save(newData);

    if (saveResult.isErr()) {
      return err(saveResult.error);
    }

    this.logger.log(
      `Nuevos datos de contacto creados para visitor ${input.visitorId} con id ${newData.id}`,
    );

    // Publicar evento de datos guardados
    this.eventBus.publish(
      new LeadContactDataSavedEvent({
        visitorId: newData.visitorId,
        companyId: newData.companyId,
        hasEmail: !!newData.email,
        hasTelefono: !!newData.telefono,
        extractedFromChatId: newData.extractedFromChatId,
        savedAt: new Date().toISOString(),
      }),
    );

    await this.promoteVisitorToLeadIfEligible(newData);

    return ok(newData.id);
  }

  /**
   * Promueve a LEAD si hay nombre + (email o teléfono).
   * No falla el guardado de contacto si la promoción no es posible.
   */
  private async promoteVisitorToLeadIfEligible(
    contactData: LeadContactDataPrimitives,
  ): Promise<void> {
    if (!meetsLeadCriteria(contactData)) {
      return;
    }

    try {
      const visitorResult = await this.visitorRepository.findById(
        VisitorId.create(contactData.visitorId),
      );

      if (visitorResult.isErr()) {
        this.logger.warn(
          `No se pudo promover a LEAD: visitor ${contactData.visitorId} no encontrado (${visitorResult.error.message})`,
        );
        return;
      }

      const visitor = visitorResult.unwrap();

      if (!visitor.getLifecycle().isAnon() && !visitor.getLifecycle().isEngaged()) {
        return;
      }

      visitor.convertToLead();
      const aggCtx = this.publisher.mergeObjectContext(visitor);
      const saveResult = await this.visitorRepository.save(aggCtx);

      if (saveResult.isErr()) {
        this.logger.warn(
          `No se pudo guardar promoción a LEAD para visitor ${contactData.visitorId}: ${saveResult.error.message}`,
        );
        return;
      }

      aggCtx.commit();
      this.logger.log(
        `Visitor ${contactData.visitorId} promovido a LEAD (nombre + email/teléfono)`,
      );
    } catch (error) {
      this.logger.warn(
        `Error promoviendo visitor ${contactData.visitorId} a LEAD: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private buildNewLeadContactData(
    input: SaveLeadContactDataCommand['input'],
  ): LeadContactDataPrimitives {
    const now = new Date();
    return {
      id: uuidv4(),
      visitorId: input.visitorId,
      companyId: input.companyId,
      alias: input.alias,
      nombre: input.nombre,
      apellidos: input.apellidos,
      email: input.email,
      telefono: input.telefono,
      dni: input.dni,
      poblacion: input.poblacion,
      additionalData: input.additionalData ?? {},
      extractedFromChatId: input.extractedFromChatId,
      extractedAt: now,
    };
  }
}
