import { CreateCompanyWithAdminProps } from 'src/context/company/application/commands/create-company-with-admin.command';

export class CreateManagedCompanyCommand {
  constructor(
    public readonly providerCompanyId: string,
    public readonly props: CreateCompanyWithAdminProps,
  ) {}
}
