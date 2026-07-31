export class SetCompanyUserActiveCommand {
  constructor(
    public readonly companyId: string,
    public readonly userId: string,
    public readonly actorUserId: string,
    public readonly actorKeycloakId: string | null,
    public readonly isActive: boolean,
  ) {}
}
