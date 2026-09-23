import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import {
  ICrmSyncService,
  CrmType,
  LeadContactDataPrimitives,
  CrmCompanyConfigPrimitives,
  SyncLeadResult,
  ChatSyncData,
} from '../../../domain/services/crm-sync.service';
import {
  CrmConfigInvalidError,
  LeadSyncFailedError,
  ChatSyncFailedError,
} from '../../../domain/errors/leads.error';
import { LeadcarsApiService } from './leadcars-api.service';
import {
  LeadcarsConfig,
  LeadcarsCreateLeadRequest,
  LeadcarsChatMessage,
} from './leadcars.types';

@Injectable()
export class LeadcarsCrmSyncAdapter implements ICrmSyncService {
  readonly crmType: CrmType = 'leadcars';

  private readonly logger = new Logger(LeadcarsCrmSyncAdapter.name);

  constructor(private readonly apiService: LeadcarsApiService) {}

  /**
   * Sincroniza un lead con LeadCars
   */
  async syncLead(
    contactData: LeadContactDataPrimitives,
    config: CrmCompanyConfigPrimitives,
  ): Promise<Result<SyncLeadResult, DomainError>> {
    this.logger.log(
      `Sincronizando lead para visitor ${contactData.visitorId} con LeadCars`,
    );

    // Validar configuración
    const validationErrors = this.validateConfig(config);
    if (validationErrors.length > 0) {
      return err(
        new CrmConfigInvalidError('leadcars', validationErrors.join('; ')),
      );
    }

    const leadcarsConfig = this.extractLeadcarsConfig(config);

    // Construir request
    const request = this.buildCreateLeadRequest(contactData, leadcarsConfig);

    // Llamar a LeadCars API
    const result = await this.apiService.createLead(request, leadcarsConfig);

    if (result.isErr()) {
      this.logger.error(
        `Error sincronizando lead ${contactData.visitorId}: ${result.error.message}`,
      );
      return err(
        new LeadSyncFailedError(
          contactData.visitorId,
          'leadcars',
          result.error.message,
        ),
      );
    }

    const response = result.unwrap();

    if (!response.success || !response.data) {
      const errorMsg = response.error?.message || 'Respuesta sin datos';
      this.logger.error(`LeadCars rechazó el lead: ${errorMsg}`);
      return err(
        new LeadSyncFailedError(contactData.visitorId, 'leadcars', errorMsg),
      );
    }

    this.logger.log(
      `Lead sincronizado exitosamente: ${response.data.id} (ref: ${response.data.referencia})`,
    );

    return ok({
      externalLeadId: response.data.id.toString(),
      metadata: {
        referencia: response.data.referencia,
        estado: response.data.estado,
        createdAt: response.data.created_at,
      },
    });
  }

  /**
   * Sincroniza una conversación de chat con un lead en LeadCars
   */
  async syncChat(
    externalLeadId: string,
    chatData: ChatSyncData,
    config: CrmCompanyConfigPrimitives,
  ): Promise<Result<void, DomainError>> {
    this.logger.log(
      `Sincronizando chat ${chatData.chatId} con lead ${externalLeadId} en LeadCars`,
    );

    // Validar configuración
    const validationErrors = this.validateConfig(config);
    if (validationErrors.length > 0) {
      return err(
        new CrmConfigInvalidError('leadcars', validationErrors.join('; ')),
      );
    }

    const leadcarsConfig = this.extractLeadcarsConfig(config);
    const leadId = parseInt(externalLeadId, 10);

    if (isNaN(leadId)) {
      return err(
        new ChatSyncFailedError(
          chatData.chatId,
          'leadcars',
          `ID de lead inválido: ${externalLeadId}`,
        ),
      );
    }

    // Convertir mensajes al formato de LeadCars
    const conversacion = this.convertMessagesToLeadcarsFormat(
      chatData.messages,
    );

    // Llamar a LeadCars API
    const result = await this.apiService.addChatConversation(
      leadId,
      {
        conversacion,
        fecha_inicio: chatData.startedAt.toISOString(),
        fecha_fin: chatData.closedAt?.toISOString(),
        resumen: chatData.summary,
        metadata: {
          chatId: chatData.chatId,
          visitorId: chatData.visitorId,
          companyId: chatData.companyId,
        },
      },
      leadcarsConfig,
    );

    if (result.isErr()) {
      this.logger.error(
        `Error sincronizando chat ${chatData.chatId}: ${result.error.message}`,
      );
      return err(
        new ChatSyncFailedError(
          chatData.chatId,
          'leadcars',
          result.error.message,
        ),
      );
    }

    const response = result.unwrap();

    if (!response.success) {
      const errorMsg = response.error?.message || 'Error desconocido';
      this.logger.error(`LeadCars rechazó la conversación: ${errorMsg}`);
      return err(
        new ChatSyncFailedError(chatData.chatId, 'leadcars', errorMsg),
      );
    }

    this.logger.log(
      `Chat ${chatData.chatId} sincronizado exitosamente con lead ${externalLeadId}`,
    );

    return ok(undefined);
  }

  /**
   * Verifica la conexión con LeadCars
   */
  async testConnection(
    config: CrmCompanyConfigPrimitives,
  ): Promise<Result<boolean, DomainError>> {
    this.logger.log('Probando conexión con LeadCars');

    const leadcarsConfig = this.extractLeadcarsConfig(config);
    if (!leadcarsConfig.clienteToken?.trim()) {
      return err(
        new CrmConfigInvalidError('leadcars', 'clienteToken es obligatorio'),
      );
    }

    return this.apiService.testConnection({
      ...leadcarsConfig,
      useSandbox: !!leadcarsConfig.useSandbox,
    });
  }

