export class UpdateCompanyLeadCaptureNotifyCommand {
  constructor(
    public readonly companyId: string,
    public readonly email?: string,
  ) {}
}
