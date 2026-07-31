import { Inject, Logger, Optional } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EventBus, CommandBus } from '@nestjs/cqrs';
import { ChangeVisitorConnectionStatusCommand } from '../context/visitors-v2/application/commands/change-visitor-connection-status.command';
import { UpdateVisitorSessionActivityCommand } from '../context/visitors-v2/application/commands/update-visitor-session-activity.command';
import { TokenVerifyService } from '../context/shared/infrastructure/token-verify.service';
import {
  VISITOR_CONNECTION_DOMAIN_SERVICE,
  VisitorConnectionDomainService,
} from '../context/visitors-v2/domain/visitor-connection.domain-service';
import {
  COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
  CommercialConnectionDomainService,
} from '../context/commercial/domain/commercial-connection.domain-service';
import { VisitorId } from '../context/visitors-v2/domain/value-objects/visitor-id';
import { CommercialId } from '../context/commercial/domain/value-objects/commercial-id';
import {
  VisitorConnectionVO,
  ConnectionStatus,
} from '../context/visitors-v2/domain/value-objects/visitor-connection';
import { CommercialConnectionStatus } from '../context/commercial/domain/value-objects/commercial-connection-status';
import { VisitorLastActivity } from '../context/visitors-v2/domain/value-objects/visitor-last-activity';
import { CommercialLastActivity } from '../context/commercial/domain/value-objects/commercial-last-activity';
import { PresenceChangedEvent } from '../context/shared/domain/events/presence-changed.event';

interface TestMessage {
  message: string;
  timestamp: number;
}

interface JoinChatRoomPayload {
  chatId: string;
  token?: string; // JWT token (opcional)
  sessionId?: string; // Session ID de visitante (opcional)
}

interface LeaveChatRoomPayload {
  chatId: string;
}

interface JoinVisitorRoomPayload {
  visitorId: string;
  token?: string; // JWT token (opcional)
  sessionId?: string; // Session ID de visitante (opcional)
}

interface LeaveVisitorRoomPayload {
  visitorId: string;
}

interface JoinTenantRoomPayload {
  tenantId: string;
  token?: string; // JWT token (opcional)
}

interface LeaveTenantRoomPayload {
  tenantId: string;
}

interface JoinPresenceRoomPayload {
  userId: string;
  userType: 'commercial' | 'visitor';
}

interface LeavePresenceRoomPayload {
  userId: string;
  userType: 'commercial' | 'visitor';
}

interface TypingPayload {
  chatId: string;
  userId: string;
  userType: 'commercial' | 'visitor';
}

/**
 * WebSocket Gateway para comunicación bidireccional en tiempo real
 * Soporta:
 * - Autenticación dual (JWT Bearer token y cookies de sesión)
 * - Salas de chat para comunicación entre visitantes y comerciales
 * - Salas de visitantes para notificaciones proactivas
 * - Salas de presencia individual (commercial:id y visitor:id) para eventos filtrados
 * - Salas de tenant para notificaciones empresariales (deprecated para presencia)
 * - Notificaciones de mensajes nuevos en tiempo real
 * - Separación de mensajes internos (solo comerciales)
 * - Auto-join a salas personales durante autenticación
 */
