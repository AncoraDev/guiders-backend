export interface UpdateCompanySiteParams {
  id?: string;
  name: string;
  canonicalDomain: string;
  domainAliases: string[];
}

export class UpdateCompanyCommand {
  constructor(
    public readonly companyId: string,
    public readonly companyName: string,
    public readonly sites: UpdateCompanySiteParams[],
  ) {}
}
