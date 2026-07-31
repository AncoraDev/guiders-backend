export class CreateCompanyUserCommand {
  constructor(
    public readonly companyId: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: string,
    public readonly roles: string[],
    public readonly temporaryPassword: string,
    public readonly phone?: string,
  ) {}
}
