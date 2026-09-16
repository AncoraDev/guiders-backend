import { ICommand } from '@nestjs/cqrs';

export class RequestContactDataCommand implements ICommand {
  constructor(
    public readonly chatId: string,
    public readonly commercialId: string,
  ) {}
}
