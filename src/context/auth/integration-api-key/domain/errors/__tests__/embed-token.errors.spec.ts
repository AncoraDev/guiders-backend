import { EmbedTokenForbiddenError } from '../embed-token.errors';

/**
 * Tests para el nuevo error `EmbedTokenForbiddenError` introducido en Story 1.3.
 *
 * Esta clase se usa en el command handler y en el controller para
 * representar 403 con códigos de aplicación: `EMBED_DISABLED_FOR_TENANT`,
 * `EMBED_USER_NOT_IN_TENANT`, `EMBED_TENANT_MISMATCH`.
 *
 * El campo `code` se lee en el controller para mapear el error al cuerpo
 * HTTP 403.
 */
describe('EmbedTokenForbiddenError', () => {
  it('debería ser una instancia de DomainError', () => {
    // Arrange
    const error = new EmbedTokenForbiddenError('EMBED_DISABLED_FOR_TENANT');

    // Act + Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmbedTokenForbiddenError');
  });

  it('debería exponer el code EMBED_DISABLED_FOR_TENANT cuando se construye con ese código', () => {
    // Arrange
    const code = 'EMBED_DISABLED_FOR_TENANT';

    // Act
    const error = new EmbedTokenForbiddenError(code);

    // Assert
    expect(error.code).toBe(code);
  });

  it('debería exponer el code EMBED_USER_NOT_IN_TENANT cuando se construye con ese código', () => {
    // Arrange
    const code = 'EMBED_USER_NOT_IN_TENANT';

    // Act
    const error = new EmbedTokenForbiddenError(code);

    // Assert
    expect(error.code).toBe(code);
  });

  it('debería exponer el code EMBED_TENANT_MISMATCH cuando se construye con ese código', () => {
    // Arrange
    const code = 'EMBED_TENANT_MISMATCH';

    // Act
    const error = new EmbedTokenForbiddenError(code);

    // Assert
    expect(error.code).toBe(code);
  });

  it('debería incluir el code en el message para depuración', () => {
    // Arrange
    const code = 'EMBED_DISABLED_FOR_TENANT';

    // Act
    const error = new EmbedTokenForbiddenError(code);

    // Assert
    expect(error.message).toContain(code);
  });

  it('debería ser identificable mediante instanceof', () => {
    // Arrange
    const error = new EmbedTokenForbiddenError('EMBED_USER_NOT_IN_TENANT');

    // Act + Assert
    expect(error instanceof EmbedTokenForbiddenError).toBe(true);
  });

  it('debería aceptar un message opcional además del code', () => {
    // Arrange
    const code = 'EMBED_DISABLED_FOR_TENANT';
    const customMessage = 'El tenant no tiene embed habilitado en producción';

    // Act
    const error = new EmbedTokenForbiddenError(code, customMessage);

    // Assert
    expect(error.code).toBe(code);
    expect(error.message).toContain(customMessage);
  });
});
