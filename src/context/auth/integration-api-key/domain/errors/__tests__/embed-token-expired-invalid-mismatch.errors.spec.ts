import {
  EmbedTokenExpiredError,
  EmbedTokenInvalidError,
  EmbedTokenUserMismatchError,
} from '../embed-token.errors';

/**
 * Tests para los nuevos errores introducidos en Story 1.4:
 * - EmbedTokenExpiredError (code: EMBED_TOKEN_EXPIRED)
 * - EmbedTokenInvalidError (code: EMBED_TOKEN_INVALID)
 * - EmbedTokenUserMismatchError (code: EMBED_TOKEN_USER_MISMATCH)
 *
 * Estos errores los usa el RefreshEmbedTokenCommandHandler y los traduce
 * el controller a HTTP 401/403. A diferencia de EmbedTokenForbiddenError
 * (que ya existía en Story 1.3), estos errores tienen un `code` directo en
 * la instancia y un mensaje legible.
 */
describe('EmbedTokenExpiredError', () => {
  it('debería ser una instancia de DomainError', () => {
    // Arrange + Act
    const error = new EmbedTokenExpiredError();

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmbedTokenExpiredError');
  });

  it('debería exponer el code EMBED_TOKEN_EXPIRED', () => {
    // Arrange + Act
    const error = new EmbedTokenExpiredError();

    // Assert
    expect(error.code).toBe('EMBED_TOKEN_EXPIRED');
  });

  it('debería ser identificable mediante instanceof', () => {
    // Arrange + Act
    const error = new EmbedTokenExpiredError();

    // Assert
    expect(error instanceof EmbedTokenExpiredError).toBe(true);
  });

  it('debería incluir un message legible', () => {
    // Arrange + Act
    const error = new EmbedTokenExpiredError();

    // Assert
    expect(error.message).toBeDefined();
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe('EmbedTokenInvalidError', () => {
  it('debería ser una instancia de DomainError', () => {
    // Arrange + Act
    const error = new EmbedTokenInvalidError();

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmbedTokenInvalidError');
  });

  it('debería exponer el code EMBED_TOKEN_INVALID', () => {
    // Arrange + Act
    const error = new EmbedTokenInvalidError();

    // Assert
    expect(error.code).toBe('EMBED_TOKEN_INVALID');
  });

  it('debería ser identificable mediante instanceof', () => {
    // Arrange + Act
    const error = new EmbedTokenInvalidError();

    // Assert
    expect(error instanceof EmbedTokenInvalidError).toBe(true);
  });

  it('debería incluir un message legible', () => {
    // Arrange + Act
    const error = new EmbedTokenInvalidError();

    // Assert
    expect(error.message).toBeDefined();
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });
});

describe('EmbedTokenUserMismatchError', () => {
  it('debería ser una instancia de DomainError', () => {
    // Arrange + Act
    const error = new EmbedTokenUserMismatchError();

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmbedTokenUserMismatchError');
  });

  it('debería exponer el code EMBED_TOKEN_USER_MISMATCH', () => {
    // Arrange + Act
    const error = new EmbedTokenUserMismatchError();

    // Assert
    expect(error.code).toBe('EMBED_TOKEN_USER_MISMATCH');
  });

  it('debería ser identificable mediante instanceof', () => {
    // Arrange + Act
    const error = new EmbedTokenUserMismatchError();

    // Assert
    expect(error instanceof EmbedTokenUserMismatchError).toBe(true);
  });

  it('debería incluir un message legible', () => {
    // Arrange + Act
    const error = new EmbedTokenUserMismatchError();

    // Assert
    expect(error.message).toBeDefined();
    expect(typeof error.message).toBe('string');
    expect(error.message.length).toBeGreaterThan(0);
  });

  it('debería ser distinguible de los demás errores embed token (no es Forbidden)', () => {
    // Arrange
    const userMismatch = new EmbedTokenUserMismatchError();
    const expired = new EmbedTokenExpiredError();
    const invalid = new EmbedTokenInvalidError();

    // Assert: códigos diferentes entre sí
    expect(userMismatch.code).not.toBe(expired.code);
    expect(userMismatch.code).not.toBe(invalid.code);
    expect(expired.code).not.toBe(invalid.code);
  });
});
