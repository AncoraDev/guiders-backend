/**
 * Command que orquesta la revocación en cascada de una BFF session
 * y su embed token padre.
 *
 * Story 2.3: el iframe llama a `POST /bff/auth/logout` con la cookie
 * `access_token`. El handler:
 *  1. Lee la session de Redis
 *  2. Borra la BFF session
 *  3. Borra el embed token (vía embedTokenRef)
 *  4. Emite evento de auditoría (success/failure)
 *
 * El sessionId viene del controller (extraído de la cookie `access_token`).
 * El ipAddress/userAgent/origin vienen de los headers HTTP.
 */
export class LogoutCommand {
  constructor(
    public readonly sessionId: string,
    public readonly ipAddress: string,
    public readonly userAgent: string,
    public readonly origin: string,
  ) {}
}
