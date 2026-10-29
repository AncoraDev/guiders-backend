export class UnblockVisitorCommand {
  constructor(
    public readonly visitorId: string,
    public readonly companyId: string,
    public readonly actorId: string,
    public readonly actorName: string,
    public readonly actorRoles: string[],
  ) {}
}