@WebSocketGateway({
  cors: {
    origin: true, // Permite cualquier origen de forma dinámica (necesario con credentials: true)
    methods: ['GET', 'POST'],
    credentials: true,
  },
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  // Configuración backend-controlled para detección de presencia
  pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10), // Ping cada 25s
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '20000', 10), // Timeout 20s sin respuesta
})
export class WebSocketGatewayBasic
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() server: Server;
  private logger = new Logger('WebSocketGateway');

  // Mapa para trackear qué usuarios están en qué salas
  private clientRooms = new Map<string, Set<string>>();
  // Mapa para guardar info del usuario autenticado
  private clientUsers = new Map<
    string,
    {
      userId: string;
      roles: string[];
      chatIds: string[];
      tenantId?: string;
      companyId?: string;
    }
  >();

  constructor(
    @Optional() private readonly tokenVerifyService?: TokenVerifyService,
    @Optional()
    @Inject(VISITOR_CONNECTION_DOMAIN_SERVICE)
    private readonly visitorConnectionService?: VisitorConnectionDomainService,
    @Optional()
    @Inject(COMMERCIAL_CONNECTION_DOMAIN_SERVICE)
    private readonly commercialConnectionService?: CommercialConnectionDomainService,
    @Optional() private readonly eventBus?: EventBus,
    @Optional() private readonly commandBus?: CommandBus,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway inicializado');
    this.logger.log(
      `Configuración: path=/socket.io/, transports=[websocket, polling]`,
    );
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
    this.logger.log(`Transport usado: ${client.conn.transport.name}`);

    // Inicializar tracking de este cliente
    this.clientRooms.set(client.id, new Set());

    // Enviar mensaje de bienvenida
    client.emit('welcome', {
      message: 'Conectado exitosamente al servidor WebSocket',
      clientId: client.id,
      timestamp: Date.now(),
    });

    // Intentar autenticar desde handshake (async)
    await this.authenticateClient(client);

    // Visitantes: online al conectar WS.
    // Comerciales: presencia MANUAL (Console toggle) — no auto-online aquí.
    const user = this.clientUsers.get(client.id);
    if (user) {
      const isVisitor = user.roles.includes('visitor');

      try {
        if (isVisitor && this.visitorConnectionService) {
          await this.markVisitorOnline(user.userId, user.companyId);
        }
      } catch (error) {
        this.logger.error(
          `Error al marcar usuario ${user.userId} como online:`,
          (error as Error).message,
        );
      }
    }
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);

    // Obtener info del usuario antes de limpiar
    const user = this.clientUsers.get(client.id);

    // Marcar como OFFLINE si el usuario estaba autenticado
    if (user) {
      const isVisitor = user.roles.includes('visitor');
      const isCommercial =
        user.roles.includes('commercial') ||
        user.roles.includes('admin') ||
        user.roles.includes('owner');

      try {
        if (isVisitor && this.visitorConnectionService) {
          await this.markVisitorOffline(user.userId, user.companyId);
        } else if (isCommercial && this.commercialConnectionService) {
          await this.markCommercialOffline(user.userId, user.companyId);
        }
      } catch (error) {
        this.logger.error(
          `Error al marcar usuario ${user.userId} como offline:`,
          (error as Error).message,
        );
      }
    }

    // Limpiar tracking del cliente
    const rooms = this.clientRooms.get(client.id);
    if (rooms) {
      rooms.forEach((room) => {
        void client.leave(room);
        this.logger.log(`Cliente ${client.id} eliminado de sala: ${room}`);
      });
      this.clientRooms.delete(client.id);
    }

    // Limpiar info de usuario
    this.clientUsers.delete(client.id);
  }

  /**
   * Intenta autenticar al cliente desde el handshake
   * Soporta JWT Bearer token y cookies de sesión
   * Si es un comercial, lo une automáticamente a su sala de tenant
   */
  private async authenticateClient(client: Socket): Promise<void> {
    try {
      let token =
        (client.handshake.auth.token as string) ||
        (client.handshake.headers.authorization as string);

      // Extraer token si viene con prefijo "Bearer "
      if (token && token.startsWith('Bearer ')) {
        token = token.substring(7);
      }

      if (!token) {
        // Intentar autenticación de visitante via visitorId + tenantId
        const visitorId = client.handshake.auth.visitorId as string;
        const tenantId = client.handshake.auth.tenantId as string;

        if (visitorId && tenantId) {
          this.logger.log(
            `Cliente ${client.id} autenticado como visitante: visitorId=${visitorId}, tenantId=${tenantId}`,
          );

          // Guardar información del visitante
          this.clientUsers.set(client.id, {
            userId: visitorId,
            roles: ['visitor'],
            chatIds: [],
            companyId: tenantId,
            tenantId: tenantId,
          });

          // Auto-join a sala personal de presencia
          const presenceRoom = `visitor:${visitorId}`;
          await client.join(presenceRoom);

          const presenceRooms = this.clientRooms.get(client.id) || new Set();
          presenceRooms.add(presenceRoom);
          this.clientRooms.set(client.id, presenceRooms);

          this.logger.log(
            `Visitante ${visitorId} unido automáticamente a sala de presencia: ${presenceRoom}`,
          );

          client.emit('presence:joined', {
            userId: visitorId,
            userType: 'visitor',
            roomName: presenceRoom,
            timestamp: Date.now(),
            automatic: true,
          });

          return;
        }

        this.logger.debug(
          `Cliente ${client.id} conectado sin token ni credenciales de visitante`,
        );
        return;
      }

      // Verificar y decodificar el token si hay servicio disponible
      if (!this.tokenVerifyService) {
        this.logger.debug(
          `TokenVerifyService no disponible, omitiendo autenticación`,
        );
        return;
      }

      try {
        const payload = await this.tokenVerifyService.verifyToken(token);

        this.logger.log(
          `Cliente ${client.id} autenticado: userId=${payload.sub}, roles=${payload.role.join(',')}`,
        );

        // Guardar información del usuario
        this.clientUsers.set(client.id, {
          userId: payload.sub,
          roles: payload.role,
          chatIds: [],
          companyId: payload.companyId,
          tenantId: payload.companyId, // El companyId es el tenantId
        });

        // Si es un comercial y tiene tenantId, unirlo automáticamente a la sala de tenant
        const isCommercial =
          payload.role.includes('commercial') ||
          payload.role.includes('admin') ||
          payload.role.includes('owner');

        if (isCommercial && payload.companyId) {
          const tenantRoom = `tenant:${payload.companyId}`;
          await client.join(tenantRoom);

          // Trackear la sala
          const rooms = this.clientRooms.get(client.id) || new Set();
          rooms.add(tenantRoom);
          this.clientRooms.set(client.id, rooms);

          this.logger.log(
            `Comercial ${client.id} unido automáticamente a sala de tenant: ${tenantRoom}`,
          );

          // Notificar al cliente que fue unido a la sala
          client.emit('tenant:joined', {
            companyId: payload.companyId,
            roomName: tenantRoom,
            timestamp: Date.now(),
            automatic: true,
          });
        }

        // Auto-join a sala personal de presencia (comerciales y visitantes)
        const userType = isCommercial ? 'commercial' : 'visitor';
        const presenceRoom = `${userType}:${payload.sub}`;

        await client.join(presenceRoom);

        // Trackear la sala de presencia
        const presenceRooms = this.clientRooms.get(client.id) || new Set();
        presenceRooms.add(presenceRoom);
        this.clientRooms.set(client.id, presenceRooms);

        this.logger.log(
          `Usuario ${payload.sub} (${userType}) unido automáticamente a sala de presencia: ${presenceRoom}`,
        );

        // Notificar al cliente que fue unido a la sala de presencia
        client.emit('presence:joined', {
          userId: payload.sub,
          userType,
          roomName: presenceRoom,
          timestamp: Date.now(),
          automatic: true,
        });
      } catch (error) {
        this.logger.warn(
          `Token inválido o expirado para cliente ${client.id}: ${(error as Error).message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error al autenticar cliente ${client.id}:`,
        (error as Error).message,
      );
    }
  }

  /**
   * Listener para unirse a una sala de chat
   * Permite a visitantes y comerciales recibir notificaciones del chat
   */
  @SubscribeMessage('chat:join')
  async handleJoinChatRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinChatRoomPayload,
  ) {
    try {
      const { chatId } = data;

      if (!chatId) {
        client.emit('error', {
          message: 'chatId es requerido',
          timestamp: Date.now(),
        });
        return { success: false, message: 'chatId es requerido' };
      }

      // Construir nombre de la sala
      const roomName = `chat:${chatId}`;

      // Unir el cliente a la sala
      await client.join(roomName);

      // Trackear la sala
      const rooms = this.clientRooms.get(client.id) || new Set();
      rooms.add(roomName);
      this.clientRooms.set(client.id, rooms);

      this.logger.log(
        `Cliente ${client.id} se unió a la sala de chat: ${roomName}`,
      );

      // Notificar éxito
      client.emit('chat:joined', {
        chatId,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Unido a la sala de chat exitosamente',
        chatId,
        roomName,
      };
    } catch (error) {
      this.logger.error(
        `Error al unir cliente a sala de chat:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al unirse a la sala de chat',
      };
    }
  }

  /**
   * Listener para salir de una sala de chat
   */
  @SubscribeMessage('chat:leave')
  async handleLeaveChatRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeaveChatRoomPayload,
  ) {
    try {
      const { chatId } = data;

      if (!chatId) {
        return { success: false, message: 'chatId es requerido' };
      }

      const roomName = `chat:${chatId}`;

      // Salir de la sala
      await client.leave(roomName);

      // Actualizar tracking
      const rooms = this.clientRooms.get(client.id);
      if (rooms) {
        rooms.delete(roomName);
      }

      this.logger.log(
        `Cliente ${client.id} salió de la sala de chat: ${roomName}`,
      );

      // Notificar éxito
      client.emit('chat:left', {
        chatId,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Salió de la sala de chat exitosamente',
        chatId,
      };
    } catch (error) {
      this.logger.error(
        `Error al salir de sala de chat:`,
        (error as Error).message,
      );
      return { success: false, message: 'Error al salir de la sala de chat' };
    }
  }

  /**
   * Listener para unirse a una sala de visitante
   * Permite a los visitantes recibir notificaciones proactivas cuando un comercial crea un chat para ellos
   */
  @SubscribeMessage('visitor:join')
  async handleJoinVisitorRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinVisitorRoomPayload,
  ) {
    try {
      const { visitorId } = data;

      if (!visitorId) {
        client.emit('error', {
          message: 'visitorId es requerido',
          timestamp: Date.now(),
        });
        return { success: false, message: 'visitorId es requerido' };
      }

      // Construir nombre de la sala del visitante
      const roomName = `visitor:${visitorId}`;

      // Unir el cliente a la sala
      await client.join(roomName);

      // Trackear la sala
      const rooms = this.clientRooms.get(client.id) || new Set();
      rooms.add(roomName);
      this.clientRooms.set(client.id, rooms);

      this.logger.log(
        `Cliente ${client.id} se unió a la sala de visitante: ${roomName}`,
      );

      // Notificar éxito
      client.emit('visitor:joined', {
        visitorId,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Unido a la sala de visitante exitosamente',
        visitorId,
        roomName,
      };
    } catch (error) {
      this.logger.error(
        `Error al unir cliente a sala de visitante:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al unirse a la sala de visitante',
      };
    }
  }

  /**
   * Listener para salir de una sala de visitante
   */
  @SubscribeMessage('visitor:leave')
  async handleLeaveVisitorRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeaveVisitorRoomPayload,
  ) {
    try {
      const { visitorId } = data;

      if (!visitorId) {
        return { success: false, message: 'visitorId es requerido' };
      }

      const roomName = `visitor:${visitorId}`;

      // Salir de la sala
      await client.leave(roomName);

      // Actualizar tracking
      const rooms = this.clientRooms.get(client.id);
      if (rooms) {
        rooms.delete(roomName);
      }

      this.logger.log(
        `Cliente ${client.id} salió de la sala de visitante: ${roomName}`,
      );

      // Notificar éxito
      client.emit('visitor:left', {
        visitorId,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Salió de la sala de visitante exitosamente',
        visitorId,
      };
    } catch (error) {
      this.logger.error(
        `Error al salir de sala de visitante:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al salir de la sala de visitante',
      };
    }
  }

  /**
   * Listener para unirse a una sala de tenant
   * Permite a los comerciales recibir notificaciones de presencia de todos los visitantes de su empresa
   */
  @SubscribeMessage('tenant:join')
  async handleJoinTenantRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinTenantRoomPayload,
  ) {
    try {
      const { tenantId } = data;

      if (!tenantId) {
        client.emit('error', {
          message: 'tenantId es requerido',
          timestamp: Date.now(),
        });
        return { success: false, message: 'tenantId es requerido' };
      }

      // Validar que el comercial autenticado solo pueda unirse a su propio tenant
      const authenticatedUser = this.clientUsers.get(client.id);
      if (authenticatedUser?.roles?.includes('commercial')) {
        const userTenant =
          authenticatedUser.tenantId ?? authenticatedUser.companyId;
        if (userTenant && userTenant !== tenantId) {
          this.logger.warn(
            `Intento de tenant-hopping bloqueado: comercial ${authenticatedUser.userId} intentó unirse a tenant ${tenantId} (propio: ${userTenant})`,
          );
          client.emit('error', {
            message: 'No autorizado para unirse a este tenant',
            timestamp: Date.now(),
          });
          return {
            success: false,
            message: 'No autorizado para unirse a este tenant',
          };
        }
      }

      // Construir nombre de la sala del tenant
      const roomName = `tenant:${tenantId}`;

      // Unir el cliente a la sala
      await client.join(roomName);

      // Trackear la sala
      const rooms = this.clientRooms.get(client.id) || new Set();
      rooms.add(roomName);
      this.clientRooms.set(client.id, rooms);

      this.logger.log(
        `Cliente ${client.id} se unió a la sala de tenant: ${roomName}`,
      );

      // Notificar éxito
      client.emit('tenant:joined', {
        companyId: tenantId,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Unido a la sala de tenant exitosamente',
        companyId: tenantId,
        roomName,
      };
    } catch (error) {
      this.logger.error(
        `Error al unir cliente a sala de tenant:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al unirse a la sala de tenant',
      };
    }
  }

  /**
   * Listener para salir de una sala de tenant
   */
  @SubscribeMessage('tenant:leave')
  async handleLeaveTenantRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeaveTenantRoomPayload,
  ) {
    try {
      const { tenantId } = data;

      if (!tenantId) {
        return { success: false, message: 'tenantId es requerido' };
      }

      const roomName = `tenant:${tenantId}`;

      // Salir de la sala
      await client.leave(roomName);

      // Actualizar tracking
      const rooms = this.clientRooms.get(client.id);
      if (rooms) {
        rooms.delete(roomName);
      }

      this.logger.log(
        `Cliente ${client.id} salió de la sala de tenant: ${roomName}`,
      );

      // Notificar éxito
      client.emit('tenant:left', {
        tenantId,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Salió de la sala de tenant exitosamente',
        tenantId,
      };
    } catch (error) {
      this.logger.error(
        `Error al salir de sala de tenant:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al salir de la sala de tenant',
      };
    }
  }

  /**
   * Listener para unirse a una sala de presencia individual
   * Permite a visitantes y comerciales recibir notificaciones de presencia
   * basadas en sus chats activos
   */
  @SubscribeMessage('presence:join')
  async handleJoinPresenceRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinPresenceRoomPayload,
  ) {
    try {
      const { userId, userType } = data;

      if (!userId || !userType) {
        client.emit('error', {
          message: 'userId y userType son requeridos',
          timestamp: Date.now(),
        });
        return {
          success: false,
          message: 'userId y userType son requeridos',
        };
      }

      // Validar userType
      if (userType !== 'commercial' && userType !== 'visitor') {
        client.emit('error', {
          message: 'userType debe ser "commercial" o "visitor"',
          timestamp: Date.now(),
        });
        return {
          success: false,
          message: 'userType inválido',
        };
      }

      // Construir nombre de la sala de presencia
      const roomName = `${userType}:${userId}`;

      // Unir el cliente a la sala
      await client.join(roomName);

      // Trackear la sala
      const rooms = this.clientRooms.get(client.id) || new Set();
      rooms.add(roomName);
      this.clientRooms.set(client.id, rooms);

      this.logger.log(
        `Cliente ${client.id} se unió a sala de presencia: ${roomName}`,
      );

      // Notificar éxito
      client.emit('presence:joined', {
        userId,
        userType,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Unido a sala de presencia exitosamente',
        userId,
        userType,
        roomName,
      };
    } catch (error) {
      this.logger.error(
        `Error al unir cliente a sala de presencia:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al unirse a la sala de presencia',
      };
    }
  }

  /**
   * Listener para salir de una sala de presencia individual
   */
  @SubscribeMessage('presence:leave')
  async handleLeavePresenceRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeavePresenceRoomPayload,
  ) {
    try {
      const { userId, userType } = data;

      if (!userId || !userType) {
        return {
          success: false,
          message: 'userId y userType son requeridos',
        };
      }

      const roomName = `${userType}:${userId}`;

      // Salir de la sala
      await client.leave(roomName);

      // Actualizar tracking
      const rooms = this.clientRooms.get(client.id);
      if (rooms) {
        rooms.delete(roomName);
      }

      this.logger.log(
        `Cliente ${client.id} salió de sala de presencia: ${roomName}`,
      );

      // Notificar éxito
      client.emit('presence:left', {
        userId,
        userType,
        roomName,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Salió de sala de presencia exitosamente',
        userId,
        userType,
      };
    } catch (error) {
      this.logger.error(
        `Error al salir de sala de presencia:`,
        (error as Error).message,
      );
      return {
        success: false,
        message: 'Error al salir de la sala de presencia',
      };
    }
  }

  /**
   * Emite un evento a una sala específica (usado por event handlers)
   */
  emitToRoom(room: string, event: string, data: unknown): void {
    this.logger.log(`Emitiendo evento "${event}" a sala: ${room}`);
    this.server.to(room).emit(event, data);
  }

  /**
   * Emite un evento a múltiples salas
   */
  emitToRooms(rooms: string[], event: string, data: unknown): void {
    rooms.forEach((room) => {
      this.emitToRoom(room, event, data);
    });
  }

  /**
   * Obtiene las salas en las que está un cliente
   */
  getClientRooms(clientId: string): string[] {
    const rooms = this.clientRooms.get(clientId);
    return rooms ? Array.from(rooms) : [];
  }

  /**
   * Obtiene todos los clientes en una sala
   */
  async getClientsInRoom(room: string): Promise<string[]> {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.map((socket) => socket.id);
  }

  @SubscribeMessage('test')
  handleTest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TestMessage,
  ) {
    this.logger.log(
      `Mensaje de prueba recibido de ${client.id}: ${data.message}`,
    );

    // Enviar respuesta al cliente
    client.emit('test-response', {
      message: `Echo: ${data.message}`,
      timestamp: Date.now(),
      receivedAt: data.timestamp,
    });

    return {
      success: true,
      message: 'Mensaje de prueba procesado',
      data: data,
    };
  }

  @SubscribeMessage('health-check')
  handleHealthCheck(@ConnectedSocket() client: Socket) {
    this.logger.log(`Health check desde ${client.id}`);

    return {
      status: 'OK',
      timestamp: Date.now(),
      uptime: process.uptime(),
      message: 'WebSocket funcionando correctamente',
    };
  }

  /**
   * Listener para indicar que un usuario está escribiendo
   */
  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingPayload,
  ) {
    try {
      const { chatId, userId, userType } = data;

      if (!chatId || !userId || !userType) {
        client.emit('error', {
          message: 'chatId, userId y userType son requeridos',
          timestamp: Date.now(),
        });
        return { success: false, message: 'Parámetros inválidos' };
      }

      // Emitir a todos los participantes del chat (excepto el remitente)
      const roomName = `chat:${chatId}`;
      client.to(roomName).emit('typing:start', {
        chatId,
        userId,
        userType,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `Usuario ${userId} (${userType}) está escribiendo en chat ${chatId}`,
      );

      return {
        success: true,
        message: 'Typing indicator iniciado',
      };
    } catch (error) {
      this.logger.error(
        `Error al procesar typing start:`,
        (error as Error).message,
      );
      return { success: false, message: 'Error al procesar typing start' };
    }
  }

  /**
   * Listener para indicar que un usuario dejó de escribir
   */
  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: TypingPayload,
  ) {
    try {
      const { chatId, userId, userType } = data;

      if (!chatId || !userId || !userType) {
        client.emit('error', {
          message: 'chatId, userId y userType son requeridos',
          timestamp: Date.now(),
        });
        return { success: false, message: 'Parámetros inválidos' };
      }

      // Emitir a todos los participantes del chat (excepto el remitente)
      const roomName = `chat:${chatId}`;
      client.to(roomName).emit('typing:stop', {
        chatId,
        userId,
        userType,
        timestamp: new Date().toISOString(),
      });

      this.logger.debug(
        `Usuario ${userId} (${userType}) dejó de escribir en chat ${chatId}`,
      );

      return {
        success: true,
        message: 'Typing indicator detenido',
      };
    } catch (error) {
      this.logger.error(
        `Error al procesar typing stop:`,
        (error as Error).message,
      );
      return { success: false, message: 'Error al procesar typing stop' };
    }
  }

  /**
   * Handler para actividad real del usuario
   * Permite diferenciar entre conexión activa y usuario interactuando
   */
  @SubscribeMessage('user:activity')
  async handleUserActivity(@ConnectedSocket() client: Socket) {
    const user = this.clientUsers.get(client.id);
    if (!user) {
      return { success: false, message: 'Usuario no autenticado' };
    }

    const isVisitor = user.roles.includes('visitor');

    try {
      if (isVisitor && this.visitorConnectionService) {
        const visitorId = new VisitorId(user.userId);

        // Actualizar última actividad del usuario en Redis
        await this.visitorConnectionService.updateLastUserActivity(
          visitorId,
          VisitorLastActivity.now(),
        );

        // Actualizar actividad de la sesión en MongoDB para evitar expiración
        if (this.commandBus) {
          await this.commandBus.execute(
            new UpdateVisitorSessionActivityCommand(user.userId),
          );
        }

        // Reactivar desde AWAY si aplica
        const currentStatus =
          await this.visitorConnectionService.getConnectionStatus(visitorId);

        this.logger.log(
          `📡 [user:activity] Visitante ${user.userId} - Estado actual en Redis: ${currentStatus.value}`,
        );

        // Reactivar a ONLINE si está AWAY u OFFLINE
        if (
          (currentStatus.isAway() || currentStatus.isOffline()) &&
          this.commandBus
        ) {
          // Ejecutar comando para persistir en MongoDB y publicar eventos
          await this.commandBus.execute(
            new ChangeVisitorConnectionStatusCommand(user.userId, 'online'),
          );

          this.logger.log(
            `✅ Visitante ${user.userId} reactivado de ${currentStatus.value.toUpperCase()} a ONLINE por actividad`,
          );
        } else if (
          (currentStatus.isAway() || currentStatus.isOffline()) &&
          !this.commandBus
        ) {
          this.logger.warn(
            `⚠️ Visitante ${user.userId} está ${currentStatus.value.toUpperCase()} pero no hay commandBus disponible`,
          );
        }
      }

      return { success: true, message: 'Actividad registrada' };
    } catch (error) {
      this.logger.error(
        `Error al registrar actividad de usuario ${user.userId}:`,
        (error as Error).message,
      );
      return { success: false, message: 'Error al registrar actividad' };
    }
  }

  /**
   * Marca un visitante como ONLINE en Redis y publica evento
   */
  private async markVisitorOnline(
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    if (!this.visitorConnectionService) return;

    const visitorId = new VisitorId(userId);

    // Obtener estado previo para el evento
    let previousStatus = 'offline';
    try {
      const currentStatus =
        await this.visitorConnectionService.getConnectionStatus(visitorId);
      previousStatus = currentStatus.value;
    } catch {
      // Si no existe, asumimos offline
    }

    // Establecer estado ONLINE
    await this.visitorConnectionService.setConnectionStatus(
      visitorId,
      new VisitorConnectionVO(ConnectionStatus.ONLINE),
    );

    // Actualizar última actividad
    await this.visitorConnectionService.updateLastActivity(
      visitorId,
      VisitorLastActivity.now(),
    );
    await this.visitorConnectionService.updateLastUserActivity(
      visitorId,
      VisitorLastActivity.now(),
    );

    // Publicar evento de cambio de presencia
    if (this.eventBus && previousStatus !== 'online') {
      this.eventBus.publish(
        new PresenceChangedEvent(
          userId,
          'visitor',
          previousStatus,
          'online',
          tenantId,
        ),
      );
    }

    this.logger.log(
      `Visitante ${userId} marcado como ONLINE (previo: ${previousStatus})`,
    );
  }

  /**
   * Marca un visitante como OFFLINE usando CommandBus para persistir en MongoDB
   */
  private async markVisitorOffline(
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    // Usar CommandBus para persistir en MongoDB y publicar eventos
    if (this.commandBus) {
      try {
        await this.commandBus.execute(
          new ChangeVisitorConnectionStatusCommand(userId, 'offline'),
        );
        this.logger.log(
          `Visitante ${userId} marcado como OFFLINE (persistido en MongoDB)`,
        );
      } catch (error) {
        this.logger.error(
          `Error al marcar visitante ${userId} como OFFLINE: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }

    // Fallback: Solo Redis si no hay CommandBus
    if (!this.visitorConnectionService) return;

    const visitorId = new VisitorId(userId);

    // Obtener estado previo para el evento
    let previousStatus = 'online';
    try {
      const currentStatus =
        await this.visitorConnectionService.getConnectionStatus(visitorId);
      previousStatus = currentStatus.value;
    } catch {
      // Si no existe, asumimos online
    }

    // Establecer estado OFFLINE
    await this.visitorConnectionService.setConnectionStatus(
      visitorId,
      new VisitorConnectionVO(ConnectionStatus.OFFLINE),
    );

    // Publicar evento de cambio de presencia
    if (this.eventBus && previousStatus !== 'offline') {
      this.eventBus.publish(
        new PresenceChangedEvent(
          userId,
          'visitor',
          previousStatus,
          'offline',
          tenantId,
        ),
      );
    }

    this.logger.log(
      `Visitante ${userId} marcado como OFFLINE (previo: ${previousStatus})`,
    );
  }

  /**
   * Marca un comercial como ONLINE en Redis y publica evento
   */
  private async markCommercialOnline(
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    if (!this.commercialConnectionService) return;

    const commercialId = new CommercialId(userId);

    // Obtener estado previo para el evento
    let previousStatus = 'offline';
    try {
      const currentStatus =
        await this.commercialConnectionService.getConnectionStatus(
          commercialId,
        );
      previousStatus = currentStatus.value;
    } catch {
      // Si no existe, asumimos offline
    }

    // Establecer estado ONLINE propagando companyId para sets por tenant en Redis
    await this.commercialConnectionService.setConnectionStatus(
      commercialId,
      CommercialConnectionStatus.online(),
      tenantId,
    );

    // Actualizar última actividad
    await this.commercialConnectionService.updateLastActivity(
      commercialId,
      CommercialLastActivity.now(),
    );

    // Publicar evento de cambio de presencia
    if (this.eventBus && previousStatus !== 'online') {
      this.eventBus.publish(
        new PresenceChangedEvent(
          userId,
          'commercial',
          previousStatus,
          'online',
          tenantId,
        ),
      );
    }

    this.logger.log(
      `Comercial ${userId} marcado como ONLINE (previo: ${previousStatus})`,
    );
  }

  /**
   * Marca un comercial como OFFLINE en Redis y publica evento
   */
  private async markCommercialOffline(
    userId: string,
    tenantId?: string,
  ): Promise<void> {
    if (!this.commercialConnectionService) return;

    const commercialId = new CommercialId(userId);

    // Obtener estado previo para el evento
    let previousStatus = 'online';
    try {
      const currentStatus =
        await this.commercialConnectionService.getConnectionStatus(
          commercialId,
        );
      previousStatus = currentStatus.value;
    } catch {
      // Si no existe, asumimos online
    }

    // Establecer estado OFFLINE propagando companyId para limpiar sets por tenant en Redis
    await this.commercialConnectionService.setConnectionStatus(
      commercialId,
      CommercialConnectionStatus.offline(),
      tenantId,
    );

    // Publicar evento de cambio de presencia
    if (this.eventBus && previousStatus !== 'offline') {
      this.eventBus.publish(
        new PresenceChangedEvent(
          userId,
          'commercial',
          previousStatus,
          'offline',
          tenantId,
        ),
      );
    }

    this.logger.log(
      `Comercial ${userId} marcado como OFFLINE (previo: ${previousStatus})`,
    );
  }

  // Método para enviar mensajes broadcast (legacy - mantener por compatibilidad)
  broadcast(event: string, data: unknown) {
    this.logger.log(`Broadcasting: ${event}`);
    this.server.emit(event, data);
  }
}
