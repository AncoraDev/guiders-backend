import { Test, TestingModule } from '@nestjs/testing';
import { NotifyMessageSentOnMessageSentEventHandler } from '../notify-message-sent-on-message-sent.event-handler';
import { MessageSentEvent } from '../../../domain/events/message-sent.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('NotifyMessageSentOnMessageSentEventHandler', () => {
  let handler: NotifyMessageSentOnMessageSentEventHandler;
  let mockGateway: jest.Mocked<WebSocketGatewayBasic>;
  let mockChatRepository: { findById: jest.Mock };

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
    it('debe emitir notificación de mensaje normal a la sala del chat', () => {
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
      handler.handle(event);

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

    it('debe emitir notificación de mensaje interno solo a sala de comerciales', () => {
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
      handler.handle(event);

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

    it('debe emitir notificación de cambio de estado cuando es primera respuesta', () => {
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
      handler.handle(event);

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

    it('debe manejar errores sin lanzar excepciones', () => {
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

      // Act & Assert - No debe lanzar error
      expect(() => handler.handle(event)).not.toThrow();
      expect(mockGateway.emitToRoom).toHaveBeenCalled();
    });

    it('debe incluir datos de attachment cuando el mensaje lo tiene', () => {
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
      handler.handle(event);

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
  });
});
