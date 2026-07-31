export class UpdateCompanyUserCommand {
  constructor(
    public readonly companyId: string,
    public readonly userId: string,
    public readonly name?: string,
    public readonly roles?: string[],
  ) {}
}
