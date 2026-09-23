export class TestCompanyLeadCaptureNotifyCommand {
  constructor(
    public readonly companyId: string,
    public readonly email?: string,
    public readonly from?: string,
    public readonly apiKey?: string,
  ) {}
}
