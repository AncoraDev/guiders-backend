export class RemoveCommercialFromExternalCommand {
  constructor(
    public readonly companyId: string,
    public readonly externalUserId: string,
  ) {}
}
