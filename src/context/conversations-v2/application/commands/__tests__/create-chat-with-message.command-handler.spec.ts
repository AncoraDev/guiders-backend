import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisher } from '@nestjs/cqrs';
import { CreateChatWithMessageCommandHandler } from '../create-chat-with-message.command-handler';
import { CreateChatWithMessageCommand } from '../create-chat-with-message.command';
import {
  CHAT_V2_REPOSITORY,
  IChatRepository,
} from '../../../domain/chat.repository';
import {
  MESSAGE_V2_REPOSITORY,
  IMessageRepository,
} from '../../../domain/message.repository';
import { CHAT_QUEUE_CONFIG_SERVICE } from '../../../domain/services/chat-queue-config.service';
import { VISITOR_V2_REPOSITORY } from 'src/context/visitors-v2/domain/visitor-v2.repository';
import { ok, okVoid, err } from 'src/context/shared/domain/result';
import { DomainError } from 'src/context/shared/domain/domain.error';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';
import { Chat } from '../../../domain/entities/chat.aggregate';
import { ChatAttendedByOtherCommercialError } from '../../../domain/errors/chat.error';

// Error concreto para tests
class TestChatError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

class TestMessageError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

class TestCountError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

describe('CreateChatWithMessageCommandHandler', () => {
  let handler: CreateChatWithMessageCommandHandler;
  let chatRepository: jest.Mocked<IChatRepository>;
  let messageRepository: jest.Mocked<IMessageRepository>;
  let eventPublisher: jest.Mocked<EventPublisher>;

  beforeEach(async () => {
    const chatRepositoryMock = {
      save: jest.fn(),
      findById: jest.fn(),
      findByVisitorId: jest.fn().mockResolvedValue(ok([])),
      countPendingCreatedBefore: jest.fn(),
    };

    const messageRepositoryMock = {
      save: jest.fn(),
      findById: jest.fn(),
    };

    const eventPublisherMock = {
      mergeObjectContext: jest.fn(),
    };

    const queueConfigServiceMock = {
      shouldUseQueue: jest.fn().mockReturnValue(false),
      getConfig: jest.fn().mockReturnValue({
        queueModeEnabled: false,
        maxQueueWaitTimeSeconds: 300,
        maxQueueSizePerDepartment: 50,
        notifyCommercialsOnNewChats: true,
      }),
      isQueueModeEnabled: jest.fn().mockReturnValue(false),
      getMaxQueueWaitTime: jest.fn().mockReturnValue(300),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateChatWithMessageCommandHandler,
        {
          provide: CHAT_V2_REPOSITORY,
          useValue: chatRepositoryMock,
        },
        {
          provide: MESSAGE_V2_REPOSITORY,
          useValue: messageRepositoryMock,
        },
        {
          provide: CHAT_QUEUE_CONFIG_SERVICE,
          useValue: queueConfigServiceMock,
        },
        {
          provide: VISITOR_V2_REPOSITORY,
          useValue: {
            findById: jest.fn().mockResolvedValue({ isErr: () => true }),
          },
        },
        {
          provide: EventPublisher,
          useValue: eventPublisherMock,
        },
      ],
    }).compile();

    handler = module.get<CreateChatWithMessageCommandHandler>(
      CreateChatWithMessageCommandHandler,
    );
    chatRepository = module.get(CHAT_V2_REPOSITORY);
    messageRepository = module.get(MESSAGE_V2_REPOSITORY);
    eventPublisher = module.get(EventPublisher);
  });

  describe('execute', () => {
    it('debe crear un chat con mensaje de texto exitosamente', async () => {
      // Arrange
      const command = new CreateChatWithMessageCommand(
        '123e4567-e89b-12d3-a456-426614174000', // visitorId
        '123e4567-e89b-12d3-a456-426614174000', // senderId (mismo que visitor en este caso)
        {
          content: 'Hola, necesito ayuda',
          type: 'text',
        },
        undefined, // visitorInfo
        undefined, // metadata
        undefined, // commercialId
        '123e4567-e89b-12d3-a456-426614174999', // companyId
      );

      const mockChat = {
        id: { getValue: () => 'chat-123' },
        createdAt: new Date(),
        metadata: {
          isPresent: () => false,
        },
        commit: jest.fn(),
      };

      const mockMessage = {
        id: { getValue: () => 'msg-456' },
        commit: jest.fn(),
      };

      eventPublisher.mergeObjectContext
        .mockReturnValueOnce(mockChat as any)
        .mockReturnValueOnce(mockMessage as any);

      chatRepository.save.mockResolvedValue(okVoid());
      messageRepository.save.mockResolvedValue(okVoid());
      chatRepository.countPendingCreatedBefore.mockResolvedValue(ok(2));

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.chatId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.position).toBe(3); // count + 1
      expect(typeof result.chatId).toBe('string');
      expect(typeof result.messageId).toBe('string');

      expect(chatRepository.save).toHaveBeenCalledWith(mockChat);
      expect(messageRepository.save).toHaveBeenCalledWith(mockMessage);
      expect(mockChat.commit).toHaveBeenCalled();
      expect(mockMessage.commit).toHaveBeenCalled();
    });

    it('debe crear un chat con mensaje de archivo exitosamente', async () => {
      // Arrange
      const command = new CreateChatWithMessageCommand(
        '123e4567-e89b-12d3-a456-426614174001', // visitorId
        '123e4567-e89b-12d3-a456-426614174001', // senderId
        {
          content: 'Archivo adjunto',
          type: 'file',
          attachment: {
            url: 'https://example.com/file.pdf',
            fileName: 'document.pdf',
            fileSize: 1024,
            mimeType: 'application/pdf',
          },
        },
        undefined, // visitorInfo
        undefined, // metadata
        undefined, // commercialId
        '123e4567-e89b-12d3-a456-426614174999', // companyId
      );

      const mockChat = {
        id: { getValue: () => 'chat-789' },
        createdAt: new Date(),
        metadata: {
          isPresent: () => false,
        },
        commit: jest.fn(),
      };

      const mockMessage = {
        id: { getValue: () => 'msg-790' },
        commit: jest.fn(),
      };

      eventPublisher.mergeObjectContext
        .mockReturnValueOnce(mockChat as any)
        .mockReturnValueOnce(mockMessage as any);

      chatRepository.save.mockResolvedValue(okVoid());
      messageRepository.save.mockResolvedValue(okVoid());
      chatRepository.countPendingCreatedBefore.mockResolvedValue(ok(0));

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.chatId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.position).toBe(1); // count + 1
      expect(typeof result.chatId).toBe('string');
      expect(typeof result.messageId).toBe('string');

      expect(chatRepository.save).toHaveBeenCalledWith(mockChat);
      expect(messageRepository.save).toHaveBeenCalledWith(mockMessage);
      expect(mockChat.commit).toHaveBeenCalled();
      expect(mockMessage.commit).toHaveBeenCalled();
    });

    it('debe usar valores por defecto cuando no se proporcionan datos opcionales', async () => {
      // Arrange
      const command = new CreateChatWithMessageCommand(
        '123e4567-e89b-12d3-a456-426614174002', // visitorId
        '123e4567-e89b-12d3-a456-426614174002', // senderId
        {
          content: 'Solo mensaje básico',
        },
        undefined, // visitorInfo
        undefined, // metadata
        undefined, // commercialId
        '123e4567-e89b-12d3-a456-426614174999', // companyId
      );

      const mockChat = {
        id: { getValue: () => 'chat-791' },
        createdAt: new Date(),
        metadata: {
          isPresent: () => false,
        },
        commit: jest.fn(),
      };

      const mockMessage = {
        id: { getValue: () => 'msg-791' },
        commit: jest.fn(),
      };

      eventPublisher.mergeObjectContext
        .mockReturnValueOnce(mockChat as any)
        .mockReturnValueOnce(mockMessage as any);

      chatRepository.save.mockResolvedValue(okVoid());
      messageRepository.save.mockResolvedValue(okVoid());
      chatRepository.countPendingCreatedBefore.mockResolvedValue(ok(1));

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.chatId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(result.position).toBe(2);
      expect(typeof result.chatId).toBe('string');
      expect(typeof result.messageId).toBe('string');
    });

    it('debe lanzar error cuando falla el guardado del chat', async () => {
      // Arrange
      const command = new CreateChatWithMessageCommand(
        '123e4567-e89b-12d3-a456-426614174003', // visitorId
        '123e4567-e89b-12d3-a456-426614174003', // senderId
        {
          content: 'Test message',
        },
        undefined, // visitorInfo
        undefined, // metadata
        undefined, // commercialId
        '123e4567-e89b-12d3-a456-426614174999', // companyId
      );

      const mockChat = {
        id: { getValue: () => 'chat-459' },
        createdAt: new Date(),
        metadata: {
          isPresent: () => false,
        },
        commit: jest.fn(),
      };

      const chatError = new TestChatError('Chat save failed');

      eventPublisher.mergeObjectContext.mockReturnValueOnce(mockChat as any);
      chatRepository.save.mockResolvedValue(err(chatError));

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow(
        'Error al crear el chat: Chat save failed',
      );

      expect(chatRepository.save).toHaveBeenCalledWith(mockChat);
      expect(messageRepository.save).not.toHaveBeenCalled();
    });

    it('debe lanzar error cuando falla el guardado del mensaje', async () => {
      // Arrange
      const command = new CreateChatWithMessageCommand(
        '123e4567-e89b-12d3-a456-426614174004', // visitorId
        '123e4567-e89b-12d3-a456-426614174004', // senderId
        {
          content: 'Test message',
        },
        undefined, // visitorInfo
        undefined, // metadata
        undefined, // commercialId
        '123e4567-e89b-12d3-a456-426614174999', // companyId
      );

      const mockChat = {
        id: { getValue: () => 'chat-460' },
        createdAt: new Date(),
        metadata: {
          isPresent: () => false,
        },
        commit: jest.fn(),
      };

      const mockMessage = {
        id: { getValue: () => 'msg-792' },
        commit: jest.fn(),
      };

      const messageError = new TestMessageError('Message save failed');

      eventPublisher.mergeObjectContext
        .mockReturnValueOnce(mockChat as any)
        .mockReturnValueOnce(mockMessage as any);

      chatRepository.save.mockResolvedValue(okVoid());
      messageRepository.save.mockResolvedValue(err(messageError));

      // Act & Assert
      await expect(handler.execute(command)).rejects.toThrow(
        'Error al crear el primer mensaje: Message save failed',
      );

      expect(chatRepository.save).toHaveBeenCalledWith(mockChat);
      expect(messageRepository.save).toHaveBeenCalledWith(mockMessage);
    });

    it('debe calcular correctamente la posición en la cola cuando hay error en countPending', async () => {
      // Arrange
      const command = new CreateChatWithMessageCommand(
        '123e4567-e89b-12d3-a456-426614174005', // visitorId
        '123e4567-e89b-12d3-a456-426614174005', // senderId
        {
          content: 'Test message',
        },
        undefined, // visitorInfo
        undefined, // metadata
        undefined, // commercialId
        '123e4567-e89b-12d3-a456-426614174999', // companyId
      );

      const mockChat = {
        id: { getValue: () => 'chat-461' },
        createdAt: new Date(),
        metadata: {
          isPresent: () => false,
        },
        commit: jest.fn(),
      };

      const mockMessage = {
        id: { getValue: () => 'msg-793' },
        commit: jest.fn(),
      };

      eventPublisher.mergeObjectContext
        .mockReturnValueOnce(mockChat as any)
        .mockReturnValueOnce(mockMessage as any);

      chatRepository.save.mockResolvedValue(okVoid());
      messageRepository.save.mockResolvedValue(okVoid());

      // Simular error en countPending
      const countError = new TestCountError('Count failed');
      chatRepository.countPendingCreatedBefore.mockResolvedValue(
        err(countError),
      );

      // Act
      const result = await handler.execute(command);

      // Assert
      expect(result.position).toBe(1); // Valor por defecto cuando falla el conteo
      expect(result.chatId).toBeDefined();
      expect(result.messageId).toBeDefined();
      expect(typeof result.chatId).toBe('string');
      expect(typeof result.messageId).toBe('string');
    });

    it('rechaza el alta si otro comercial ya atiende al visitante', async () => {
      const visitorId = Uuid.random().value;
      const companyId = Uuid.random().value;
      const otherCommercialId = Uuid.random().value;
      const actorId = Uuid.random().value;
      const existing = Chat.createPendingChat({
        visitorId,
        companyId,
        visitorInfo: {},
        availableCommercialIds: [],
      }).assignCommercial(otherCommercialId);
      chatRepository.findByVisitorId.mockResolvedValue(ok([existing]));

      await expect(
        handler.execute(
          new CreateChatWithMessageCommand(
            visitorId,
            actorId,
            { content: 'Hola', type: 'text' },
            undefined,
            undefined,
            actorId,
            companyId,
          ),
        ),
      ).rejects.toThrow(ChatAttendedByOtherCommercialError);

      expect(chatRepository.save).not.toHaveBeenCalled();
      expect(messageRepository.save).not.toHaveBeenCalled();
    });

    it('añade el saludo al chat pendiente y lo asigna a ese comercial', async () => {
      const visitorId = Uuid.random().value;
      const companyId = Uuid.random().value;
      const commercialId = Uuid.random().value;
      const existing = Chat.createPendingChat({
        visitorId,
        companyId,
        visitorInfo: {},
        availableCommercialIds: [],
      });
      chatRepository.findByVisitorId.mockResolvedValue(ok([existing]));
      chatRepository.save.mockResolvedValue(okVoid());
      messageRepository.save.mockResolvedValue(okVoid());
      eventPublisher.mergeObjectContext.mockImplementation((aggregate: any) => {
        aggregate.commit = jest.fn();
        return aggregate;
      });

      const result = await handler.execute(
        new CreateChatWithMessageCommand(
          visitorId,
          commercialId,
          { content: 'Hola, te saludo', type: 'text' },
          undefined,
          undefined,
          commercialId,
          companyId,
        ),
      );

      expect(result.chatId).toBe(existing.id.getValue());
      expect(result.position).toBe(0);
      expect(chatRepository.save).toHaveBeenCalledTimes(1);
      expect(messageRepository.save).toHaveBeenCalledTimes(1);
    });

    it('añade el mensaje al chat que ya es de ese comercial', async () => {
      const visitorId = Uuid.random().value;
      const companyId = Uuid.random().value;
      const commercialId = Uuid.random().value;
      const existing = Chat.createPendingChat({
        visitorId,
        companyId,
        visitorInfo: {},
        availableCommercialIds: [],
      }).assignCommercial(commercialId);
      chatRepository.findByVisitorId.mockResolvedValue(ok([existing]));
      messageRepository.save.mockResolvedValue(okVoid());
      eventPublisher.mergeObjectContext.mockImplementation((aggregate: any) => {
        aggregate.commit = jest.fn();
        return aggregate;
      });

      const result = await handler.execute(
        new CreateChatWithMessageCommand(
          visitorId,
          commercialId,
          { content: 'Sigo yo', type: 'text' },
          undefined,
          undefined,
          commercialId,
          companyId,
        ),
      );

      expect(result.chatId).toBe(existing.id.getValue());
      expect(chatRepository.save).not.toHaveBeenCalled();
      expect(messageRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
