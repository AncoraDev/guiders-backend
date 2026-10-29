import { Test, TestingModule } from '@nestjs/testing';
import { NotifyMessageSentOnMessageSentEventHandler } from '../notify-message-sent-on-message-sent.event-handler';
import { MessageSentEvent } from '../../../domain/events/message-sent.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { COMMERCIAL_REPOSITORY } from 'src/context/commercial/domain/commercial.repository';
import { COMMERCIAL_CONNECTION_DOMAIN_SERVICE } from 'src/context/commercial/domain/commercial-connection.domain-service';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('NotifyMessageSentOnMessageSentEventHandler', () => {
  let handler: NotifyMessageSentOnMessageSentEventHandler;
  let mockGateway: jest.Mocked<WebSocketGatewayBasic>;
  let mockChatRepository: { findById: jest.Mock };
  let mockCommercials: { findById: jest.Mock };
  let mockConnections: {
    isCommercialOnline: jest.Mock;
    listConnectedByCompany: jest.Mock;
  };

  beforeEach(async () => {
    // Mock del WebSocket Gateway
    mockGateway = {
      emitToRoom: jest.fn(),
      emitToRooms: jest.fn(),
    } as unknown as jest.Mocked<WebSocketGatewayBasic>;

    mockChatRepository = {
      findById: jest.fn().mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
      }),
    };
    mockCommercials = {
      findById: jest.fn().mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
      }),
    };
    mockConnections = {
      isCommercialOnline: jest.fn().mockResolvedValue(false),
      listConnectedByCompany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotifyMessageSentOnMessageSentEventHandler,
        {
          provide: 'WEBSOCKET_GATEWAY',
          useValue: mockGateway,
        },
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: mockChatRepository,
        },
        {
          provide: COMMERCIAL_REPOSITORY,
          useValue: mockCommercials,
        },
        {
          provide: COMMERCIAL_CONNECTION_DOMAIN_SERVICE,
          useValue: mockConnections,
        },
      ],
    }).compile();

    handler = module.get<NotifyMessageSentOnMessageSentEventHandler>(
      NotifyMessageSentOnMessageSentEventHandler,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handle', () => {
    it('debe emitir notificación de mensaje normal a la sala del chat', async () => {
      // Arrange
      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-123',
          chatId: 'chat-456',
          senderId: 'user-789',
          content: 'Hola, ¿cómo estás?',
          type: 'text',
          isFirstResponse: false,
          isInternal: false,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
        },
      });

      // Act
      await handler.handle(event);

      // Assert
      expect(mockGateway.emitToRoom).toHaveBeenCalledTimes(1);
      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        'chat:chat-456',
        'message:new',
        expect.objectContaining({
          messageId: 'msg-123',
          chatId: 'chat-456',
          senderId: 'user-789',
          content: 'Hola, ¿cómo estás?',
          type: 'text',
          isInternal: false,
        }),
      );
    });

    it('incluye el nombre guardado en el mensaje', async () => {
      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-123',
          chatId: 'chat-456',
          senderId: 'user-789',
          senderName: 'Admin User',
          content: 'Hola',
          type: 'text',
          isFirstResponse: false,
          isInternal: false,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
        },
      });

      await handler.handle(event);

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        'chat:chat-456',
        'message:new',
        expect.objectContaining({ senderName: 'Admin User' }),
      );
      expect(mockCommercials.findById).not.toHaveBeenCalled();
    });

    it('resuelve el nombre en el perfil comercial si el mensaje no lo trae', async () => {
      const senderId = Uuid.random().value;
      mockCommercials.findById.mockResolvedValue({
        isErr: () => false,
        isOk: () => true,
        unwrap: () => ({ name: { value: 'MARIA' } }),
      });

      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-123',
          chatId: 'chat-456',
          senderId,
          content: 'Hola',
          type: 'text',
          isFirstResponse: false,
          isInternal: false,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
        },
      });

      await handler.handle(event);

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        'chat:chat-456',
        'message:new',
        expect.objectContaining({ senderName: 'MARIA' }),
      );
    });

    it('debe emitir notificación de mensaje interno solo a sala de comerciales', async () => {
      // Arrange
      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-internal-123',
          chatId: 'chat-456',
          senderId: 'commercial-789',
          content: 'Nota interna: Cliente VIP',
          type: 'text',
          isFirstResponse: false,
          isInternal: true,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
        },
      });

      // Act
      await handler.handle(event);

      // Assert
      expect(mockGateway.emitToRoom).toHaveBeenCalledTimes(1);
      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        'chat:chat-456:commercial',
        'message:new',
        expect.objectContaining({
          messageId: 'msg-internal-123',
          chatId: 'chat-456',
          isInternal: true,
        }),
      );
    });

    it('debe emitir notificación de cambio de estado cuando es primera respuesta', async () => {
      // Arrange
      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-first-123',
          chatId: 'chat-456',
          senderId: 'commercial-789',
          content: '¡Hola! Te ayudo con tu consulta',
          type: 'text',
          isFirstResponse: true,
          isInternal: false,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
        },
      });

      // Act
      await handler.handle(event);

      // Assert
      expect(mockGateway.emitToRoom).toHaveBeenCalledTimes(2);

      // Primera llamada: mensaje nuevo
      expect(mockGateway.emitToRoom).toHaveBeenNthCalledWith(
        1,
        'chat:chat-456',
        'message:new',
        expect.objectContaining({
          isFirstResponse: true,
        }),
      );

      // Segunda llamada: cambio de estado
      expect(mockGateway.emitToRoom).toHaveBeenNthCalledWith(
        2,
        'chat:chat-456',
        'chat:status',
        expect.objectContaining({
          chatId: 'chat-456',
          status: 'IN_PROGRESS',
        }),
      );
    });

    it('debe manejar errores sin lanzar excepciones', async () => {
      // Arrange
      mockGateway.emitToRoom.mockImplementation(() => {
        throw new Error('Error de red simulado');
      });

      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-123',
          chatId: 'chat-456',
          senderId: 'user-789',
          content: 'Test',
          type: 'text',
          isFirstResponse: false,
          isInternal: false,
          isAI: false,
          sentAt: new Date(),
        },
      });

      await expect(handler.handle(event)).resolves.toBeUndefined();
      expect(mockGateway.emitToRoom).toHaveBeenCalled();
    });

    it('debe incluir datos de attachment cuando el mensaje lo tiene', async () => {
      // Arrange
      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-with-file',
          chatId: 'chat-456',
          senderId: 'user-789',
          content: 'Adjunto archivo',
          type: 'file',
          isFirstResponse: false,
          isInternal: false,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
          attachment: {
            url: 'https://storage.example.com/file.pdf',
            fileName: 'documento.pdf',
            fileSize: 1024000,
            mimeType: 'application/pdf',
          },
        },
      });

      // Act
      await handler.handle(event);

      // Assert
      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        'chat:chat-456',
        'message:new',
        expect.objectContaining({
          attachment: {
            url: 'https://storage.example.com/file.pdf',
            fileName: 'documento.pdf',
            fileSize: 1024000,
            mimeType: 'application/pdf',
          },
        }),
      );
    });

    it('debe replicar el mensaje PENDING a la sala del tenant', async () => {
      const chatId = Uuid.random().value;
      const companyId = Uuid.random().value;
      const messageId = Uuid.random().value;
      const senderId = Uuid.random().value;

      mockChatRepository.findById.mockResolvedValue({
        isErr: () => false,
        isOk: () => true,
        unwrap: () => ({
          companyId,
          status: { isPending: () => true },
        }),
      });

      const event = new MessageSentEvent({
        message: {
          messageId,
          chatId,
          senderId,
          content: 'Hola, busco información',
          type: 'text',
          isFirstResponse: false,
          isInternal: false,
          isAI: false,
          sentAt: new Date('2025-10-03T10:00:00Z'),
        },
      });

      await handler.handle(event);

      expect(mockGateway.emitToRoom).toHaveBeenCalledTimes(2);
      expect(mockGateway.emitToRoom).toHaveBeenNthCalledWith(
        2,
        `tenant:${companyId}`,
        'message:new',
        expect.objectContaining({
          messageId,
          chatId,
          queue: 'pendientes',
          senderType: 'VISITOR',
        }),
      );
    });

    it('avisa a los comerciales conectados si el asignado está ausente', async () => {
      const chatId = Uuid.random().value;
      const companyId = Uuid.random().value;
      const visitorId = Uuid.random().value;
      const assigneeId = Uuid.random().value;
      const colleagueId = Uuid.random().value;

      mockChatRepository.findById.mockResolvedValue({
        isErr: () => false,
        unwrap: () => ({
          companyId,
          status: { isPending: () => false, value: 'ASSIGNED' },
          visitorId: { getValue: () => visitorId },
          assignedCommercialId: {
            isPresent: () => true,
            get: () => ({ getValue: () => assigneeId }),
          },
        }),
      });
      mockConnections.isCommercialOnline.mockResolvedValue(false);
      mockConnections.listConnectedByCompany.mockResolvedValue([
        { value: assigneeId },
        { value: colleagueId },
      ]);
      mockCommercials.findById.mockResolvedValue({
        isErr: () => false,
        unwrap: () => ({ name: { value: 'María' } }),
      });

      await handler.handle(
        new MessageSentEvent({
          message: {
            messageId: Uuid.random().value,
            chatId,
            senderId: visitorId,
            content: 'Hola, sigo aquí',
            type: 'text',
            isFirstResponse: false,
            isInternal: false,
            isAI: false,
            sentAt: new Date('2025-10-03T10:00:00Z'),
          },
        }),
      );

      expect(mockGateway.emitToRoom).toHaveBeenCalledWith(
        `commercial:${colleagueId}`,
        'message:new',
        expect.objectContaining({
          queue: 'ausente',
          senderType: 'VISITOR',
          assignedCommercialId: assigneeId,
          assignedCommercialName: 'María',
        }),
      );
      expect(mockGateway.emitToRoom).not.toHaveBeenCalledWith(
        `commercial:${assigneeId}`,
        'message:new',
        expect.anything(),
      );
      expect(mockGateway.emitToRoom).not.toHaveBeenCalledWith(
        `tenant:${companyId}`,
        'message:new',
        expect.anything(),
      );
    });

    it('no avisa al equipo si el asignado sigue conectado', async () => {
      const chatId = Uuid.random().value;
      const visitorId = Uuid.random().value;
      const assigneeId = Uuid.random().value;

      mockChatRepository.findById.mockResolvedValue({
        isErr: () => false,
        unwrap: () => ({
          companyId: Uuid.random().value,
          status: { isPending: () => false, value: 'ACTIVE' },
          visitorId: { getValue: () => visitorId },
          assignedCommercialId: {
            isPresent: () => true,
            get: () => ({ getValue: () => assigneeId }),
          },
        }),
      });
      mockConnections.isCommercialOnline.mockResolvedValue(true);

      await handler.handle(
        new MessageSentEvent({
          message: {
            messageId: Uuid.random().value,
            chatId,
            senderId: visitorId,
            content: 'Hola',
            type: 'text',
            isFirstResponse: false,
            isInternal: false,
            isAI: false,
            sentAt: new Date('2025-10-03T10:00:00Z'),
          },
        }),
      );

      expect(mockConnections.listConnectedByCompany).not.toHaveBeenCalled();
      expect(mockGateway.emitToRoom).toHaveBeenCalledTimes(1);
    });
  });
});