  /**
   * Valida la configuración de LeadCars
   */
  validateConfig(config: CrmCompanyConfigPrimitives): string[] {
    const errors: string[] = [];
    const leadcarsConfig = config.config as Partial<LeadcarsConfig>;

    if (!leadcarsConfig.clienteToken) {
      errors.push('clienteToken es obligatorio');
    }

    if (
      typeof leadcarsConfig.concesionarioId !== 'number' ||
      leadcarsConfig.concesionarioId <= 0
    ) {
      errors.push(
        'concesionarioId es obligatorio y debe ser un número positivo',
      );
    }

    if (leadcarsConfig.useSandbox === undefined) {
      errors.push('useSandbox es obligatorio');
    }

    // Detectar configs legacy donde tipoLeadDefault era string (antes del check de tipo)

    const rawTipoLead = (leadcarsConfig as any).tipoLeadDefault;
    if (typeof rawTipoLead === 'string') {
      errors.push(
        `tipoLeadDefault tiene valor string "${rawTipoLead}". Debe ser un ID numérico de GET /tipos. Re-configure la integración.`,
      );
    } else if (
      typeof rawTipoLead !== 'number' ||
      !Number.isInteger(rawTipoLead) ||
      rawTipoLead <= 0
    ) {
      errors.push(
        'tipoLeadDefault es obligatorio y debe ser un número entero positivo (ID de GET /tipos)',
      );
    }

    return errors;
  }

  // ============ Métodos privados ============

  private extractLeadcarsConfig(
    config: CrmCompanyConfigPrimitives,
  ): LeadcarsConfig {
    const rawConfig = config.config;

    return {
      clienteToken: rawConfig.clienteToken as string,
      useSandbox: rawConfig.useSandbox as boolean,
      concesionarioId: rawConfig.concesionarioId as number,
      sedeId: rawConfig.sedeId as number | undefined,
      // Compatibilidad: leer campanaCode, campana, o campanaId (legacy, convertir a string)
      campanaCode: (rawConfig.campanaCode ||
        rawConfig.campana ||
        (rawConfig.campanaId != null
          ? `${rawConfig.campanaId as number}`
          : undefined)) as string | undefined,
      tipoLeadDefault: rawConfig.tipoLeadDefault as number,
    };
  }

  private buildCreateLeadRequest(
    contactData: LeadContactDataPrimitives,
    config: LeadcarsConfig,
  ): LeadcarsCreateLeadRequest {
    const request: LeadcarsCreateLeadRequest = {
      nombre: contactData.nombre || 'Visitante',
      concesionario: config.concesionarioId,
      tipo_lead: config.tipoLeadDefault,
      comentario: `Lead generado automáticamente desde chat de Guiders (visitor: ${contactData.visitorId})`,
    };

    // Campos opcionales de contacto
    if (contactData.apellidos) {
      request.apellidos = contactData.apellidos;
    }

    if (contactData.email) {
      request.email = contactData.email;
    }

    if (contactData.telefono) {
      request.telefono = contactData.telefono;
    }

    // Mapear poblacion → provincia (nombre correcto en API v2.4)
    if (contactData.poblacion) {
      request.provincia = contactData.poblacion;
    }

    if (config.sedeId) {
      request.sede = config.sedeId;
    }

    // campanaCode es texto (antes campanaId era número)
    if (config.campanaCode) {
      request.campana = config.campanaCode;
    }

    // Campos de identificación de Guiders dentro del objeto custom (API v2.5)
    const customFields: Record<string, unknown> = {
      guiders_visitor_id: contactData.visitorId,
      guiders_company_id: contactData.companyId,
    };

    if (contactData.additionalData) {
      // Filtrar keys que colisionarían con campos conocidos del request
      // y keys peligrosas para evitar prototype pollution
      const protectedKeys = new Set([
        'nombre',
        'apellidos',
        'email',
        'telefono',
        'movil',
        'cp',
        'provincia',
        'comentario',
        'url_origen',
        'concesionario',
        'sede',
        'tipo_lead',
        'campana',
        'guiders_visitor_id',
        'guiders_company_id',
        '__proto__',
        'constructor',
        'prototype',
      ]);

      for (const [key, value] of Object.entries(contactData.additionalData)) {
        if (!protectedKeys.has(key)) {
          customFields[key] = value;
        } else {
          this.logger.warn(
            `additionalData contiene key protegida '${key}', ignorada para evitar sobreescritura`,
          );
        }
      }
    }

    request.custom = customFields;

    return request;
  }

  private convertMessagesToLeadcarsFormat(
    messages: ChatSyncData['messages'],
  ): LeadcarsChatMessage[] {
    return messages.map((msg) => ({
      emisor: this.mapSenderTypeToLeadcars(msg.senderType),
      mensaje: msg.content,
      fecha: msg.sentAt.toISOString(),
      metadata: msg.metadata,
    }));
  }

  private mapSenderTypeToLeadcars(
    senderType: 'visitor' | 'commercial' | 'bot' | 'system',
  ): 'VISITANTE' | 'COMERCIAL' | 'BOT' {
    switch (senderType) {
      case 'visitor':
        return 'VISITANTE';
      case 'commercial':
        return 'COMERCIAL';
      case 'bot':
      case 'system':
        return 'BOT';
      default:
        return 'VISITANTE';
    }
  }
}
