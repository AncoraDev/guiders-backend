export class UpdateCompanyUserCommand {
  constructor(
    public readonly companyId: string,
    public readonly userId: string,
    public readonly name?: string,
    public readonly roles?: string[],
    public readonly email?: string,
    public readonly password?: string,
  ) {}
}
