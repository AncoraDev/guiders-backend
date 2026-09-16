export class UpdateUserGreetingMessageCommand {
  constructor(
    public readonly userId: string,
    public readonly greetingMessage: string | null,
  ) {}
}
