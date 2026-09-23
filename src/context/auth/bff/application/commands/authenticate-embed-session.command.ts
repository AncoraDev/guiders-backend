/**
 * Command para establecer una BFF session a partir de un embed token.
 *
 * El `embedToken` viene del `EmbedTokenGuard` (header `Authorization: Bearer`).
 * Los campos `expectedUserId` y `expectedCompanyId` son OPCIONALES y
 * vienen del body — defense-in-depth (validan match con el token).
 *
 * Story 2.2: agregamos origin, ipAddress, userAgent para audit log.
 */

export class AuthenticateEmbedSessionCommand {
  constructor(
    public readonly embedToken: string,
    public readonly expectedUserId?: string,
    public readonly expectedCompanyId?: string,
    public readonly origin: string = '',
    public readonly ipAddress: string = '',
    public readonly userAgent: string = '',
  ) {}
}
