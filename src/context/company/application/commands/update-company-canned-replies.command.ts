export class UpdateCompanyCannedRepliesCommand {
  constructor(
    public readonly companyId: string,
    public readonly items: unknown,
  ) {}
}
