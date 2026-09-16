export class UpdateUserCannedRepliesCommand {
  constructor(
    public readonly userId: string,
    public readonly items: unknown,
  ) {}
}
