export class RemoveManagedCompanyCommand {
  constructor(
    public readonly providerCompanyId: string,
    public readonly companyId: string,
  ) {}
}
