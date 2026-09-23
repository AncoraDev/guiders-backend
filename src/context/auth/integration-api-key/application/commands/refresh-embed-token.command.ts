export class RefreshEmbedTokenCommand {
  constructor(
    public readonly token: string,
    public readonly expectedUserId?: string,
    public readonly apiKeyCompanyId?: string,
    // Story 2.2: audit context (extracted from request by controller)
    public readonly origin: string = '',
    public readonly ipAddress: string = '',
    public readonly userAgent: string = '',
  ) {}
}
