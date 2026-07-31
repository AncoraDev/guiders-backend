import { ChatStatus, ChatStatusEnum } from '../chat-status';

describe('ChatStatus', () => {
  describe('constructor', () => {
    it('debería crear un ChatStatus válido con estado PENDING', () => {
      // Arrange
      const validStatus = ChatStatusEnum.PENDING;

      // Act
      const chatStatus = new ChatStatus(validStatus);

      // Assert
      expect(chatStatus).toBeInstanceOf(ChatStatus);
      expect(chatStatus.value).toBe(validStatus);
    });

    it('debería crear un ChatStatus válido con estado ACTIVE', () => {
      // Arrange
      const validStatus = ChatStatusEnum.ACTIVE;

      // Act
      const chatStatus = new ChatStatus(validStatus);

      // Assert
      expect(chatStatus).toBeInstanceOf(ChatStatus);
      expect(chatStatus.value).toBe(validStatus);
    });

    it('debería crear un ChatStatus válido con estado CLOSED', () => {
      // Arrange
      const validStatus = ChatStatusEnum.CLOSED;

      // Act
      const chatStatus = new ChatStatus(validStatus);

      // Assert
      expect(chatStatus).toBeInstanceOf(ChatStatus);
      expect(chatStatus.value).toBe(validStatus);
    });

    it('debería lanzar error con estado inválido', () => {
      // Arrange
      const invalidStatus = 'invalid-status';

      // Act & Assert
      expect(() => new ChatStatus(invalidStatus)).toThrow(
        'El estado del chat debe ser uno de los valores válidos',
      );
    });

    it('debería lanzar error con string vacío', () => {
      // Arrange
      const emptyStatus = '';

      // Act & Assert
      expect(() => new ChatStatus(emptyStatus)).toThrow(
        'El estado del chat debe ser uno de los valores válidos',
      );
    });
  });

  describe('isPending', () => {
    it('debería retornar true para estado PENDING', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.PENDING);

      // Act & Assert
      expect(chatStatus.isPending()).toBe(true);
    });

    it('debería retornar false para estado ACTIVE', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.ACTIVE);

      // Act & Assert
      expect(chatStatus.isPending()).toBe(false);
    });

    it('debería retornar false para estado CLOSED', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.CLOSED);

      // Act & Assert
      expect(chatStatus.isPending()).toBe(false);
    });
  });

  describe('isActive', () => {
    it('debería retornar true para estado ACTIVE', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.ACTIVE);

      // Act & Assert
      expect(chatStatus.isActive()).toBe(true);
    });

    it('debería retornar false para estado PENDING', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.PENDING);

      // Act & Assert
      expect(chatStatus.isActive()).toBe(false);
    });

    it('debería retornar false para estado CLOSED', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.CLOSED);

      // Act & Assert
      expect(chatStatus.isActive()).toBe(false);
    });
  });

  describe('isClosed', () => {
    it('debería retornar true para estado CLOSED', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.CLOSED);

      // Act & Assert
      expect(chatStatus.isClosed()).toBe(true);
    });

    it('debería retornar false para estado PENDING', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.PENDING);

      // Act & Assert
      expect(chatStatus.isClosed()).toBe(false);
    });

    it('debería retornar false para estado ACTIVE', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.ACTIVE);

      // Act & Assert
      expect(chatStatus.isClosed()).toBe(false);
    });
  });

  describe('canReceiveMessages', () => {
    it('debería retornar true para estado ACTIVE', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.ACTIVE);

      // Act & Assert
      expect(chatStatus.canReceiveMessages()).toBe(true);
    });

    it('debería retornar true para estado ASSIGNED', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.ASSIGNED);

      // Act & Assert
      expect(chatStatus.canReceiveMessages()).toBe(true);
    });

    it('debería retornar false para estado CLOSED', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.CLOSED);

      // Act & Assert
      expect(chatStatus.canReceiveMessages()).toBe(false);
    });

    it('debería retornar false para estado PENDING', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.PENDING);

      // Act & Assert
      expect(chatStatus.canReceiveMessages()).toBe(false);
    });
  });

  describe('canBeAssigned', () => {
    it('debería retornar true para estado PENDING', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.PENDING);

      // Act & Assert
      expect(chatStatus.canBeAssigned()).toBe(true);
    });

    it('debería retornar false para estado ACTIVE', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.ACTIVE);

      // Act & Assert
      expect(chatStatus.canBeAssigned()).toBe(false);
    });

    it('debería retornar false para estado CLOSED', () => {
      // Arrange
      const chatStatus = new ChatStatus(ChatStatusEnum.CLOSED);

      // Act & Assert
      expect(chatStatus.canBeAssigned()).toBe(false);
    });
  });

  describe('canBeTransferred', () => {
    it('debería retornar true para ASSIGNED, ACTIVE y TRANSFERRED', () => {
      expect(new ChatStatus(ChatStatusEnum.ASSIGNED).canBeTransferred()).toBe(
        true,
      );
      expect(new ChatStatus(ChatStatusEnum.ACTIVE).canBeTransferred()).toBe(
        true,
      );
      expect(
        new ChatStatus(ChatStatusEnum.TRANSFERRED).canBeTransferred(),
      ).toBe(true);
    });

    it('debería retornar false para PENDING y CLOSED', () => {
      expect(new ChatStatus(ChatStatusEnum.PENDING).canBeTransferred()).toBe(
        false,
      );
      expect(new ChatStatus(ChatStatusEnum.CLOSED).canBeTransferred()).toBe(
        false,
      );
    });
  });

  describe('equals', () => {
    it('debería retornar true para ChatStatus con el mismo valor', () => {
      // Arrange
      const chatStatus1 = new ChatStatus(ChatStatusEnum.PENDING);
      const chatStatus2 = new ChatStatus(ChatStatusEnum.PENDING);

      // Act & Assert
      expect(chatStatus1.equals(chatStatus2)).toBe(true);
    });

    it('debería retornar false para ChatStatus con diferentes valores', () => {
      // Arrange
      const chatStatus1 = new ChatStatus(ChatStatusEnum.PENDING);
      const chatStatus2 = new ChatStatus(ChatStatusEnum.CLOSED);

      // Act & Assert
      expect(chatStatus1.equals(chatStatus2)).toBe(false);
    });
  });

  describe('static constants', () => {
    it('debería tener constantes estáticas para todos los estados', () => {
      // Act & Assert
      expect(ChatStatus.PENDING.value).toBe(ChatStatusEnum.PENDING);
      expect(ChatStatus.ASSIGNED.value).toBe(ChatStatusEnum.ASSIGNED);
      expect(ChatStatus.ACTIVE.value).toBe(ChatStatusEnum.ACTIVE);
      expect(ChatStatus.CLOSED.value).toBe(ChatStatusEnum.CLOSED);
      expect(ChatStatus.TRANSFERRED.value).toBe(ChatStatusEnum.TRANSFERRED);
      expect(ChatStatus.ABANDONED.value).toBe(ChatStatusEnum.ABANDONED);
    });
  });
});
