import { ICommand } from '@nestjs/cqrs';

export class CancelContactDataCommand implements ICommand {
  constructor(
    public readonly chatId: string,
    public readonly visitorId: string,
  ) {}
}
