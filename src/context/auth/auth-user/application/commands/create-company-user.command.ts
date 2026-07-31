export class CreateCompanyUserCommand {
  constructor(
    public readonly companyId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly roles: string[],
  ) {}
}
