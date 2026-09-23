import { CreateEmbedTokenCommand } from '../create-embed-token.command';
import { Uuid } from 'src/context/shared/domain/value-objects/uuid';

/**
 * Tests para `CreateEmbedTokenCommand`.
 *
 * Command DTO inmutable que transporta `userId` y `companyId` desde el
 * controller hasta el handler. Sigue el patrón de los demás commands
 * del módulo (constructor + campos readonly públicos).
 */
describe('CreateEmbedTokenCommand', () => {
  it('debería exponer userId y companyId en campos públicos readonly', () => {
    // Arrange
    const userId = Uuid.random().value;
    const companyId = Uuid.random().value;

    // Act
    const command = new CreateEmbedTokenCommand(userId, companyId);

    // Assert
    expect(command.userId).toBe(userId);
    expect(command.companyId).toBe(companyId);
  });

  it('debería preservar distintos valores para userId y companyId', () => {
    // Arrange
    const userId = Uuid.random().value;
    const companyId = Uuid.random().value;
    expect(userId).not.toBe(companyId);

    // Act
    const command = new CreateEmbedTokenCommand(userId, companyId);

    // Assert
    expect(command.userId).not.toBe(command.companyId);
  });
});
