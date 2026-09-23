import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { EmbedTokenGuard, EmbedTokenRequest } from '../embed-token.guard';

/**
 * Crea un ExecutionContext simulado con headers y body básicos.
 * El request retornado es mutable para que el guard pueda inyectar
 * `req.embedToken`.
 */
function createMockContext(
  headers: Record<string, string | string[] | undefined> = {},
): {
  context: ExecutionContext;
  request: EmbedTokenRequest;
} {
  const request = {
    method: 'POST',
    url: '/v2/integration/embed/refresh',
    headers,
    cookies: {},
  } as unknown as EmbedTokenRequest;

  const context = {
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('EmbedTokenGuard', () => {
  let guard: EmbedTokenGuard;

  beforeEach(() => {
    guard = new EmbedTokenGuard();
  });

  describe('extracción del header Authorization', () => {
    it('debería lanzar UnauthorizedException cuando el header Authorization no está presente', () => {
      // Arrange
      const { context } = createMockContext({});

      // Act + Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException con code EMBED_TOKEN_MISSING cuando no hay header', () => {
      // Arrange
      const { context } = createMockContext({});

      // Act + Assert
      try {
        guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        // El guard anida el error en la response (NestJS extrae message/code)
        const response = (err as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('EMBED_TOKEN_MISSING');
      }
    });

    it('debería lanzar UnauthorizedException cuando el header no empieza con "Bearer "', () => {
      // Arrange
      const { context } = createMockContext({
        authorization: 'Basic dXNlcjpwYXNz',
      });

      // Act + Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException cuando el header tiene solo "Bearer" sin espacio', () => {
      // Arrange
      const { context } = createMockContext({
        authorization: 'Bearer',
      });

      // Act + Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException con code EMBED_TOKEN_INVALID cuando el formato no es base64url de 43 chars', () => {
      // Arrange
      const { context } = createMockContext({
        authorization: 'Bearer short-token',
      });

      // Act + Assert
      try {
        guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('EMBED_TOKEN_INVALID');
      }
    });

    it('debería lanzar UnauthorizedException con code EMBED_TOKEN_INVALID cuando el token tiene longitud != 43', () => {
      // Arrange
      const { context } = createMockContext({
        authorization: 'Bearer ' + 'a'.repeat(50), // 50 chars, excede 43
      });

      // Act + Assert
      try {
        guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('EMBED_TOKEN_INVALID');
      }
    });

    it('debería lanzar UnauthorizedException con code EMBED_TOKEN_INVALID cuando el token tiene caracteres no permitidos', () => {
      // Arrange
      const { context } = createMockContext({
        authorization: 'Bearer ' + '!'.repeat(43),
      });

      // Act + Assert
      try {
        guard.canActivate(context);
        fail('Debería haber lanzado UnauthorizedException');
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedException);
        const response = (err as UnauthorizedException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.code).toBe('EMBED_TOKEN_INVALID');
      }
    });
  });

  describe('inyección en req.embedToken y retorno', () => {
    it('debería inyectar el token en req.embedToken cuando el header es válido', () => {
      // Arrange
      const VALID_TOKEN = 'XyZ_-0123456789abcdefghijklmnopqrstuvwxyzAB';
      const { context, request } = createMockContext({
        authorization: `Bearer ${VALID_TOKEN}`,
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(request.embedToken).toBe(VALID_TOKEN);
    });

    it('debería retornar true con un token base64url válido de 43 chars', () => {
      // Arrange
      const VALID_TOKEN = 'XyZ_-0123456789abcdefghijklmnopqrstuvwxyzAB';
      const { context } = createMockContext({
        authorization: `Bearer ${VALID_TOKEN}`,
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });
});
