export class DeleteCompanyUserCommand {
  constructor(
    public readonly companyId: string,
    public readonly userId: string,
    public readonly actorUserId: string,
    public readonly actorKeycloakId: string | null,
  ) {}
}
