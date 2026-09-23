export class CreateEmbedTokenCommand {
  constructor(
    public readonly userId: string,
    public readonly companyId: string,
    // Story 2.2: audit context (extracted from request by controller)
    public readonly origin: string = '',
    public readonly ipAddress: string = '',
    public readonly userAgent: string = '',
    public readonly endpoint: string = '/v2/integration/embed/start',
  ) {}
}
