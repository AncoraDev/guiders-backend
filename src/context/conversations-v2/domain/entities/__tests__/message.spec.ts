import { Message } from '../message.aggregate';
import { v4 as uuidv4 } from 'uuid';

describe('Message', () => {
  const mockChatId = uuidv4();
  const mockSenderId = uuidv4();
  const mockContent = 'Hola, ¿cómo puedo ayudarte?';

  describe('createTextMessage', () => {
    it('debería crear un mensaje de texto válido', () => {
      // Act
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
        isInternal: false,
        isFirstResponse: false,
      });

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.chatId.getValue()).toBe(mockChatId);
      expect(message.senderId).toBe(mockSenderId);
      expect(message.senderName).toBeNull();
      expect(message.content.value).toBe(mockContent);
      expect(message.type.isText()).toBe(true);
      expect(message.isInternal).toBe(false);
      expect(message.isFirstResponse).toBe(false);
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.updatedAt).toBeInstanceOf(Date);
    });

    it('congela el nombre de quien lo escribió', () => {
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
        senderName: 'Admin User',
      });

      expect(message.senderName).toBe('Admin User');
      expect(message.toPrimitives().senderName).toBe('Admin User');

      const restored = Message.fromPrimitives(message.toPrimitives());
      expect(restored.senderName).toBe('Admin User');
    });

    it('debería crear un mensaje con valores por defecto', () => {
      // Act
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
      });

      // Assert
      expect(message.isInternal).toBe(false);
      expect(message.isFirstResponse).toBe(false);
    });
  });

  describe('createSystemMessage', () => {
    it('debería crear un mensaje del sistema para asignación', () => {
      // Act
      const message = Message.createSystemMessage({
        chatId: mockChatId,
        action: 'assigned',
        toUserId: 'commercial-123',
      });

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.chatId.getValue()).toBe(mockChatId);
      expect(message.senderId).toBe('system');
      expect(message.type.isSystem()).toBe(true);
      expect(message.content.value).toBe('Comercial asignado al chat');
      expect(message.isInternal).toBe(true);
      expect(message.isFirstResponse).toBe(false);
      expect(message.systemData?.action).toBe('assigned');
      expect(message.systemData?.toUserId).toBe('commercial-123');
    });

    it('debería crear un mensaje del sistema para transferencia', () => {
      // Act
      const message = Message.createSystemMessage({
        chatId: mockChatId,
        action: 'transferred',
        fromUserId: 'commercial-123',
        toUserId: 'commercial-456',
        reason: 'Especialización requerida',
      });

      // Assert
      expect(message.content.value).toBe('Chat transferido a otro comercial');
      expect(message.systemData?.action).toBe('transferred');
      expect(message.systemData?.fromUserId).toBe('commercial-123');
      expect(message.systemData?.toUserId).toBe('commercial-456');
      expect(message.systemData?.reason).toBe('Especialización requerida');
    });

    it('debería crear un mensaje del sistema para unirse al chat', () => {
      // Act
      const message = Message.createSystemMessage({
        chatId: mockChatId,
        action: 'joined',
        fromUserId: 'visitor-789',
      });

      // Assert
      expect(message.content.value).toBe('Usuario se unió al chat');
      expect(message.systemData?.action).toBe('joined');
      expect(message.systemData?.fromUserId).toBe('visitor-789');
    });

    it('debería crear un mensaje del sistema con acción personalizada', () => {
      // Act
      const message = Message.createSystemMessage({
        chatId: mockChatId,
        action: 'custom_action',
      });

      // Assert
      expect(message.content.value).toBe('Acción del sistema: custom_action');
      expect(message.systemData?.action).toBe('custom_action');
    });
  });

  describe('createFileMessage', () => {
    it('debería crear un mensaje con archivo adjunto', () => {
      // Arrange
      const attachment = {
        url: 'https://example.com/file.pdf',
        fileName: 'documento.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      };

      // Act
      const message = Message.createFileMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        fileName: 'documento.pdf',
        attachment,
        isInternal: false,
      });

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.content.value).toBe('Archivo adjunto: documento.pdf');
      expect(message.type.isFile()).toBe(true);
      expect(message.attachment).toEqual(attachment);
      expect(message.hasAttachment()).toBe(true);
      expect(message.isInternal).toBe(false);
    });

    it('debería crear un mensaje con imagen adjunta', () => {
      // Arrange
      const attachment = {
        url: 'https://example.com/image.jpg',
        fileName: 'foto.jpg',
        fileSize: 2048,
        mimeType: 'image/jpeg',
      };

      // Act
      const message = Message.createFileMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        fileName: 'foto.jpg',
        attachment,
      });

      // Assert
      expect(message.type.isImage()).toBe(true);
      expect(message.attachment).toEqual(attachment);
    });
  });

  describe('createAIMessage', () => {
    it('debería crear un mensaje de IA válido con metadata completa', () => {
      // Arrange
      const aiMetadata = {
        model: 'gpt-4',
        confidence: 0.95,
        suggestedActions: ['Ver productos', 'Contactar soporte'],
        processingTimeMs: 150,
        context: { topic: 'ventas' },
      };

      // Act
      const message = Message.createAIMessage({
        chatId: mockChatId,
        content: 'Hola, soy un asistente de IA. ¿En qué puedo ayudarte?',
        aiMetadata,
      });

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.chatId.getValue()).toBe(mockChatId);
      expect(message.senderId).toBe('ai');
      expect(message.content.value).toBe(
        'Hola, soy un asistente de IA. ¿En qué puedo ayudarte?',
      );
      expect(message.type.isAI()).toBe(true);
      expect(message.isAI).toBe(true);
      expect(message.aiMetadata).toEqual(aiMetadata);
      expect(message.isInternal).toBe(false);
      expect(message.isFirstResponse).toBe(false);
    });

    it('debería crear un mensaje de IA sin metadata opcional', () => {
      // Act
      const message = Message.createAIMessage({
        chatId: mockChatId,
        content: 'Respuesta automática de IA',
      });

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.type.isAI()).toBe(true);
      expect(message.isAI).toBe(true);
      expect(message.aiMetadata).toBeNull();
    });

    it('debería crear un mensaje de IA con metadata parcial', () => {
      // Arrange
      const aiMetadata = {
        model: 'claude-3',
        confidence: 0.88,
      };

      // Act
      const message = Message.createAIMessage({
        chatId: mockChatId,
        content: 'Respuesta de Claude',
        aiMetadata,
      });

      // Assert
      expect(message.aiMetadata?.model).toBe('claude-3');
      expect(message.aiMetadata?.confidence).toBe(0.88);
      expect(message.aiMetadata?.suggestedActions).toBeUndefined();
    });
  });

  describe('isAIMessage', () => {
    it('debería retornar true para mensajes de IA', () => {
      // Arrange
      const message = Message.createAIMessage({
        chatId: mockChatId,
        content: 'Respuesta de IA',
      });

      // Act & Assert
      expect(message.isAIMessage()).toBe(true);
    });

    it('debería retornar false para mensajes de texto', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
      });

      // Act & Assert
      expect(message.isAIMessage()).toBe(false);
    });

    it('debería retornar false para mensajes del sistema', () => {
      // Arrange
      const message = Message.createSystemMessage({
        chatId: mockChatId,
        action: 'assigned',
      });

      // Act & Assert
      expect(message.isAIMessage()).toBe(false);
    });
  });

  describe('isSystemMessage', () => {
    it('debería retornar true para mensajes del sistema', () => {
      // Arrange
      const message = Message.createSystemMessage({
        chatId: mockChatId,
        action: 'assigned',
      });

      // Act & Assert
      expect(message.isSystemMessage()).toBe(true);
    });

    it('debería retornar false para mensajes de texto', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
      });

      // Act & Assert
      expect(message.isSystemMessage()).toBe(false);
    });
  });

  describe('isVisibleToVisitor', () => {
    it('debería retornar true para mensajes públicos', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
        isInternal: false,
      });

      // Act & Assert
      expect(message.isVisibleToVisitor()).toBe(true);
    });

    it('debería retornar false para mensajes internos', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
        isInternal: true,
      });

      // Act & Assert
      expect(message.isVisibleToVisitor()).toBe(false);
    });
  });

  describe('hasAttachment', () => {
    it('debería retornar true para mensajes con adjunto', () => {
      // Arrange
      const attachment = {
        url: 'https://example.com/file.pdf',
        fileName: 'documento.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      };

      const message = Message.createFileMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        fileName: 'documento.pdf',
        attachment,
      });

      // Act & Assert
      expect(message.hasAttachment()).toBe(true);
    });

    it('debería retornar false para mensajes sin adjunto', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
      });

      // Act & Assert
      expect(message.hasAttachment()).toBe(false);
    });
  });

  describe('getContentSummary', () => {
    it('debería retornar resumen del contenido', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
      });

      // Act
      const summary = message.getContentSummary();

      // Assert
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  describe('toPrimitives', () => {
    it('debería convertir a primitivos correctamente', () => {
      // Arrange
      const message = Message.createTextMessage({
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
        isInternal: false,
        isFirstResponse: true,
      });

      // Act
      const primitives = message.toPrimitives();

      // Assert
      expect(primitives).toHaveProperty('id');
      expect(primitives).toHaveProperty('chatId', mockChatId);
      expect(primitives).toHaveProperty('senderId', mockSenderId);
      expect(primitives.senderName).toBeUndefined();
      expect(primitives).toHaveProperty('content', mockContent);
      expect(primitives).toHaveProperty('isInternal', false);
      expect(primitives).toHaveProperty('isFirstResponse', true);
      expect(primitives).toHaveProperty('createdAt');
      expect(primitives).toHaveProperty('updatedAt');
    });
  });

  describe('fromPrimitives', () => {
    it('debería crear Message desde primitivos', () => {
      // Arrange
      const now = new Date();
      const messageId = uuidv4();
      const primitives = {
        id: messageId,
        chatId: mockChatId,
        senderId: mockSenderId,
        content: mockContent,
        type: 'TEXT',
        isInternal: false,
        isFirstResponse: false,
        isRead: false,
        isAI: false,
        createdAt: now,
        updatedAt: now,
      };

      // Act
      const message = Message.fromPrimitives(primitives);

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.id.getValue()).toBe(messageId);
      expect(message.chatId.getValue()).toBe(mockChatId);
      expect(message.senderId).toBe(mockSenderId);
      expect(message.content.value).toBe(mockContent);
      expect(message.isInternal).toBe(false);
      expect(message.isFirstResponse).toBe(false);
    });

    it('debería crear Message de IA desde primitivos con aiMetadata', () => {
      // Arrange
      const now = new Date();
      const messageId = uuidv4();
      const aiMetadata = {
        model: 'gpt-4',
        confidence: 0.92,
        suggestedActions: ['Acción 1'],
        processingTimeMs: 200,
      };
      const primitives = {
        id: messageId,
        chatId: mockChatId,
        senderId: 'ai',
        content: 'Respuesta de IA',
        type: 'AI',
        isInternal: false,
        isFirstResponse: false,
        isRead: false,
        isAI: true,
        aiMetadata,
        createdAt: now,
        updatedAt: now,
      };

      // Act
      const message = Message.fromPrimitives(primitives);

      // Assert
      expect(message).toBeInstanceOf(Message);
      expect(message.type.isAI()).toBe(true);
      expect(message.isAI).toBe(true);
      expect(message.aiMetadata).toEqual(aiMetadata);
      expect(message.isAIMessage()).toBe(true);
    });
  });

  describe('toPrimitives with AI', () => {
    it('debería incluir campos AI en primitivos', () => {
      // Arrange
      const aiMetadata = {
        model: 'claude-3',
        confidence: 0.88,
      };
      const message = Message.createAIMessage({
        chatId: mockChatId,
        content: 'Respuesta de IA',
        aiMetadata,
      });

      // Act
      const primitives = message.toPrimitives();

      // Assert
      expect(primitives.isAI).toBe(true);
      expect(primitives.aiMetadata).toEqual(aiMetadata);
      expect(primitives.type).toBe('AI');
    });
  });
});
