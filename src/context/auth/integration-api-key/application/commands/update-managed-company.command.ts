import { UpdateCompanySiteParams } from 'src/context/company/application/commands/update-company.command';

export class UpdateManagedCompanyCommand {
  constructor(
    public readonly providerCompanyId: string,
    public readonly companyId: string,
    public readonly companyName: string,
    public readonly sites: UpdateCompanySiteParams[],
  ) {}
}
