import { Chat } from '../chat.aggregate';
import { v4 as uuidv4 } from 'uuid';

describe('Chat', () => {
  const mockVisitorId = uuidv4();
  const mockCommercialId = uuidv4();
  const mockCompanyId = uuidv4();
  const mockVisitorInfo = {
    name: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '+34123456789',
  };
  const mockMetadata = {
    source: 'website',
    page: '/contact',
    userAgent: 'Mozilla/5.0',
  };

  describe('createPendingChat', () => {
    it('debería crear un chat pendiente válido', () => {
      // Act
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
        priority: 'NORMAL',
        metadata: mockMetadata,
      });

      // Assert
      expect(chat).toBeInstanceOf(Chat);
      expect(chat.visitorId.getValue()).toBe(mockVisitorId);
      expect(chat.companyId).toBe(mockCompanyId);
      expect(chat.channel).toBe('chat');
      expect(chat.status.isPending()).toBe(true);
      expect(chat.priority.value).toBe('NORMAL');
      expect(chat.availableCommercialIds).toHaveLength(1);
      expect(chat.availableCommercialIds[0].getValue()).toBe(mockCommercialId);
      expect(chat.totalMessages).toBe(0);
      expect(chat.createdAt).toBeInstanceOf(Date);
      expect(chat.updatedAt).toBeInstanceOf(Date);
    });

    it('debería crear un chat con prioridad por defecto', () => {
      // Act
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });

      // Assert
      expect(chat.priority.value).toBe('NORMAL');
    });

    it('debería crear un chat con canal email', () => {
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        channel: 'email',
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [],
      });

      expect(chat.channel).toBe('email');
    });

    it('debería incluir companyId en toPrimitives', () => {
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [],
      });

      const primitives = chat.toPrimitives();
      expect(primitives.companyId).toBe(mockCompanyId);
      expect(primitives.channel).toBe('chat');
    });
  });

  describe('assignCommercial', () => {
    it('debería asignar comercial a chat pendiente', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });

      // Act
      const assignedChat = chat.assignCommercial(mockCommercialId);

      // Assert
      expect(assignedChat.status.value).toBe('ASSIGNED');
      expect(assignedChat.assignedCommercialId.isPresent()).toBe(true);
      expect(assignedChat.assignedCommercialId.get().getValue()).toBe(
        mockCommercialId,
      );
      expect(assignedChat.isAssignedTo(mockCommercialId)).toBe(true);
    });

    it('debería preservar ChatCreatedEvent al asignar comercial', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });

      // Verificar que el chat original tiene ChatCreatedEvent
      const originalEvents = chat.getUncommittedEvents();
      expect(originalEvents).toHaveLength(1);
      expect(originalEvents[0].constructor.name).toBe('ChatCreatedEvent');

      // Act
      const assignedChat = chat.assignCommercial(mockCommercialId);

      // Assert: El chat asignado debe tener AMBOS eventos
      const assignedEvents = assignedChat.getUncommittedEvents();
      expect(assignedEvents).toHaveLength(2);

      // Verificar que ChatCreatedEvent se preservó
      const chatCreatedEvent = assignedEvents.find(
        (e) => e.constructor.name === 'ChatCreatedEvent',
      );
      expect(chatCreatedEvent).toBeDefined();

      // Verificar que CommercialAssignedEvent se agregó
      const commercialAssignedEvent = assignedEvents.find(
        (e) => e.constructor.name === 'CommercialAssignedEvent',
      );
      expect(commercialAssignedEvent).toBeDefined();
    });

    it('debería lanzar error si se intenta asignar chat ya cerrado', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });
      const closedChat = chat.close('system', 'Test closure');

      // Act & Assert
      expect(() => closedChat.assignCommercial(mockCommercialId)).toThrow(
        'El chat no puede ser asignado en su estado actual',
      );
    });
  });

  describe('transferTo', () => {
    const otherCommercialId = uuidv4();

    it('debería transferir un chat asignado a otro comercial', () => {
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId, otherCommercialId],
      });
      const assigned = chat.assignCommercial(mockCommercialId);

      const transferred = assigned.transferTo(otherCommercialId, {
        transferredBy: mockCommercialId,
      });

      expect(transferred.status.value).toBe('ACTIVE');
      expect(transferred.isAssignedTo(otherCommercialId)).toBe(true);
      const events = transferred.getUncommittedEvents();
      const transferEvents = events.filter(
        (e) => e.constructor.name === 'CommercialAssignedEvent',
      ) as Array<{ getAssignmentData: () => { assignmentReason?: string } }>;
      expect(transferEvents.length).toBeGreaterThanOrEqual(1);
      expect(
        transferEvents[transferEvents.length - 1].getAssignmentData()
          .assignmentReason,
      ).toBe('transfer');
    });

    it('debería rechazar transferencia al mismo comercial', () => {
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });
      const assigned = chat.assignCommercial(mockCommercialId);

      expect(() => assigned.transferTo(mockCommercialId)).toThrow(
        'El chat ya está asignado a ese comercial',
      );
    });

    it('debería rechazar transferencia de chat pendiente', () => {
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });

      expect(() => chat.transferTo(otherCommercialId)).toThrow(
        'El chat no puede ser transferido en su estado actual',
      );
    });
  });

  describe('close', () => {
    it('debería cerrar un chat asignado', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });
      const assignedChat = chat.assignCommercial(mockCommercialId);

      // Act
      const closedChat = assignedChat.close(mockCommercialId, 'Resolved');

      // Assert
      expect(closedChat.status.isClosed()).toBe(true);
    });

    it('debería lanzar error si se intenta cerrar chat ya cerrado', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });
      const closedChat = chat.close('system', 'Test closure');

      // Act & Assert
      expect(() => closedChat.close('system', 'Already closed')).toThrow(
        'El chat ya está cerrado',
      );
    });
  });

  describe('isCommercialAvailable', () => {
    it('debería retornar true si el comercial está en la lista disponible', () => {
      // Arrange
      const commercialId2 = uuidv4();
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId, commercialId2],
      });

      // Act & Assert
      expect(chat.isCommercialAvailable(mockCommercialId)).toBe(true);
      expect(chat.isCommercialAvailable(commercialId2)).toBe(true);
      expect(chat.isCommercialAvailable(uuidv4())).toBe(false);
    });
  });

  describe('canReceiveMessages', () => {
    it('debería permitir mensajes en chat asignado', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });
      const assignedChat = chat.assignCommercial(mockCommercialId);

      // Act & Assert
      expect(assignedChat.canReceiveMessages()).toBe(true);
    });

    it('debería no permitir mensajes en chat cerrado', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
      });
      const closedChat = chat.close('system', 'Test closure');

      // Act & Assert
      expect(closedChat.canReceiveMessages()).toBe(false);
    });
  });

  describe('toPrimitives', () => {
    it('debería convertir a primitivos correctamente', () => {
      // Arrange
      const chat = Chat.createPendingChat({
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        visitorInfo: mockVisitorInfo,
        availableCommercialIds: [mockCommercialId],
        priority: 'HIGH',
        metadata: mockMetadata,
      });

      // Act
      const primitives = chat.toPrimitives();

      // Assert
      expect(primitives).toHaveProperty('id');
      expect(primitives).toHaveProperty('visitorId', mockVisitorId);
      expect(primitives).toHaveProperty('companyId', mockCompanyId);
      expect(primitives).toHaveProperty('channel', 'chat');
      expect(primitives).toHaveProperty('status', 'PENDING');
      expect(primitives).toHaveProperty('priority', 'HIGH');
      expect(primitives).toHaveProperty('totalMessages', 0);
      expect(primitives).toHaveProperty('availableCommercialIds', [
        mockCommercialId,
      ]);
      expect(primitives).toHaveProperty('visitorInfo', mockVisitorInfo);
      expect(primitives).toHaveProperty('metadata', mockMetadata);
      expect(primitives).toHaveProperty('createdAt');
      expect(primitives).toHaveProperty('updatedAt');
    });
  });

  describe('fromPrimitives', () => {
    it('debería crear Chat desde primitivos', () => {
      // Arrange
      const now = new Date();
      const chatId = uuidv4();
      const primitives = {
        id: chatId,
        status: 'PENDING',
        priority: 'NORMAL',
        visitorId: mockVisitorId,
        companyId: mockCompanyId,
        channel: 'chat' as const,
        availableCommercialIds: [mockCommercialId],
        totalMessages: 0,
        visitorInfo: mockVisitorInfo,
        metadata: mockMetadata,
        createdAt: now,
        updatedAt: now,
      };

      // Act
      const chat = Chat.fromPrimitives(primitives);

      // Assert
      expect(chat).toBeInstanceOf(Chat);
      expect(chat.id.getValue()).toBe(chatId);
      expect(chat.visitorId.getValue()).toBe(mockVisitorId);
      expect(chat.companyId).toBe(mockCompanyId);
      expect(chat.channel).toBe('chat');
      expect(chat.status.isPending()).toBe(true);
      expect(chat.priority.value).toBe('NORMAL');
      expect(chat.totalMessages).toBe(0);
    });
  });
});
