import { RefreshEmbedTokenCommand } from '../refresh-embed-token.command';

/**
 * Tests para `RefreshEmbedTokenCommand`.
 *
 * Command DTO inmutable que transporta el `token` desde el controller
 * hasta el handler. Sigue el patrón de los demás commands del módulo
 * (constructor + campo readonly público).
 */
describe('RefreshEmbedTokenCommand', () => {
  it('debería exponer el token en un campo público readonly', () => {
    // Arrange
    const token = 'a'.repeat(43); // base64url 43 chars

    // Act
    const command = new RefreshEmbedTokenCommand(token);

    // Assert
    expect(command.token).toBe(token);
  });

  it('debería preservar el valor exacto del token pasado al constructor', () => {
    // Arrange
    const token = 'XyZ_-0123456789abcdefghijklmnopqrstuvwxyzABCDEF';

    // Act
    const command = new RefreshEmbedTokenCommand(token);

    // Assert
    expect(command.token).toBe(token);
    expect(command.token).toHaveLength(token.length);
  });
});
