export class RenewCommercialPresenceCommand {
  constructor(
    public readonly commercialId: string,
    public readonly companyId?: string,
  ) {}
}
