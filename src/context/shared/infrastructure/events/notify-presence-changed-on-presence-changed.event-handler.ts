import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Inject, Logger, Optional } from '@nestjs/common';
import { PresenceChangedEvent } from '../../domain/events/presence-changed.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import {
  IChatRepository,
  CHAT_V2_REPOSITORY,
} from 'src/context/conversations-v2/domain/chat.repository';
import { VisitorId } from 'src/context/conversations-v2/domain/value-objects/visitor-id';
import { CommercialId } from 'src/context/conversations-v2/domain/value-objects/commercial-id';
import { ChatStatusEnum } from 'src/context/conversations-v2/domain/value-objects/chat-status';

/**
 * Event handler que notifica vía WebSocket cuando cambia el estado de presencia de un usuario
 *
 * Flujo optimizado:
 * 1. Escucha el evento PresenceChangedEvent
 * 2. Obtiene los datos del cambio de estado
 * 3. Si es visitante:
 *    - Consulta chats activos del visitante
 *    - Emite notificación solo a comerciales asignados a esos chats
 * 4. Si es comercial:
 *    - Consulta chats activos del comercial
 *    - Emite notificación solo a visitantes en esos chats
 * 5. Siempre emite a la sala del propio usuario para actualizaciones de estado
 */
@EventsHandler(PresenceChangedEvent)
export class NotifyPresenceChangedOnPresenceChangedEventHandler
  implements IEventHandler<PresenceChangedEvent>
{
  private readonly logger = new Logger(
    NotifyPresenceChangedOnPresenceChangedEventHandler.name,
  );

  constructor(
    @Optional()
    @Inject('WEBSOCKET_GATEWAY')
    private readonly websocketGateway: WebSocketGatewayBasic,
    @Optional()
    @Inject(CHAT_V2_REPOSITORY)
    private readonly chatRepository: IChatRepository,
  ) {}

  async handle(event: PresenceChangedEvent): Promise<void> {
    this.logger.log(
      `🔔 [PresenceChangedEvent RECIBIDO] usuario: ${event.getUserId()} | tipo: ${event.getUserType()} | ${event.getPreviousStatus()} → ${event.getNewStatus()} | tenant: ${event.getTenantId()}`,
    );

    // Si no hay websocketGateway disponible (ej: en tests), simplemente retornar
    if (!this.websocketGateway) {
      this.logger.warn(
        '⚠️ WebSocket gateway NO disponible, omitiendo notificación',
      );
      return;
    }

    try {
      const userId = event.getUserId();
      const userType = event.getUserType();
      const newStatus = event.getNewStatus();
      const previousStatus = event.getPreviousStatus();
      const timestamp = new Date().toISOString();

      // Payload común para las notificaciones
      const payload = {
        userId,
        userType,
        status: newStatus,
        previousStatus,
        timestamp,
        tenantId: event.getTenantId(), // Necesario para emitir a sala del tenant
      };

      // Siempre emitir a sala específica del usuario (para auto-actualización)
      const userRoom = `${userType}:${userId}`;
      this.logger.debug(
        `Emitiendo presence:changed a sala de usuario: ${userRoom} - Estado: ${previousStatus} → ${newStatus}`,
      );
      this.websocketGateway.emitToRoom(userRoom, 'presence:changed', payload);

      // Si es visitante, notificar a comerciales con chats activos
      if (userType === 'visitor') {
        await this.notifyCommercialsWithActiveChats(userId, payload);
      }

      // Si es comercial, notificar a visitantes con chats asignados
      // + emitir a la room del tenant (chats PENDING / widget sin asignación)
      if (userType === 'commercial') {
        await this.notifyVisitorsWithActiveChats(userId, payload);
        this.emitCommercialPresenceToTenant(payload);
      }

      this.logger.debug(
        `Notificación de cambio de presencia procesada para usuario: ${userId}`,
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al notificar cambio de presencia: ${errorObj.message}`,
        errorObj.stack,
      );
      // No lanzamos el error para no afectar el flujo principal
    }
  }

  /**
   * Notifica el cambio de presencia de un visitante solo a comerciales
   * que tienen chats activos con ese visitante
   *
   * Estrategia de emisión dual:
   * 1. Evento GRANULAR a cada sala chat:{chatId} con chatId específico
   * 2. Evento GLOBAL a commercial:{commercialId} con affectedChatIds[] para compatibilidad
   */
  private async notifyCommercialsWithActiveChats(
    visitorId: string,
    payload: any,
  ): Promise<void> {
    // Si no hay chatRepository, no podemos filtrar (ej: en tests sin mock)
    if (!this.chatRepository) {
      this.logger.debug(
        'Chat repository no disponible, omitiendo notificación a comerciales',
      );
      return;
    }

    try {
      // Crear value object para la consulta
      const visitorIdVO = VisitorId.create(visitorId);

      // Consultar chats activos del visitante
      // Estados activos: PENDING, ASSIGNED, ACTIVE, TRANSFERRED
      const activeStatuses = [
        ChatStatusEnum.PENDING,
        ChatStatusEnum.ASSIGNED,
        ChatStatusEnum.ACTIVE,
        ChatStatusEnum.TRANSFERRED,
      ].map((status) => ({ value: status }));

      const chatsResult = await this.chatRepository.findByVisitorId(
        visitorIdVO,
        activeStatuses as any,
      );

      if (chatsResult.isErr()) {
        this.logger.error(
          `Error al consultar chats activos del visitante ${visitorId}: ${chatsResult.error.message}`,
        );
        return;
      }

      const activeChats = chatsResult.unwrap();

      // SOLUCIÓN: Buscar también chats cerrados recientemente (últimas 24 horas)
      // para notificar a comerciales que tuvieron interacción con el visitante
      if (activeChats.length === 0) {
        this.logger.log(
          `📢 Visitante ${visitorId} sin chats activos → Buscando chats cerrados recientemente para notificar`,
        );

        // Buscar chats cerrados en las últimas 24 horas
        const closedStatuses = [
          ChatStatusEnum.CLOSED,
          ChatStatusEnum.ABANDONED,
        ].map((status) => ({ value: status }));

        const recentChatsResult = await this.chatRepository.findByVisitorId(
          visitorIdVO,
          closedStatuses as any,
        );

        if (recentChatsResult.isOk()) {
          const recentChats = recentChatsResult.unwrap();

          // Filtrar solo chats cerrados en las últimas 24 horas
          const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
          const recentClosedChats = recentChats.filter((chat) => {
            const chatPrimitives = chat.toPrimitives();
            if (chatPrimitives.closedAt) {
              const closedTime = new Date(chatPrimitives.closedAt).getTime();
              return closedTime > twentyFourHoursAgo;
            }
            return false;
          });

          if (recentClosedChats.length > 0) {
            this.logger.log(
              `✅ Encontrados ${recentClosedChats.length} chat(s) cerrado(s) recientemente para visitante ${visitorId}`,
            );

            // Emitir eventos para chats cerrados recientemente (con emisión dual)
            this.emitPresenceToChatsWithDualStrategy(
              recentClosedChats,
              visitorId,
              payload,
              'commercial',
            );
            return;
          }
        }

        this.logger.warn(
          `⚠️ Visitante ${visitorId} cambió a ${payload.status} sin chats activos ni chats cerrados recientemente, no se notifica a ningún comercial`,
        );
        return;
      }

      // Verificar si hay comerciales asignados
      const hasAssignedCommercials = activeChats.some((chat) => {
        const primitives = chat.toPrimitives();
        return !!primitives.assignedCommercialId;
      });

      if (!hasAssignedCommercials) {
        this.logger.warn(
          `⚠️ Visitante ${visitorId} cambió a ${payload.status} con ${activeChats.length} chat(s) activo(s) pero SIN comerciales asignados, no se notifica`,
        );
        return;
      }

      // Emitir eventos con estrategia dual
      this.emitPresenceToChatsWithDualStrategy(
        activeChats,
        visitorId,
        payload,
        'commercial',
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al notificar a comerciales sobre visitante ${visitorId}: ${errorObj.message}`,
        errorObj.stack,
      );
      // No lanzamos el error para no afectar el flujo principal
    }
  }

  /**
   * Emite eventos de presencia con estrategia dual:
   * 1. Evento GRANULAR a cada sala chat:{chatId}
   * 2. Evento GLOBAL a {targetType}:{targetId} con affectedChatIds[]
   *
   * @param chats Lista de chats a notificar
   * @param sourceUserId ID del usuario que cambió de estado
   * @param payload Payload base del evento
   * @param targetType Tipo de usuario destino ('commercial' o 'visitor')
   */
  private emitPresenceToChatsWithDualStrategy(
    chats: any[],
    sourceUserId: string,
    payload: any,
    targetType: 'commercial' | 'visitor',
  ): void {
    const targetIdField =
      targetType === 'commercial' ? 'assignedCommercialId' : 'visitorId';

    // PASO 1: Emitir evento GRANULAR a cada sala de chat
    chats.forEach((chat) => {
      const primitives = chat.toPrimitives();
      const targetId = primitives[targetIdField];

      // Solo emitir si hay un destinatario válido
      if (targetId) {
        const chatRoom = `chat:${primitives.id}`;
        const chatPayload = { ...payload, chatId: primitives.id };

        this.websocketGateway.emitToRoom(
          chatRoom,
          'presence:changed',
          chatPayload,
        );
        this.logger.debug(
          `📤 Granular → ${chatRoom} | ${payload.userType} ${sourceUserId} → ${payload.status}`,
        );
      }
    });

    // PASO 2: Agrupar destinatarios con sus chatIds afectados
    const targetChatMap = new Map<string, string[]>();
    chats.forEach((chat) => {
      const primitives = chat.toPrimitives();
      const targetId = primitives[targetIdField];

      if (targetId) {
        const existingChats = targetChatMap.get(targetId) || [];
        existingChats.push(primitives.id);
        targetChatMap.set(targetId, existingChats);
      }
    });

    // PASO 3: Emitir evento GLOBAL a cada destinatario con affectedChatIds
    this.logger.log(
      `✅ Emitiendo presence:changed de ${payload.userType} ${sourceUserId} (${payload.previousStatus} → ${payload.status}) a ${targetChatMap.size} ${targetType}(es)`,
    );

    targetChatMap.forEach((chatIds, targetId) => {
      const targetRoom = `${targetType}:${targetId}`;
      const enrichedPayload = { ...payload, affectedChatIds: chatIds };

      this.logger.log(
        `📤 Global → ${targetRoom} | ${payload.userType} ${sourceUserId} → ${payload.status} | chats: [${chatIds.join(', ')}]`,
      );
      this.websocketGateway.emitToRoom(
        targetRoom,
        'presence:changed',
        enrichedPayload,
      );
    });

    this.logger.debug(
      `Notificaciones enviadas: ${chats.length} granulares + ${targetChatMap.size} globales`,
    );
  }

  /**
   * Emite presence:changed a tenant:{companyId} para que el SDK (chats PENDING
   * o abiertos sin assignedCommercialId) actualice el indicador del agente.
   */
  private emitCommercialPresenceToTenant(payload: {
    userId: string;
    userType: string;
    status: string;
    previousStatus: string;
    timestamp: string;
    tenantId?: string;
  }): void {
    const tenantId = payload.tenantId;
    if (!tenantId || !this.websocketGateway) {
      return;
    }

    const tenantRoom = `tenant:${tenantId}`;
    this.websocketGateway.emitToRoom(tenantRoom, 'presence:changed', payload);
    this.logger.log(
      `📤 Tenant → ${tenantRoom} | comercial ${payload.userId} → ${payload.status}`,
    );
  }

  /**
   * Notifica el cambio de presencia de un comercial solo a visitantes
   * que tienen chats activos con ese comercial
   *
   * Estrategia de emisión dual:
   * 1. Evento GRANULAR a cada sala chat:{chatId} con chatId específico
   * 2. Evento GLOBAL a visitor:{visitorId} con affectedChatIds[] para compatibilidad
   */
  private async notifyVisitorsWithActiveChats(
    commercialId: string,
    payload: any,
  ): Promise<void> {
    // Si no hay chatRepository, no podemos filtrar (ej: en tests sin mock)
    if (!this.chatRepository) {
      this.logger.debug(
        'Chat repository no disponible, omitiendo notificación a visitantes',
      );
      return;
    }

    try {
      // Crear value object para la consulta
      const commercialIdVO = CommercialId.create(commercialId);

      // Consultar chats activos del comercial usando findByCommercialId
      const chatsResult = await this.chatRepository.findByCommercialId(
        commercialIdVO,
        {
          status: [
            ChatStatusEnum.PENDING,
            ChatStatusEnum.ASSIGNED,
            ChatStatusEnum.ACTIVE,
            ChatStatusEnum.TRANSFERRED,
          ],
        },
      );

      if (chatsResult.isErr()) {
        this.logger.error(
          `Error al consultar chats activos del comercial ${commercialId}: ${chatsResult.error.message}`,
        );
        return;
      }

      const searchResult = chatsResult.unwrap();
      const activeChats = searchResult.chats;

      if (activeChats.length === 0) {
        this.logger.debug(
          `Comercial ${commercialId} no tiene chats activos, no se notifica a ningún visitante`,
        );
        return;
      }

      // PASO 1: Emitir evento GRANULAR a cada sala de chat
      activeChats.forEach((chat) => {
        const primitives = chat.toPrimitives();
        const chatRoom = `chat:${primitives.id}`;
        const chatPayload = { ...payload, chatId: primitives.id };

        this.websocketGateway.emitToRoom(
          chatRoom,
          'presence:changed',
          chatPayload,
        );
        this.logger.debug(
          `📤 Granular → ${chatRoom} | comercial ${commercialId} → ${payload.status}`,
        );
      });

      // PASO 2: Agrupar visitantes con sus chatIds afectados
      const visitorChatMap = new Map<string, string[]>();
      activeChats.forEach((chat) => {
        const primitives = chat.toPrimitives();
        const existingChats = visitorChatMap.get(primitives.visitorId) || [];
        existingChats.push(primitives.id);
        visitorChatMap.set(primitives.visitorId, existingChats);
      });

      // PASO 3: Emitir evento GLOBAL a cada visitante con affectedChatIds
      this.logger.debug(
        `Emitiendo presence:changed de comercial ${commercialId} a ${visitorChatMap.size} visitante(s) con chats activos`,
      );

      visitorChatMap.forEach((chatIds, visitorId) => {
        const visitorRoom = `visitor:${visitorId}`;
        const enrichedPayload = { ...payload, affectedChatIds: chatIds };

        this.logger.debug(
          `📤 Global → ${visitorRoom} | comercial ${commercialId} → ${payload.status} | chats: [${chatIds.join(', ')}]`,
        );
        this.websocketGateway.emitToRoom(
          visitorRoom,
          'presence:changed',
          enrichedPayload,
        );
      });

      this.logger.debug(
        `Notificaciones enviadas: ${activeChats.length} granulares + ${visitorChatMap.size} globales para comercial ${commercialId}`,
      );
    } catch (error) {
      const errorObj = error as Error;
      this.logger.error(
        `Error al notificar a visitantes sobre comercial ${commercialId}: ${errorObj.message}`,
        errorObj.stack,
      );
      // No lanzamos el error para no afectar el flujo principal
    }
  }
}
