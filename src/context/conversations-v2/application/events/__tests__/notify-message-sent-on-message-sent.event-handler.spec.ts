import { Test, TestingModule } from '@nestjs/testing';
import { NotifyMessageSentOnMessageSentEventHandler } from '../notify-message-sent-on-message-sent.event-handler';
import { MessageSentEvent } from '../../../domain/events/message-sent.event';
import { WebSocketGatewayBasic } from 'src/websocket/websocket.gateway';
import { CHAT_V2_REPOSITORY } from '../../../domain/chat.repository';
import { USER_ACCOUNT_REPOSITORY } from 'src/context/auth/auth-user/domain/user-account.repository';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

describe('NotifyMessageSentOnMessageSentEventHandler', () => {
  let handler: NotifyMessageSentOnMessageSentEventHandler;
  let mockGateway: jest.Mocked<WebSocketGatewayBasic>;
  let mockChatRepository: { findById: jest.Mock };
  let mockUsers: { findById: jest.Mock };

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
    mockUsers = {
      findById: jest.fn().mockResolvedValue(null),
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
          provide: USER_ACCOUNT_REPOSITORY,
          useValue: mockUsers,
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

    it('incluye el nombre de la cuenta que escribió el mensaje', async () => {
      mockUsers.findById.mockResolvedValue({
        name: { getValue: () => 'Admin User' },
      });

      const event = new MessageSentEvent({
        message: {
          messageId: 'msg-123',
          chatId: 'chat-456',
          senderId: 'user-789',
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
  });
});
